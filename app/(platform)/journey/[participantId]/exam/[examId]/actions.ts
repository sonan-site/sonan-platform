"use server";

import { z } from "@/lib/validation/z";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { parseAttemptState, type AttemptState } from "@/lib/exams/attempt";

/**
 * أفعال الاختبار عن بعد (`adr/0048`). **الحكم كلّه في دوالّ المحرّك:** الملكية
 * والبوّابة والمؤقّت والتصحيح. فالفعل هنا ناقلٌ يتحقّق من شكل المدخل وحده.
 */

type Result = { state?: AttemptState; attemptId?: string; error?: string };

const ARABIC = /[؀-ۿ]/;
const message = (error: { message: string } | null, fallback: string) =>
  error && ARABIC.test(error.message) ? error.message : fallback;

async function signedIn(): Promise<boolean> {
  return (await getSession()).status === "active";
}

function read(data: unknown): Result {
  try {
    return { state: parseAttemptState(data) };
  } catch {
    return { error: "تعذّرت قراءة الاختبار — أعد تحميل الصفحة." };
  }
}

export async function startAttempt(examId: string): Promise<Result> {
  if (!z.uuid().safeParse(examId).success) return { error: "اختبار غير معروف." };
  if (!(await signedIn())) return { error: "سجّل الدخول أولاً." };
  const db = await createClient();
  const { data, error } = await db.rpc("fn_start_attempt", { p_exam_id: examId });
  if (error || !data) return { error: message(error, "تعذّر بدء الاختبار.") };
  return { attemptId: data, ...read((await db.rpc("fn_attempt_state", { p_attempt_id: data })).data) };
}

export async function attemptState(attemptId: string): Promise<Result> {
  if (!z.uuid().safeParse(attemptId).success) return { error: "محاولة غير معروفة." };
  if (!(await signedIn())) return { error: "سجّل الدخول أولاً." };
  const db = await createClient();
  const { data, error } = await db.rpc("fn_attempt_state", { p_attempt_id: attemptId });
  if (error) return { error: message(error, "تعذّر جلب الاختبار.") };
  return read(data);
}

const answerInput = z.object({
  attemptId: z.uuid(),
  questionId: z.uuid(),
  optionIds: z.array(z.uuid()).max(6),
});

export async function answerQuestion(attemptId: string, questionId: string, optionIds: string[]): Promise<Result> {
  if (!answerInput.safeParse({ attemptId, questionId, optionIds }).success) return { error: "جوابٌ غير صالح." };
  if (!(await signedIn())) return { error: "سجّل الدخول أولاً." };
  const db = await createClient();
  const { data, error } = await db.rpc("fn_answer_question", {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_option_ids: optionIds,
  });
  if (error) return { error: message(error, "تعذّر حفظ الجواب.") };
  return read(data);
}

export async function skipQuestion(attemptId: string, questionId: string): Promise<Result> {
  if (!z.object({ a: z.uuid(), q: z.uuid() }).safeParse({ a: attemptId, q: questionId }).success) {
    return { error: "سؤال غير معروف." };
  }
  if (!(await signedIn())) return { error: "سجّل الدخول أولاً." };
  const db = await createClient();
  const { data, error } = await db.rpc("fn_skip_question", { p_attempt_id: attemptId, p_question_id: questionId });
  if (error) return { error: message(error, "تعذّر التخطّي.") };
  return read(data);
}
