"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import { blockInput } from "@/lib/programs/block-input";
import { renumber } from "@/lib/programs/reorder";
import { BLOCK_SCHEMAS, isBlockType, type BlockType } from "@/lib/programs/blocks";

/**
 * إجراءات صفحة البرنامج المعلن وسجل المساعدة.
 * الصفحة تتبع برنامجها، فالصلاحية `programs.write` **بنطاق البرنامج** —
 * لا رمز مستقل: مدخل بلا حارس يستهلكه صلاحية بصرية معكوسة.
 */

async function guard(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  return authz.ok ? null : { error: authz.message };
}

const helpSchema = z.object({
  programId: z.uuid(),
  question: z.string().trim().min(5, "السؤال مطلوب"),
  answer: z.string().trim().min(5, "الجواب مطلوب"),
  category: z.string().trim().max(60, "اسم المجموعة لا يزيد عن ٦٠ حرفاً").default(""),
});

/** حقول المحتوى كما تصل من النموذج — واحدةٌ للإضافة والتعديل، فلا تفترقان. */
function blockContent(type: BlockType, form: FormData) {
  return BLOCK_SCHEMAS[type].safeParse(blockInput(type, form));
}

export async function addBlock(_prev: FormState, form: FormData): Promise<FormState> {
  const programId = String(form.get("programId") ?? "");
  const rawType = String(form.get("blockType") ?? "");

  // الصورة لا تُعرض دون رفع الصور، فلا تُضاف عنصراً يبقى فارغاً في الصفحة.
  if (!isBlockType(rawType) || rawType === "image") return { error: "اختر نوع العنصر من القائمة." };
  const type: BlockType = rawType;

  // المحتوى يُتحقَّق بمخطّط نوعه — لا مخطّط عام يقبل كل شيء.
  const content = blockContent(type, form);
  if (!content.success) return { fieldErrors: toFieldErrors(content.error.issues) };

  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data: last } = await db
    .from("page_blocks")
    .select("sort_order")
    .eq("program_id", programId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db.from("page_blocks").insert({
    program_id: programId,
    block_type: type,
    sort_order: (last?.sort_order ?? -1) + 1,
    content: content.data,
  });
  if (error) return { error: "تعذّر إضافة العنصر." };

  await db.rpc("fn_write_audit", {
    p_action: "page_block_added",
    p_entity_table: "page_blocks",
    p_after: { program_id: programId, block_type: type },
  });

  revalidatePath(`/programs/${programId}/page`);
  return { notice: "أُضيف العنصر." };
}

/**
 * تعديل محتوى عنصرٍ قائم.
 *
 * **ولم يكن في المنصة سبيلٌ إليه:** من أراد تصحيح حرفٍ في ترويسة حذفها وأعاد
 * كتابتها، فتذهب إلى آخر الصفحة ويُعاد ترتيبها. والنوع لا يُغيَّر — تغييره
 * يُبطل المحتوى كلَّه، فالأصحّ حذفٌ وإضافة.
 */
export async function editBlock(_prev: FormState, form: FormData): Promise<FormState> {
  const programId = String(form.get("programId") ?? "");
  const blockId = String(form.get("blockId") ?? "");
  const rawType = String(form.get("blockType") ?? "");

  if (!z.uuid().safeParse(blockId).success) return { error: "عنصر غير معروف." };
  if (!isBlockType(rawType)) return { error: "نوع العنصر غير معروف." };

  const content = blockContent(rawType, form);
  if (!content.success) return { fieldErrors: toFieldErrors(content.error.issues) };

  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("page_blocks")
    .update({ content: content.data })
    .eq("id", blockId)
    .eq("program_id", programId)
    .eq("block_type", rawType)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حفظ العنصر." };

  await db.rpc("fn_write_audit", {
    p_action: "page_block_updated",
    p_entity_table: "page_blocks",
    p_entity_id: blockId,
    p_after: { block_type: rawType },
  });

  revalidatePath(`/programs/${programId}/page`);
  return { notice: "حُفظ العنصر." };
}

