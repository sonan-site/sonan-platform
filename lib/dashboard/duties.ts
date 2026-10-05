import { formatNumber } from "@/lib/format";
import { daysText } from "@/lib/participants/journey";

/**
 * واجب صاحب الحساب في لوحته — اشتقاقٌ خالصٌ من صفّ `fn_my_duties`.
 *
 * اللوحة **لا تعيد شاشة الرحلة**: تلك تعرض اليوم وواجباته وعدّاده. وحصّة
 * اللوحة سطرُ الحسم وحده — أين هو الآن، وهل هو في موعده، وأين يُفتح.
 */

export type DutyRow = {
  participantId: string;
  programName: string;
  programStatus: "draft" | "published" | "closed";
  trackName: string | null;
  followsPlan: boolean;
  /** أيام خطته الفعلية. صفر = لا خطة لمساره بعد. */
  dayCount: number;
  /** أيام الخطة التي أتمّها في مساره الحالي. */
  doneDays: number;
  /**
   * نسبة الإنجاز بمقياس برنامجه (الوحدات أو الأيام) — من `fn_progress_at`
   * نفسها التي تقرؤها شاشة الرحلة، فلا يختلف الرقم بين شاشتين.
   */
  progressPct: number;
  /** أيام البرنامج التي انقضى وقت رصدها — موعده. */
  dueDays: number;
  lastMarkedAt: string | null;
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
  if (row.dayCount === 0) return "not_ready";
  return row.doneDays >= row.dayCount ? "finished_plan" : "working";
}

/** سطر الحسم — جملةٌ واحدة تُقرأ بلا شرح. */
export function dutyHeadline(row: DutyRow): string {
  switch (dutyState(row)) {
    case "working":
      return `اليوم ${formatNumber(row.doneDays + 1)} من ${formatNumber(row.dayCount)}`;
    case "finished_plan":
      return "أتممتَ أيام خطتك كلها";
    case "not_ready":
      return "مسارك ليس جاهزاً بعد";
    case "ended":
      return "انتهت رحلتك — سجلّك محفوظ";
  }
}

/** موعده بكلمة: «في موعدك» · «متأخر ٣ أيام» · «متقدّم يومين». */
export function dutyPace(row: DutyRow): string | null {
  if (dutyState(row) !== "working") return null;
  const lag = row.dueDays - row.doneDays;
  if (lag > 0) return `متأخر ${daysText(lag)}`;
  if (lag < 0) return `متقدّم ${daysText(-lag)}`;
  return "في موعدك";
}

/** هل في البطاقة ما يُنقَر؟ مسارٌ غير جاهزٍ لا رحلة تُفتح فيه. */
export function dutyOpens(row: DutyRow): boolean {
  return dutyState(row) !== "not_ready";
}
