import { now, toDateInput } from "./index";

/**
 * حساب شبكة التقويم — نقيٌّ بلا واجهة، فيُختبر وحده.
 *
 * الحساب كله بـ UTC: التاريخ هنا **يوم تقويمي** لا لحظة، والحساب بتوقيت الجهاز
 * يُقدّم اليوم أو يؤخّره بحسب من يفتح الشاشة.
 */

export const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

/** يبدأ الأسبوع بالأحد، كما في تقويم السعودية. */
export const WEEKDAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"] as const;

export type YearMonth = { year: number; month: number };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` ← أجزاؤه، أو `null` إن لم يكن تاريخاً حقيقياً. */
export function parseDateInput(value: string): { year: number; month: number; day: number } | null {
  const match = ISO.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function toDateValue({ year, month, day }: { year: number; month: number; day: number }): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * شبكة الشهر: أسابيع من سبعة، والفراغ قبل أول يوم وبعد آخره `null`.
 * فتقع كل خانة تحت اسم يومها.
 */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const total = daysInMonth(year, month);

  const cells: (number | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= total; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** السنوات المعروضة للميلاد: من هذا العام إلى مئة عامٍ خلفه (حدّ `profileSchema`). */
export function birthYears(): number[] {
  const current = Number(toDateInput(now()).slice(0, 4));
  return Array.from({ length: 101 }, (_, i) => current - i);
}

/** سنوات موعدٍ قريب — بداية برنامج أو يوم توقّف: سنة مضت وثلاث قادمة. */
export function eventYears(): number[] {
  const current = Number(toDateInput(now()).slice(0, 4));
  return Array.from({ length: 5 }, (_, i) => current - 1 + i);
}

/** ما يعرضه التقويم: السنة فارغة حتى تُختار في تقويم ميلادٍ لا قيمة له. */
export type PickerView = { year: number | null; month: number };

/**
 * الشهر المفتوح عند فتح التقويم: شهر القيمة، وإلا فالشهر الجاري لموعدٍ قريب.
 * والميلاد الفارغ بلا سنة: كان يُفتح على سنةٍ لبالغ (قبل عشرين عاماً)، فيضغط وليّ الأمر يوماً
 * ولا ينتبه للسنة، فيُسجَّل ابنه ذو العشر سنين ابنَ عشرين (٥ نوفمبر).
 */
export function initialMonth(value: string, kind: "birth" | "event" = "birth"): PickerView {
  const parsed = parseDateInput(value);
  if (parsed) return { year: parsed.year, month: parsed.month };
  const today = toDateInput(now());
  if (kind === "event") return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  return { year: null, month: 1 };
}

/** العمر بالسنوات الكاملة يوم `at` — أو `null` لما ليس تاريخاً أو كان بعده. */
export function ageOn(value: string, at: Date): number | null {
  const birth = parseDateInput(value);
  if (!birth) return null;
  const day = toDateInput(at);
  const [y, m, d] = [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];
  const age = y - birth.year - (m < birth.month || (m === birth.month && d < birth.day) ? 1 : 0);
  return age < 0 ? null : age;
}

/** «العمر: 10 سنوات» تحت حقل الميلاد — فالسنة الخاطئة تُرى رقماً قبل الحفظ. */
export function ageLabel(value: string, at: Date = now()): string | null {
  const age = ageOn(value, at);
  if (age === null) return null;
  return `العمر: ${age} ${age >= 3 && age <= 10 ? "سنوات" : "سنة"}`;
}