export async function removeBlock(blockId: string, programId: string): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("page_blocks")
    .update({ deleted_at: nowIso() })
    .eq("id", blockId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حذف العنصر." };

  await db.rpc("fn_write_audit", {
    p_action: "page_block_removed",
    p_entity_table: "page_blocks",
    p_entity_id: blockId,
  });

  revalidatePath(`/programs/${programId}/page`);
  return EMPTY_FORM_STATE;
}

export async function moveBlock(
  blockId: string,
  programId: string,
  direction: "up" | "down",
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("page_blocks")
    .select("id, sort_order")
    .eq("program_id", programId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");

  // خطأ القراءة كان يُبتلع فيُبلَّغ نجاحاً صامتاً — وهو ما بُني `ActionNotice` لمنعه.
  if (error || !data) return { error: "تعذّر تحريك العنصر." };
  if (!(await renumber(db, "page_blocks", data, blockId, direction))) {
    return { error: "تعذّر تحريك العنصر." };
  }

  revalidatePath(`/programs/${programId}/page`);
  return EMPTY_FORM_STATE;
}

export async function addHelpEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = helpSchema.safeParse({
    programId: form.get("programId"),
    question: form.get("question"),
    answer: form.get("answer"),
    category: form.get("category") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  // الترتيب يُحسب ولا يُترك صفراً: الصفحة العامة ترتّب به، وكلها صفرٌ ترتيبٌ بلا معنى.
  const { data: last } = await db
    .from("help_entries")
    .select("sort_order")
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from("help_entries")
    .insert({
      program_id: parsed.data.programId,
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id");
  if (error || !data?.length) return { error: "تعذّر إضافة السؤال." };

  await db.rpc("fn_write_audit", {
    p_action: "help_entry_added",
    p_entity_table: "help_entries",
    p_entity_id: data[0]!.id,
    p_after: { program_id: parsed.data.programId },
  });

  revalidatePath(`/programs/${parsed.data.programId}/faq`);
  return { notice: "أُضيف السؤال كمسوّدة. انشره ليظهر في الصفحة المعلنة." };
}

export async function editHelpEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const entryId = String(form.get("entryId") ?? "");
  if (!z.uuid().safeParse(entryId).success) return { error: "سؤال غير معروف." };

  const parsed = helpSchema.safeParse({
    programId: form.get("programId"),
    question: form.get("question"),
    answer: form.get("answer"),
    category: form.get("category") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("help_entries")
    .update({
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category,
    })
    .eq("id", entryId)
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حفظ السؤال." };

  await db.rpc("fn_write_audit", {
    p_action: "help_entry_updated",
    p_entity_table: "help_entries",
    p_entity_id: entryId,
  });

  revalidatePath(`/programs/${parsed.data.programId}/faq`);
  return { notice: "حُفظ السؤال." };
}

export async function removeHelpEntry(entryId: string, programId: string): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("help_entries")
    .update({ deleted_at: nowIso() })
    .eq("id", entryId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حذف السؤال." };

  await db.rpc("fn_write_audit", {
    p_action: "help_entry_removed",
    p_entity_table: "help_entries",
    p_entity_id: entryId,
  });

  revalidatePath(`/programs/${programId}/faq`);
  return EMPTY_FORM_STATE;
}

export async function moveHelpEntry(
  entryId: string,
  programId: string,
  direction: "up" | "down",
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("help_entries")
    .select("id, sort_order")
    .eq("program_id", programId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");

  if (error || !data) return { error: "تعذّر تحريك السؤال." };
  if (!(await renumber(db, "help_entries", data, entryId, direction))) {
    return { error: "تعذّر تحريك السؤال." };
  }

  revalidatePath(`/programs/${programId}/faq`);
  return EMPTY_FORM_STATE;
}

export async function setHelpStatus(
  entryId: string,
  programId: string,
  status: "draft" | "published",
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("help_entries")
    .update({ status })
    .eq("id", entryId)
    .eq("program_id", programId)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر تغيير حالة النشر." };

  // النشر يغيّر ما يراه الزائر، فيُكتب كما يُكتب نشر البرنامج.
  await db.rpc("fn_write_audit", {
    p_action: "help_entry_updated",
    p_entity_table: "help_entries",
    p_entity_id: entryId,
    p_after: { status },
  });

  revalidatePath(`/programs/${programId}/faq`);
  return EMPTY_FORM_STATE;
}
