"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";

/**
 * إدارة المساعد (adr/0057 ق٢): `programs.write` **بنطاق البرنامج** — من يدير أسئلته الشائعة يدير
 * مساعده. والسياسات تحصر الكتابة بالنطاق نفسه، فهذا الفحص مبكّرٌ لا وحيد.
 */

async function guard(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({ permission: "programs.write", programId, resourceProgramId: programId });
  return authz.ok ? null : { error: authz.message };
}

const answerSchema = z.object({
  programId: z.uuid(),
  question: z.string().trim().min(3, "السؤال مطلوب").max(300, "السؤال لا يزيد عن 300 حرف"),
  answer: z.string().trim().min(2, "الجواب مطلوب").max(1000, "الجواب لا يزيد عن 1000 حرف"),
});

const done = (programId: string, notice: string): FormState => {
  revalidatePath(`/programs/${programId}/ask`);
  return { ...EMPTY_FORM_STATE, notice };
};

/** حلّ تقرير: إجابةٌ معتمدة منشورة وإغلاقه معاً — `fn_ask_resolve` ذرّياً، وتدقيقها فيها. */
export async function resolveReport(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = answerSchema.extend({ reportId: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db.rpc("fn_ask_resolve", {
    p_report_id: parsed.data.reportId,
    p_question: parsed.data.question,
    p_answer: parsed.data.answer,
  });
  if (error) return { error: "تعذّر حفظ الجواب. قد يكون التقرير أُغلق." };
  return done(parsed.data.programId, "حُفظ الجواب ونُشر للمساعد، وأُغلق التقرير.");
}

/** تجاهل تقرير لا يحتاج جواباً (شخصيٌّ أو مكرّر) — أو إعادة فتحه. */
export async function setReportStatus(reportId: string, programId: string, status: "open" | "dismissed"): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("ask_reports")
    .update({ status })
    .eq("id", reportId)
    .eq("program_id", programId)
    .neq("status", "resolved")
    .select("id");
  if (error || !data?.length) return { error: "تعذّر تغيير حال التقرير." };

  await db.rpc("fn_write_audit", {
    p_action: "ask_report_status_changed",
    p_entity_table: "ask_reports",
    p_entity_id: reportId,
    p_after: { status },
  });
  return done(programId, status === "dismissed" ? "تُجوهل التقرير." : "أُعيد فتح التقرير.");
}

export async function addAnswer(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = answerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("ask_answers")
    .insert({ program_id: parsed.data.programId, question: parsed.data.question, answer: parsed.data.answer })
    .select("id");
  if (error || !data?.length) return { error: "تعذّر إضافة الإجابة." };

  await db.rpc("fn_write_audit", {
    p_action: "ask_answer_added",
    p_entity_table: "ask_answers",
    p_entity_id: data[0]!.id,
    p_after: { program_id: parsed.data.programId },
  });
  return done(parsed.data.programId, "أُضيفت الإجابة ونُشرت للمساعد.");
}

export async function editAnswer(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = answerSchema.extend({ id: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("ask_answers")
    .update({ question: parsed.data.question, answer: parsed.data.answer })
    .eq("id", parsed.data.id)
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حفظ التعديل." };

  await db.rpc("fn_write_audit", {
    p_action: "ask_answer_updated",
    p_entity_table: "ask_answers",
    p_entity_id: parsed.data.id,
  });
  return done(parsed.data.programId, "حُفظ التعديل.");
}

/** إيقاف الإجابة عن المساعد أو نشرها له — بلا حذف. */
export async function setAnswerStatus(id: string, programId: string, status: "draft" | "published"): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("ask_answers")
    .update({ status })
    .eq("id", id)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر تغيير حال الإجابة." };

  await db.rpc("fn_write_audit", {
    p_action: "ask_answer_updated",
    p_entity_table: "ask_answers",
    p_entity_id: id,
    p_after: { status },
  });
  return done(programId, status === "published" ? "نُشرت للمساعد." : "أُوقفت عن المساعد.");
}

/** حذفٌ ليّن — والتقرير الذي حلّته يبقى «محلولاً» ويشير إليها. */
export async function removeAnswer(id: string, programId: string): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("ask_answers")
    .update({ deleted_at: nowIso() })
    .eq("id", id)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حذف الإجابة." };

  await db.rpc("fn_write_audit", {
    p_action: "ask_answer_removed",
    p_entity_table: "ask_answers",
    p_entity_id: id,
  });
  return done(programId, "حُذفت الإجابة.");
}
