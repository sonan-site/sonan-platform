"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";

/** إجراءات المشاركين وأسئلة القبول وطلبات تغيير المسار. */

async function guardParticipants(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({
    permission: "participants.write",
    programId,
    resourceProgramId: programId,
  });
  return authz.ok ? null : { error: authz.message };
}

// ── أسئلة القبول ──

const questionSchema = z.object({
  programId: z.uuid(),
  question: z.string().trim().min(5, "نصّ السؤال مطلوب"),
  trackId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  isRequired: z.boolean(),
});

export async function addAdmissionQuestion(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = questionSchema.safeParse({
    programId: form.get("programId"),
    question: form.get("question"),
    trackId: form.get("trackId") ?? "",
    isRequired: form.get("isRequired") === "on",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: parsed.data.programId,
    resourceProgramId: parsed.data.programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { error } = await db.from("admission_questions").insert({
    program_id: parsed.data.programId,
    track_id: parsed.data.trackId,
    question: parsed.data.question,
    is_required: parsed.data.isRequired,
  });
  if (error) return { error: "تعذّر إضافة السؤال." };

  revalidatePath(`/programs/${parsed.data.programId}`);
  return { notice: "أُضيف سؤال القبول." };
}

export async function removeAdmissionQuestion(
  questionId: string,
  programId: string,
): Promise<FormState> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { error } = await db
    .from("admission_questions")
    .update({ deleted_at: nowIso() })
    .eq("id", questionId);
  if (error) return { error: "تعذّر حذف السؤال." };

  revalidatePath(`/programs/${programId}`);
  return EMPTY_FORM_STATE;
}

// ── طلبات تغيير المسار ──

const changeSchema = z.object({
  programId: z.uuid(),
  participantId: z.uuid(),
  toTrackId: z.uuid("اختر المسار الجديد"),
  reason: z.string().trim().min(5, "السبب مطلوب"),
  baselinePercentage: z.coerce.number().min(0).max(100),
});

/**
 * `[BR-TRK-01]` **قرار إداري بتقدير بشري**: لا يُنشئه المشارك، ولا معادلة آلية
 * للنسبة — الإدارة تُدخلها تقديراً، وهي **نقطة انطلاق فقط** لا قاعدة مستمرة.
 */
export async function requestTrackChange(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = changeSchema.safeParse({
    programId: form.get("programId"),
    participantId: form.get("participantId"),
    toTrackId: form.get("toTrackId"),
    reason: form.get("reason"),
    baselinePercentage: form.get("baselinePercentage"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guardParticipants(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { data: participant } = await db
    .from("participants")
    .select("id, track_id")
    .eq("id", parsed.data.participantId)
    .maybeSingle();

  if (!participant?.track_id) return { error: "المشارك بلا مسار حالي." };
  if (participant.track_id === parsed.data.toTrackId) {
    return { error: "المسار الجديد هو نفسه الحالي." };
  }

  // الاتجاه للعرض فقط، ويُشتقّ من ترتيب المسارين لا من حكم على المشارك.
  const { data: tracks } = await db
    .from("tracks")
    .select("id, sort_order")
    .in("id", [participant.track_id, parsed.data.toTrackId]);

  const from = tracks?.find((t) => t.id === participant.track_id);
  const to = tracks?.find((t) => t.id === parsed.data.toTrackId);
  const direction = (to?.sort_order ?? 0) > (from?.sort_order ?? 0) ? "up" : "down";

  const { error } = await db.from("track_change_requests").insert({
    participant_id: parsed.data.participantId,
    from_track_id: participant.track_id,
    to_track_id: parsed.data.toTrackId,
    direction,
    reason: parsed.data.reason,
    baseline_percentage: parsed.data.baselinePercentage,
  });
  if (error) return { error: "تعذّر إنشاء الطلب." };

  await db.rpc("fn_write_audit", {
    p_action: "track_change_requested",
    p_entity_table: "track_change_requests",
    p_after: { ...parsed.data, direction },
  });

  revalidatePath(`/programs/${parsed.data.programId}/participants`);
  return { notice: "أُنشئ الطلب. يبقى معلَّقاً حتى البتّ فيه." };
}

export async function decideTrackChange(
  requestId: string,
  programId: string,
  decision: "approved" | "rejected",
): Promise<FormState> {
  const denied = await guardParticipants(programId);
  if (denied) return denied;

  const session = await getSession();
  if (session.status !== "active") return { error: "لا جلسة." };

  const db = await createClient();
  const { data: request } = await db
    .from("track_change_requests")
    .select("id, participant_id, to_track_id, baseline_percentage, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "الطلب غير موجود." };
  if (request.status !== "pending") return { error: "الطلب مبتوت فيه سلفاً." };

  const { error } = await db
    .from("track_change_requests")
    .update({ status: decision, decided_by: session.userId, decided_at: nowIso() })
    .eq("id", requestId);
  if (error) return { error: "تعذّر حفظ القرار." };

  // بعد القبول: النسبة **نقطة انطلاق فقط**، ثم يُحسب كأي مشارك بالآلية العادية.
  if (decision === "approved") {
    await db
      .from("participants")
      .update({
        track_id: request.to_track_id,
        baseline_percentage: request.baseline_percentage,
      })
      .eq("id", request.participant_id);
  }

  await db.rpc("fn_write_audit", {
    p_action: `track_change_${decision}`,
    p_entity_table: "track_change_requests",
    p_entity_id: requestId,
    p_after: { decision },
  });

  revalidatePath(`/programs/${programId}/participants`);
  return EMPTY_FORM_STATE;
}

// ── حالة المشارك ──

export async function setParticipantStatus(
  participantId: string,
  programId: string,
  status: "registered" | "memorizing" | "qualified" | "not_qualified" | "passed" | "not_passed",
): Promise<FormState> {
  const denied = await guardParticipants(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data: before } = await db
    .from("participants")
    .select("status")
    .eq("id", participantId)
    .maybeSingle();

  const { error } = await db.from("participants").update({ status }).eq("id", participantId);
  if (error) return { error: "تعذّر تغيير الحالة." };

  await db.rpc("fn_write_audit", {
    p_action: "participant_status_changed",
    p_entity_table: "participants",
    p_entity_id: participantId,
    p_before: before ?? undefined,
    p_after: { status },
  });

  revalidatePath(`/programs/${programId}/participants`);
  return EMPTY_FORM_STATE;
}
