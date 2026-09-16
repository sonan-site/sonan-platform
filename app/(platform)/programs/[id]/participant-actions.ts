"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { followsPlan } from "@/lib/participants/journey";
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
 * للنسبة — الإدارة تُدخلها تقديراً **للعرض والتدقيق**، لا نقطة انطلاق للتوليد:
 * مادة المسار الجديد تبدأ من يومها الأول (`adr/0027`).
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
    .select("id, track_id, status")
    .eq("id", parsed.data.participantId)
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!participant) return { error: "المشارك غير موجود في هذا البرنامج." };
  if (!participant.track_id) return { error: "لا مسار لهذا المشارك. أسنِد له مساراً من عمود المسار أولاً." };
  if (!followsPlan(participant.status)) {
    return { error: "انتهت رحلة هذا المشارك في البرنامج، فلا يُنقل." };
  }
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
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "للمشارك طلبٌ معلَّق. ابتّ فيه أولاً."
          : "تعذّر إنشاء الطلب.",
    };
  }

  await db.rpc("fn_write_audit", {
    p_action: "track_change_requested",
    p_entity_table: "track_change_requests",
    p_after: { ...parsed.data, direction },
  });

  revalidatePath(`/programs/${parsed.data.programId}/participants`);
  return { notice: "أُنشئ الطلب. يبقى معلَّقاً حتى البتّ فيه." };
}

const decisionSchema = z.object({
  requestId: z.uuid(),
  programId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});

/** رسائل القاعدة كما هي — عربية ومحدّدة، ولا تكشف ما لا يملكه الطالب. */
const DECISION_MESSAGES = [
  "الطلب غير موجود",
  "الطلب مبتوت فيه سلفاً",
  "المشارك لم يعد في البرنامج",
  "تغيّر مسار المشارك بعد الطلب",
  "انتهت رحلة المشارك في البرنامج",
  "المسار المطلوب غير متاح",
  "اكتمل العدد في هذا المسار",
  "هذا المسار غير متاح",
];

/**
 * البتّ في طلب تغيير المسار — **القبول ينقل المشارك**: مادة مساره الجديد من
 * يومها الأول، وسجلّه في السابق باقٍ ظاهر (`adr/0027`).
 *
 * القرار كله في `fn_decide_track_change`: فحصٌ ونقلٌ وبتٌّ وتدقيق في معاملة
 * واحدة، ولا طريق مباشر حولها (الهجرة ٠٣٩).
 */
export async function decideTrackChange(
  requestId: string,
  programId: string,
  decision: "approved" | "rejected",
): Promise<FormState> {
  const parsed = decisionSchema.safeParse({ requestId, programId, decision });
  if (!parsed.success) return { error: "طلب غير صالح." };

  const authz = await authorizeRequest({
    permission: "participants.write",
    programId: parsed.data.programId,
    resourceProgramId: parsed.data.programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { error } = await db.rpc("fn_decide_track_change", {
    p_request_id: parsed.data.requestId,
    p_program_id: parsed.data.programId,
    p_decision: parsed.data.decision,
  });
  if (error) {
    const known = DECISION_MESSAGES.find((m) => error.message.includes(m));
    return { error: known ? `${known}.` : "تعذّر حفظ القرار." };
  }

  revalidatePath(`/programs/${parsed.data.programId}/participants`);
  return {
    notice: parsed.data.decision === "approved" ? "نُقل المشارك إلى مساره الجديد." : "رُفض الطلب.",
  };
}

// ── إسناد مسار لمن لا مسار له ──

/**
 * لمشاركٍ سُجِّل بلا مسار وحده. **تغيير مسارٍ قائم خارجه**: ذلك قرار م-٤
 * المؤجَّل (ما يحلّ بتقدّمه)، فالقيد `track_id is null` في الاستعلام نفسه.
 * والسعة يفرضها مشغّل القاعدة (الهجرة ٠٣٢).
 */
export async function assignTrack(
  participantId: string,
  trackId: string,
  programId: string,
): Promise<FormState> {
  const ids = z.object({ participantId: z.uuid(), trackId: z.uuid(), programId: z.uuid() });
  if (!ids.safeParse({ participantId, trackId, programId }).success) {
    return { error: "اختر المسار من القائمة." };
  }

  const denied = await guardParticipants(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("participants")
    .update({ track_id: trackId })
    .eq("id", participantId)
    .eq("program_id", programId)
    .is("track_id", null)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    return {
      error:
        error.code === "23514"
          ? `${error.message}.`
          : error.code === "23503"
            ? "المسار ليس من هذا البرنامج."
            : "تعذّر إسناد المسار.",
    };
  }
  if (!data?.length) return { error: "للمشارك مسار سلفاً، أو لم يُعثر عليه." };

  await db.rpc("fn_write_audit", {
    p_action: "participant_track_assigned",
    p_entity_table: "participants",
    p_entity_id: participantId,
    p_after: { track_id: trackId },
  });

  revalidatePath(`/programs/${programId}/participants`);
  return { notice: "أُسنِد المسار." };
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
