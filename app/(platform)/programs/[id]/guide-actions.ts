"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";

/**
 * سجل تحديثات الدليل (خطة دليل المشارك · د) — سطورٌ قصيرة بتاريخها تظهر في دليل المشارك.
 * الصلاحية `programs.write` بنطاق البرنامج كعناصر الصفحة، والحذف ناعم (لا سياسة DELETE).
 */

async function guard(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  return authz.ok ? null : { error: authz.message };
}

const updateSchema = z.object({
  programId: z.uuid(),
  entryDate: z.iso.date("اختر تاريخاً صحيحاً"),
  body: z
    .string()
    .trim()
    .min(5, "اكتب التحديث في خمسة أحرف فأكثر")
    .max(160, "التحديث لا يزيد عن 160 حرفاً"),
});

function parse(form: FormData) {
  return updateSchema.safeParse({
    programId: form.get("programId"),
    entryDate: form.get("entryDate"),
    body: form.get("body"),
  });
}

function refresh(programId: string) {
  revalidatePath(`/programs/${programId}/page`);
  // الدليل ديناميكي، لكن لا ضرر في إبطال ما قد يُخزَّن من الواجهة.
  revalidatePath("/p/[slug]/guide", "page");
}

export async function addGuideUpdate(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parse(form);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("guide_updates")
    .insert({ program_id: parsed.data.programId, entry_date: parsed.data.entryDate, body: parsed.data.body })
    .select("id")
    .single();
  if (error || !data) return { error: "تعذّر إضافة التحديث." };

  await db.rpc("fn_write_audit", {
    p_action: "guide_update_added",
    p_entity_table: "guide_updates",
    p_entity_id: data.id,
    p_after: { program_id: parsed.data.programId, entry_date: parsed.data.entryDate },
  });

  refresh(parsed.data.programId);
  return { notice: "أُضيف التحديث إلى الدليل." };
}

export async function editGuideUpdate(_prev: FormState, form: FormData): Promise<FormState> {
  const entryId = String(form.get("entryId") ?? "");
  if (!z.uuid().safeParse(entryId).success) return { error: "تحديث غير معروف." };

  const parsed = parse(form);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("guide_updates")
    .update({ entry_date: parsed.data.entryDate, body: parsed.data.body })
    .eq("id", entryId)
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حفظ التحديث." };

  await db.rpc("fn_write_audit", {
    p_action: "guide_update_updated",
    p_entity_table: "guide_updates",
    p_entity_id: entryId,
  });

  refresh(parsed.data.programId);
  return { notice: "حُفظ التحديث." };
}

export async function removeGuideUpdate(entryId: string, programId: string): Promise<FormState> {
  if (!z.uuid().safeParse(entryId).success || !z.uuid().safeParse(programId).success) {
    return { error: "تحديث غير معروف." };
  }
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("guide_updates")
    .update({ deleted_at: nowIso() })
    .eq("id", entryId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حذف التحديث." };

  await db.rpc("fn_write_audit", {
    p_action: "guide_update_removed",
    p_entity_table: "guide_updates",
    p_entity_id: entryId,
  });

  refresh(programId);
  return EMPTY_FORM_STATE;
}
