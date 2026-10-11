"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import type { Json } from "@/lib/db/database.types";

/**
 * الاختبار الشفهي (`adr/0048`): الفرز والجلسات ولجانها والإسناد، ومتابعة
 * التحكيم. صلاحيتها `exams.manage`، والحكم كلّه في دوالّ القاعدة.
 */
async function guard(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({ permission: "exams.manage", programId, resourceProgramId: programId });
  return authz.ok ? null : { error: authz.message };
}

const ARABIC = /[؀-ۿ]/;
const message = (error: { message: string } | null, fallback: string) =>
  error && ARABIC.test(error.message) ? (error.message.endsWith(".") ? error.message : `${error.message}.`) : fallback;

const path = (programId: string, examId: string) => revalidatePath(`/programs/${programId}/exams/${examId}`);
const ids = (o: Record<string, string>) => z.record(z.string(), z.uuid()).safeParse(o).success;

export async function applySorting(
  programId: string,
  examId: string,
  overrides: Record<string, boolean>,
): Promise<FormState> {
  if (!ids({ programId, examId }) || !z.record(z.uuid(), z.boolean()).safeParse(overrides).success) {
    return { error: "بيانات الفرز غير صالحة." };
  }
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { data, error } = await db.rpc("fn_apply_sorting", { p_exam_id: examId, p_overrides: overrides as Json });
  if (error) return { error: message(error, "تعذّر حسم الفرز.") };
  path(programId, examId);
  const r = data?.[0];
  return { notice: `حُسم الفرز: ${r?.qualified ?? 0} متأهلاً و${r?.not_qualified ?? 0} غير متأهل.` };
}

const sessionSchema = z.object({
  programId: z.uuid(),
  examId: z.uuid(),
  name: z.string().trim().min(2, "اسم الجلسة مطلوب").max(80, "لا يزيد عن 80 حرفاً"),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختر اليوم"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "اختر الوقت"),
  location: z.string().trim().max(200, "لا يزيد عن 200 حرف").default(""),
});

export async function createSession(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = sessionSchema.safeParse({
    programId: form.get("programId"),
    examId: form.get("examId"),
    name: form.get("name"),
    day: form.get("day"),
    time: form.get("time"),
    location: form.get("location") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const v = parsed.data;
  const denied = await guard(v.programId);
  if (denied) return denied;

  const db = await createClient();
  // الرياض +03:00 طوال السنة — لا توقيت صيفي.
  const { error } = await db.from("exam_sessions").insert({
    exam_id: v.examId,
    name: v.name,
    scheduled_at: `${v.day}T${v.time}:00+03:00`,
    location: v.location,
  });
  if (error) return { error: "تعذّر إنشاء الجلسة." };
  path(v.programId, v.examId);
  return { notice: "أُنشئت الجلسة." };
}

export async function archiveSession(programId: string, examId: string, sessionId: string): Promise<FormState> {
  if (!ids({ programId, examId, sessionId })) return { error: "جلسة غير معروفة." };
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { count } = await db
    .from("session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) return { error: "في الجلسة مشاركون — انقلهم أولاً." };
  const { error } = await db.from("exam_sessions").update({ deleted_at: nowIso() }).eq("id", sessionId);
  if (error) return { error: "تعذّر حذف الجلسة." };
  path(programId, examId);
  return EMPTY_FORM_STATE;
}

export async function setJudge(
  programId: string,
  examId: string,
  sessionId: string,
  userId: string,
  assign: boolean,
): Promise<FormState> {
  if (!ids({ programId, examId, sessionId, userId })) return { error: "محكّم غير معروف." };
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_set_session_judge", { p_session_id: sessionId, p_user_id: userId, p_assign: assign });
  if (error) return { error: message(error, "تعذّر تعديل اللجنة.") };
  path(programId, examId);
  return EMPTY_FORM_STATE;
}

export async function distribute(programId: string, examId: string): Promise<FormState> {
  if (!ids({ programId, examId })) return { error: "اختبار غير معروف." };
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { data, error } = await db.rpc("fn_distribute_participants", { p_exam_id: examId });
  if (error) return { error: message(error, "تعذّر التوزيع.") };
  path(programId, examId);
  return { notice: data ? `أُسند ${data} مشاركاً إلى الجلسات.` : "لا متأهلين ينتظرون الإسناد." };
}

export async function moveParticipant(
  programId: string,
  examId: string,
  sessionId: string,
  participantId: string,
): Promise<FormState> {
  if (!ids({ programId, examId, sessionId, participantId })) return { error: "إسناد غير صالح." };
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_move_participant", { p_session_id: sessionId, p_participant_id: participantId });
  if (error) return { error: message(error, "تعذّر النقل.") };
  path(programId, examId);
  return { notice: "نُقل المشارك." };
}

export async function reopenEvaluation(
  programId: string,
  examId: string,
  sessionId: string,
  participantId: string,
  judgeId: string,
  reason: string,
): Promise<FormState> {
  if (!ids({ programId, examId, sessionId, participantId, judgeId }) || reason.trim().length < 3 || reason.length > 200) {
    return { error: "اذكر سبب إعادة الفتح." };
  }
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_reopen_evaluation", {
    p_session_id: sessionId,
    p_participant_id: participantId,
    p_judge_id: judgeId,
    p_reason: reason.trim(),
  });
  if (error) return { error: message(error, "تعذّرت إعادة الفتح.") };
  path(programId, examId);
  return { notice: "أُعيد فتح التقييم للمحكّم." };
}
