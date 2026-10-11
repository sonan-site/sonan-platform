"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { parseSheet, type JudgeSheet } from "@/lib/exams/sheet";

/**
 * أفعال ورقة التحكيم (`adr/0048`). **الحكم في دوالّ القاعدة:** من المحكّم،
 * وأيّ الأسئلة والمعايير، والقفل بعد الاعتماد، والإدخال عن محكّمٍ بسببه.
 * `judgeId` فارغ = المستدعي يقيّم بنفسه، وإلا فمدير اختبارات يُدخل ورقة محكّم.
 */

type Result = { sheet?: JudgeSheet; error?: string };

const ARABIC = /[؀-ۿ]/;
const message = (error: { message: string } | null, fallback: string) =>
  error && ARABIC.test(error.message) ? error.message : fallback;

const target = z.object({
  sessionId: z.uuid(),
  participantId: z.uuid(),
  judgeId: z.uuid().nullable(),
});

function read(data: unknown): Result {
  try {
    return { sheet: parseSheet(data) };
  } catch {
    return { error: "تعذّرت قراءة الورقة — أعد تحميل الصفحة." };
  }
}

export async function markQuestion(
  sessionId: string,
  participantId: string,
  judgeId: string | null,
  questionId: string,
  criterionIds: string[],
  reason: string | null,
): Promise<Result> {
  const ok =
    target.safeParse({ sessionId, participantId, judgeId }).success &&
    z.uuid().safeParse(questionId).success &&
    z.array(z.uuid()).max(30).safeParse(criterionIds).success &&
    (reason === null || reason.length <= 200);
  if (!ok) return { error: "تقييمٌ غير صالح." };
  if ((await getSession()).status !== "active") return { error: "سجّل الدخول أولاً." };

  const db = await createClient();
  const { data, error } = await db.rpc("fn_judge_mark", {
    p_session_id: sessionId,
    p_participant_id: participantId,
    p_question_id: questionId,
    p_criterion_ids: criterionIds,
    p_judge_id: judgeId as string,
    p_reason: reason as string,
  });
  if (error) return { error: message(error, "تعذّر حفظ التقييم.") };
  return read(data);
}

export async function approveSheet(sessionId: string, participantId: string, judgeId: string | null): Promise<Result> {
  if (!target.safeParse({ sessionId, participantId, judgeId }).success) return { error: "ورقة غير معروفة." };
  if ((await getSession()).status !== "active") return { error: "سجّل الدخول أولاً." };

  const db = await createClient();
  const { data, error } = await db.rpc("fn_judge_approve", {
    p_session_id: sessionId,
    p_participant_id: participantId,
    p_judge_id: judgeId as string,
  });
  if (error) return { error: message(error, "تعذّر الاعتماد.") };
  revalidatePath(`/judge/${sessionId}`);
  return read(data);
}
