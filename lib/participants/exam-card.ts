/**
 * بطاقة الاختبار في رحلة الطالب — منطقٌ خالص (خطة دليل المشارك · الدفعة أ).
 *
 * المتاح له الآن أو الذي بدأه يُبرَز أعلى شاشة اليوم: «متاحٌ لك»، والمحاولات الباقية، وآخر موعد.
 * وما سواه (لم يبلغ نسبته · اجتازه · نفدت محاولاته · أُغلق) يبقى بطاقةً هادئة في مكانها.
 */

export type ExamCardInput = {
  closesAt: string | null;
  attempts: number;
  maxAttempts: number | null;
  passed: boolean;
  open: boolean;
  blocker: string | null;
};

/**
 * يُبرَز ما لا مانع له — كما تحكم البوابة (`fn_exam_gate`): المحاولة المفتوحة الصالحة بلا مانع، والاجتياز
 * مانعٌ «اجتزت هذا الاختبار». ومحاولةٌ مفتوحة لمن أوقفت مشاركته لها مانع، فلا تُبرَز بزرٍّ لا يعمل.
 */
export function isHotExam(e: ExamCardInput): boolean {
  return e.blocker === null;
}

/** المحاولات الباقية — أو لا شيء حين لا حدّ لها. */
export function attemptsLeft(e: ExamCardInput): number | null {
  return e.maxAttempts === null ? null : Math.max(0, e.maxAttempts - e.attempts);
}

/**
 * آخر يومٍ يُدخَل فيه. الإدارة تخزّن الإغلاق نهايةَ يومه بتوقيت الرياض (`…T23:59:59.999+03:00`)، وقد
 * يُضبط مباشرةً منتصفَ ليل اليوم التالي (`2026-11-30 00:00+03`) فيُعرض اليوم التالي. لحظةٌ قبله بثانية
 * تبقى في يومه الأخير في الحالتين.
 */
export function lastExamMoment(closesAt: string | null): string | null {
  if (!closesAt) return null;
  const at = Date.parse(closesAt);
  return Number.isFinite(at) ? new Date(at - 1000).toISOString() : null;
}
