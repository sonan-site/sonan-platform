/**
 * منطق رحلة المشارك — خالص، بلا قاعدة ولا شبكة.
 *
 * التوليد كلّه في القاعدة (`fn_plan_day_tasks`) ولا يُعاد هنا. ما هنا اختيارُ
 * **أي يوم يُعرَض** وتلخيصُ التقدّم — وكلاهما اشتقاق من صفوف جاهزة.
 */

export type DayType = "normal" | "rest" | "exam";

export type JourneyDay = {
  id: string;
  dayNumber: number;
  dayType: DayType;
  submitted: boolean;
  /**
   * ليومه العادي حقولٌ فعلاً.
   *
   * قالبٌ بلا حقول ينتج يوماً لا شيء فيه يُرسَل — والإرسال يكتب صفوف الحقول،
   * فبلا حقول لا يُسجَّل شيء ولا يُعَدّ اليوم مُرسَلاً. فلو عُدّ يوم عمل
   * **لعلق المشارك عنده إلى الأبد**. يُتخطّى كما تُتخطّى الراحة.
   */
  hasWork: boolean;
};

/**
 * اليوم الجاري = **أول يوم عمل لم يُرسَل**.
 *
 * لا تقويم ولا احتساب أيام غياب: من تأخّر أسبوعاً يجد يومه حيث تركه، ولا
 * يُقفَز به (`ENTITIES §ز`). وأيام الراحة والاختبار تُتخطّى في هذا الاختيار
 * لأنها لا تُرسَل أصلاً — فلو عُدّت لتوقّفت الرحلة عند أول راحة.
 *
 * فارغ = أتمّ الخطة كلها.
 */
export function currentDayNumber(days: JourneyDay[]): number | null {
  const next = days.find((d) => d.dayType === "normal" && d.hasWork && !d.submitted);
  return next?.dayNumber ?? null;
}

/**
 * اليوم المعروض: المطلوب إن كان موجوداً، وإلا الجاري، وإلا آخر الخطة.
 * فرابطٌ قديم أو رقمٌ مكتوب باليد يُصحَّح ولا يُفشل الصفحة.
 */
export function resolveDayNumber(days: JourneyDay[], requested: number | null): number | null {
  if (days.length === 0) return null;
  if (requested !== null && days.some((d) => d.dayNumber === requested)) return requested;
  return currentDayNumber(days) ?? days[days.length - 1]!.dayNumber;
}

export type JourneyProgress = {
  /** أيام العمل في الخطة — الراحة والاختبار خارجها. */
  workDays: number;
  /** ما أُرسل منها. */
  submittedDays: number;
  /** نسبة الالتزام: أيام أُرسلت ÷ أيام عمل. */
  commitment: number;
};

export function journeyProgress(days: JourneyDay[]): JourneyProgress {
  const work = days.filter((d) => d.dayType === "normal" && d.hasWork);
  const submitted = work.filter((d) => d.submitted);
  return {
    workDays: work.length,
    submittedDays: submitted.length,
    commitment: work.length === 0 ? 0 : submitted.length / work.length,
  };
}

/** اليوم السابق واللاحق في الخطة — للتنقّل، وتشمل الراحة والاختبار. */
export function neighbours(
  days: JourneyDay[],
  dayNumber: number,
): { previous: number | null; next: number | null } {
  const index = days.findIndex((d) => d.dayNumber === dayNumber);
  if (index < 0) return { previous: null, next: null };
  return {
    previous: index > 0 ? days[index - 1]!.dayNumber : null,
    next: index < days.length - 1 ? days[index + 1]!.dayNumber : null,
  };
}

/**
 * هل يُقبَل إرسال هذا اليوم؟
 *
 * **يوم العمل الجاري وحده يُرسَل.** الماضي أُرسل سلفاً (`BR-GEN-02`: اللقطة
 * تُثبَّت مرة)، والمستقبل لم يحن — وإرساله يخلق سلسلةً فيها ثقوب. ومن تخلّف
 * أياماً فأولها غير المُرسَل هو جاريه، فيُكمل من حيث وقف لا من حيث كان يُفترَض.
 */
export function canSubmit(days: JourneyDay[], dayNumber: number): boolean {
  return currentDayNumber(days) === dayNumber;
}
