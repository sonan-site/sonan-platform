"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { type ParticipantStatus } from "@/lib/programs/kinds";
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

  // المورد يُقيَّد ببرنامج التصريح: بلا هذا القيد يُقبل تصريحٌ في برنامج لحذف سؤال في غيره.
  const db = await createClient();
  const { data, error } = await db
    .from("admission_questions")
    .update({ deleted_at: nowIso() })
    .eq("id", questionId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حذف السؤال." };

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
    .eq("program_id", parsed.data.programId)
    .maybeSingle();

  if (!participant) return { error: "المشارك غير موجود في هذا البرنامج." };
  if (!participant.track_id) return { error: "المشارك بلا مسار حالي." };
  if (participant.track_id === parsed.data.toTrackId) {
    return { error: "المسار الجديد هو نفسه الحالي." };
  }

  // الاتجاه للعرض فقط، ويُشتقّ من ترتيب المسارين لا من حكم على المشارك.
  const { data: tracks } = await db
    .from("tracks")
    .select("id, sort_order")
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .in("id", [participant.track_id, parsed.data.toTrackId]);

  const from = tracks?.find((t) => t.id === participant.track_id);
  const to = tracks?.find((t) => t.id === parsed.data.toTrackId);
  if (!to) return { fieldErrors: { toTrackId: "المسار ليس من هذا البرنامج" } };
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
  /**
   * **القبول موقوف حتى يُحسم م-٤** (`docs/open-questions.md`): قبول النقلة اليوم
   * يُعيد المشارك إلى أول المسار الجديد ويُخفي تاريخه، والراعي لم يقرّر أهذا
   * المقصود. والرفض لا أثر له على التقدّم فيبقى متاحاً.
   */
  if (decision === "approved") {
    return { error: "قبول تغيير المسار غير متاح حتى يُحسم أثره على تقدّم المشارك." };
  }

  const authz = await authorizeRequest({ permission: "participants.write", programId });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  // الطلب يُقيَّد ببرنامج التصريح عبر مشاركه — لا يُبتّ في طلبٍ من برنامج آخر.
  const { data: request } = await db
    .from("track_change_requests")
    .select("id, status, participants!inner(program_id)")
    .eq("id", requestId)
    .eq("participants.program_id", programId)
    .maybeSingle();

  if (!request) return { error: "الطلب غير موجود." };
  if (request.status !== "pending") return { error: "الطلب مبتوت فيه سلفاً." };

  const { data, error } = await db
    .from("track_change_requests")
    .update({ status: decision, decided_by: authz.userId, decided_at: nowIso() })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حفظ القرار." };

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
  status: ParticipantStatus,
): Promise<FormState> {
  const denied = await guardParticipants(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data: before } = await db
    .from("participants")
    .select("status")
    .eq("id", participantId)
    .eq("program_id", programId)
    .maybeSingle();
  if (!before) return { error: "المشارك غير موجود في هذا البرنامج." };

  const { data, error } = await db
    .from("participants")
    .update({ status })
    .eq("id", participantId)
    .eq("program_id", programId)
    .select("id");
  if (error) {
    return {
      error: error.code === "23514" ? "هذه الحالة خاصة ببرامج المسابقة." : "تعذّر تغيير الحالة.",
    };
  }
  if (!data?.length) return { error: "تعذّر تغيير الحالة." };

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
