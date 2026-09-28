import { formatNumber } from "@/lib/format";

/**
 * واجب صاحب الحساب في لوحته — اشتقاقٌ خالصٌ من صفّ `fn_my_duties`.
 *
 * اللوحة **لا تعيد شاشة الرحلة**: تلك تعرض اليوم وواجباته ومقاديره. وحصّة
 * اللوحة سطرُ الحسم وحده — أين هو الآن، وهل ينتظره شيء، وأين يُفتح.
 */

export type DutyRow = {
  participantId: string;
  programName: string;
  programStatus: "draft" | "published" | "closed";
  trackName: string | null;
  followsPlan: boolean;
  workDays: number;
  submittedDays: number;
  completeDays: number;
  /** أول يوم عملٍ لم يُرسَل، و`null` إن لم يبقَ يوم. */
  currentDay: number | null;
  lastSubmittedAt: string | null;
  /** اسم المسار الذي تقترح الإدارة نقله إليه — الطلب منها لا منه. */
  proposedTrack: string | null;
  contact: string;
};

/**
 * أربع حالات لا تلتبس:
 * `working` يومه بانتظاره · `finished_plan` أتمّ خطته وحالته تتبعها بعد ·
 * `not_ready` مساره لا يُبدأ به · `ended` انتهت رحلته.
 */
export type DutyState = "working" | "finished_plan" | "not_ready" | "ended";

export function dutyState(row: DutyRow): DutyState {
  if (!row.followsPlan) return "ended";
  // بلا يوم عملٍ واحد: لا مسار، أو لا خطة، أو قالبٌ بلا واجبات.
  if (row.workDays === 0) return "not_ready";
  return row.currentDay === null ? "finished_plan" : "working";
}

/** سطر الحسم — جملةٌ واحدة تُقرأ بلا شرح. */
export function dutyHeadline(row: DutyRow): string {
  switch (dutyState(row)) {
    case "working":
      return `اليوم ${formatNumber(row.currentDay ?? 0)} من ${formatNumber(row.workDays)}`;
    case "finished_plan":
      return "أتممتَ أيام خطتك كلها";
    case "not_ready":
      return "مسارك ليس جاهزاً بعد";
    case "ended":
      return "انتهت رحلتك — سجلّك محفوظ";
  }
}

/**
 * الإتمام: المكتملة ÷ **المُرسَلة**. وهي معادلة شاشة الرحلة بعينها
 * (`lib/participants/journey.ts`) — رقمان مختلفان على شاشتين متجاورتين
 * يُفقدان الثقة في كليهما.
 */
export function dutyCompletion(row: DutyRow): number {
  return row.submittedDays === 0 ? 0 : row.completeDays / row.submittedDays;
}

/** هل في البطاقة ما يُنقَر؟ مسارٌ غير جاهزٍ لا رحلة تُفتح فيه. */
export function dutyOpens(row: DutyRow): boolean {
  return dutyState(row) !== "not_ready";
}
