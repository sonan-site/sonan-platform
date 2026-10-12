/**
 * حالة محاولة الاختبار عن بعد كما يُرسلها `fn_attempt_state` (`adr/0048`).
 * والصحيح لا يصل المتصفح أبداً: الخيارات معرّفٌ ونصّ.
 */

export type AttemptQuestion = {
  id: string;
  text: string;
  type: "single" | "multiple" | "true_false";
  options: { id: string; text: string }[];
};

/** `late`: الخادم رفض الجواب أو التخطّي لانقضاء وقته (الهجرة ٠٨٦) — فيُقال للمشارك. */
export type AttemptState = (
  | {
      status: "open";
      exam: string;
      attemptNo: number;
      index: number;
      total: number;
      secondsLeft: number;
      secondsPerQuestion: number;
      skipsLeft: number;
      question: AttemptQuestion;
    }
  | {
      status: "submitted";
      exam: string;
      attemptNo: number;
      score: number;
      max: number;
      percent: number;
      passed: boolean;
      passPercentage: number;
    }
) & { late?: boolean };

const num = (v: unknown) => Number(v ?? 0);

/** يقرأ ردّ القاعدة ويرفض غير المتوقَّع — فلا تعرض الشاشة نصف حالة. */
export function parseAttemptState(raw: unknown): AttemptState {
  if (!raw || typeof raw !== "object") throw new Error("attempt state missing");
  const r = raw as Record<string, unknown>;
  const late = r.late === true ? { late: true } : {};
  if (r.status === "submitted") {
    return {
      ...late,
      status: "submitted",
      exam: String(r.exam ?? ""),
      attemptNo: num(r.attempt_no),
      score: num(r.score),
      max: num(r.max),
      percent: num(r.percent),
      passed: r.passed === true,
      passPercentage: num(r.pass_percentage),
    };
  }
  if (r.status !== "open") throw new Error("attempt state unknown");
  const q = r.question as Record<string, unknown> | undefined;
  if (!q || typeof q.id !== "string") throw new Error("attempt question missing");
  return {
    ...late,
    status: "open",
    exam: String(r.exam ?? ""),
    attemptNo: num(r.attempt_no),
    index: num(r.index),
    total: num(r.total),
    secondsLeft: num(r.seconds_left),
    secondsPerQuestion: num(r.seconds_per_question),
    skipsLeft: num(r.skips_left),
    question: {
      id: q.id,
      text: String(q.text ?? ""),
      type: q.type === "multiple" ? "multiple" : q.type === "true_false" ? "true_false" : "single",
      options: Array.isArray(q.options)
        ? (q.options as Record<string, unknown>[]).map((o) => ({ id: String(o.id), text: String(o.text ?? "") }))
        : [],
    },
  };
}
