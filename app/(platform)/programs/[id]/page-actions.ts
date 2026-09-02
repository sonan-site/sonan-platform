"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
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
});

export async function addBlock(_prev: FormState, form: FormData): Promise<FormState> {
  const programId = String(form.get("programId") ?? "");
  const rawType = String(form.get("blockType") ?? "");

  if (!isBlockType(rawType)) return { error: "نوع عنصر غير معروف." };
  const type: BlockType = rawType;

  // المحتوى يُتحقَّق بمخطّط نوعه — لا مخطّط عام يقبل كل شيء.
  const content = BLOCK_SCHEMAS[type].safeParse({
    title: form.get("title") ?? undefined,
    subtitle: form.get("subtitle") ?? undefined,
    heading: form.get("heading") ?? undefined,
    text: form.get("text") ?? undefined,
    alt: form.get("alt") ?? undefined,
    attachmentId: form.get("attachmentId") ?? undefined,
    buttonLabel: form.get("buttonLabel") ?? undefined,
    showCapacity: form.get("showCapacity") === "on",
  });
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

  revalidatePath(`/programs/${programId}`);
  return { notice: "أُضيف العنصر." };
}

export async function removeBlock(blockId: string, programId: string): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db
    .from("page_blocks")
    .update({ deleted_at: nowIso() })
    .eq("id", blockId);
  if (error) return { error: "تعذّر حذف العنصر." };

  await db.rpc("fn_write_audit", {
    p_action: "page_block_removed",
    p_entity_table: "page_blocks",
    p_entity_id: blockId,
  });

  revalidatePath(`/programs/${programId}`);
  return EMPTY_FORM_STATE;
}

/** التحريك بتبادل الترتيب مع الجار — لا إعادة ترقيم للقائمة كلها. */
export async function moveBlock(
  blockId: string,
  programId: string,
  direction: "up" | "down",
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data: blocks } = await db
    .from("page_blocks")
    .select("id, sort_order")
    .eq("program_id", programId)
    .is("deleted_at", null)
    .order("sort_order");

  const list = blocks ?? [];
  const index = list.findIndex((b) => b.id === blockId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= list.length) return EMPTY_FORM_STATE;

  const a = list[index]!;
  const b = list[target]!;
  await db.from("page_blocks").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("page_blocks").update({ sort_order: a.sort_order }).eq("id", b.id);

  revalidatePath(`/programs/${programId}`);
  return EMPTY_FORM_STATE;
}

export async function addHelpEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = helpSchema.safeParse({
    programId: form.get("programId"),
    question: form.get("question"),
    answer: form.get("answer"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db.from("help_entries").insert({
    program_id: parsed.data.programId,
    question: parsed.data.question,
    answer: parsed.data.answer,
  });
  if (error) return { error: "تعذّر إضافة السؤال." };

  revalidatePath(`/programs/${parsed.data.programId}`);
  return { notice: "أُضيف السؤال كمسوّدة. انشره ليظهر في الصفحة المعلنة." };
}

export async function setHelpStatus(
  entryId: string,
  programId: string,
  status: "draft" | "published",
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db.from("help_entries").update({ status }).eq("id", entryId);
  if (error) return { error: "تعذّر تغيير حالة النشر." };

  revalidatePath(`/programs/${programId}`);
  return EMPTY_FORM_STATE;
}
