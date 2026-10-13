"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import type { FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";

/**
 * نتائج النهائي (`adr/0048` هـ · الدفعة د): الحسم والاعتماد بصلاحية `exams.manage`،
 * والنشر بصلاحية `exams.publish`. والحكم كلّه في دوالّ القاعدة.
 */
async function guard(programId: string, permission: "exams.manage" | "exams.publish"): Promise<FormState | null> {
  const authz = await authorizeRequest({ permission, programId, resourceProgramId: programId });
  return authz.ok ? null : { error: authz.message };
}

const ARABIC = /[؀-ۿ]/;
const message = (error: { message: string } | null, fallback: string) =>
  error && ARABIC.test(error.message) ? (error.message.endsWith(".") ? error.message : `${error.message}.`) : fallback;

const path = (programId: string, examId: string) => {
  revalidatePath(`/programs/${programId}/exams/${examId}/results`);
  revalidatePath(`/programs/${programId}/exams/${examId}`);
};
const ids = (o: Record<string, string>) => z.record(z.string(), z.uuid()).safeParse(o).success;
const reasonOk = (r: string, max = 300) => r.trim().length >= 3 && r.length <= max;

export async function recordTiebreak(
  programId: string,
  examId: string,
  trackId: string,
  percent: number,
  ordered: string[],
  reason: string,
  raw: string,
): Promise<FormState> {
  if (
    !ids({ programId, examId, trackId }) ||
    !z.array(z.uuid()).min(2).max(50).safeParse(ordered).success ||
    !Number.isFinite(percent) ||
    raw.length > 500
  ) {
    return { error: "بيانات الحسم غير صالحة." };
  }
  if (!reasonOk(reason)) return { error: "صِف جولة الحسم: متى أُعيد الاختبار وبأي لجنة." };
  const denied = await guard(programId, "exams.manage");
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_record_tiebreak", {
    p_exam_id: examId,
    p_track_id: trackId,
    p_percent: percent,
    p_ordered: ordered,
    p_reason: reason.trim(),
    p_raw: raw.trim(),
  });
  if (error) return { error: message(error, "تعذّر تسجيل الحسم.") };
  path(programId, examId);
  return { notice: "سُجّل الحسم ورُتّب المتعادلون به." };
}

export async function approveTrack(programId: string, examId: string, trackId: string): Promise<FormState> {
  if (!ids({ programId, examId, trackId })) return { error: "مسار غير معروف." };
  const denied = await guard(programId, "exams.manage");
  if (denied) return denied;
  const db = await createClient();
  const { data, error } = await db.rpc("fn_approve_track_results", { p_exam_id: examId, p_track_id: trackId });
  if (error) return { error: message(error, "تعذّر الاعتماد.") };
  path(programId, examId);
  return { notice: `اعتُمدت نتائج المسار (${data ?? 0} مشاركاً) — وأُقفل تحكيمه.` };
}

export async function withdrawTrack(programId: string, examId: string, trackId: string, reason: string): Promise<FormState> {
  if (!ids({ programId, examId, trackId }) || !reasonOk(reason)) return { error: "اذكر سبب السحب." };
  const denied = await guard(programId, "exams.manage");
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_withdraw_track_results", { p_exam_id: examId, p_track_id: trackId, p_reason: reason.trim() });
  if (error) return { error: message(error, "تعذّر سحب الاعتماد.") };
  path(programId, examId);
  return { notice: "سُحب الاعتماد — وفُتح تحكيم المسار للتصحيح." };
}

/** مساراً — أو كل المسارات معاً إن لم يُحدَّد. */
export async function publishResults(programId: string, examId: string, trackId: string | null): Promise<FormState> {
  if (!ids({ programId, examId }) || (trackId !== null && !ids({ trackId }))) return { error: "اختبار غير معروف." };
  const denied = await guard(programId, "exams.publish");
  if (denied) return denied;
  const db = await createClient();
  const { data, error } = await db.rpc("fn_publish_results", { p_exam_id: examId, p_track_id: trackId ?? undefined });
  if (error) return { error: message(error, "تعذّر النشر.") };
  path(programId, examId);
  return { notice: data ? `نُشرت النتائج (${data} ${data === 1 ? "مسار" : "مسارات"}) — ويراها المشاركون في «رحلتي».` : "النتائج منشورة." };
}

export async function unpublishResults(programId: string, examId: string, trackId: string, reason: string): Promise<FormState> {
  if (!ids({ programId, examId, trackId }) || !reasonOk(reason)) return { error: "اذكر سبب سحب النشر." };
  const denied = await guard(programId, "exams.publish");
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_unpublish_results", { p_exam_id: examId, p_track_id: trackId, p_reason: reason.trim() });
  if (error) return { error: message(error, "تعذّر سحب النشر.") };
  path(programId, examId);
  return { notice: "سُحب النشر — غابت النتيجة عن المشاركين وعادت حالتهم «متأهل»." };
}
