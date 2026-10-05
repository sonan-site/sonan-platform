/**
 * إعدادات المحرّك الموروثة (`adr/0038`) — أسماؤها ونصوصها في موضع واحد.
 *
 * القاعدة: كل إعداد على البرنامج قيمةٌ افتراضية يرثها كل مسار، ويُخصَّص لمسار
 * بعينه فيحلّ محلّ الموروث فيه. والكتابة من `fn_set_engine_setting` وحدها.
 */

export const ENGINE_KEYS = [
  "start_date",
  "work_days",
  "exceptions",
  "deadline",
  "daily_limit",
  "credit_enabled",
  "compensation_enabled",
  "progress_measure",
] as const;

export type EngineKey = (typeof ENGINE_KEYS)[number];

export const ENGINE_LABEL: Record<EngineKey, { title: string; hint: string }> = {
  start_date: {
    title: "تاريخ البداية",
    hint: "اختياري. إن غاب بدأ تقويم كل مشارك من يوم التحاقه.",
  },
  work_days: {
    title: "أيام العمل الأسبوعية",
    hint: "الأيام التي يُطالَب فيها المشارك بالرصد. وما سواها راحة لا يُحكم عليها.",
  },
  exceptions: {
    title: "أيام التوقف الاستثنائية",
    hint: "أيامٌ لا يُطالَب فيها بالرصد وإن كانت أيام عمل: عيد، إجازة.",
  },
  deadline: {
    title: "وقت نهاية الرصد",
    hint: "عنده يُحكم على اليوم بالإتمام أو التعثّر. التغيير يسري من اليوم إن لم يمضِ وقته، وإلا فمن الغد — ولا يمسّ ما قبله.",
  },
  daily_limit: {
    title: "الحد اليومي",
    hint: "أقصى عدد من أيام الخطة يُتمّها المشارك في يوم واحد، متقدّماً كان أو متداركاً.",
  },
  credit_enabled: {
    title: "احتساب رصيد التقدّم",
    hint: "إذا فُعّل: لا يُسجَّل تعثّرٌ على من لم يرصد في يومٍ وهو في موعده.",
  },
  compensation_enabled: {
    title: "احتساب التعويض",
    hint: "إذا فُعّل: حين يعود المتعثّر إلى موعده تُوسم أيام تعثّره «معوَّضة»، ولا تُحذف.",
  },
  progress_measure: {
    title: "مقياس نسبة الإنجاز",
    hint: "بالوحدات: ما حُفظ من نصيب المسار. بالأيام: ما أُتمّ من أيام الخطة.",
  },
};

/** الأحد أولاً كما في التقويم السعودي، والرقم كما يخزّنه `extract(dow)`. */
export const WEEK_DAYS = [
  { day: 0, label: "الأحد" },
  { day: 1, label: "الاثنين" },
  { day: 2, label: "الثلاثاء" },
  { day: 3, label: "الأربعاء" },
  { day: 4, label: "الخميس" },
  { day: 5, label: "الجمعة" },
  { day: 6, label: "السبت" },
] as const;

export type ProgressMeasure = "units" | "days";

/** الإعدادات بقيمها — على البرنامج كاملة، وعلى المسار بفراغٍ يعني «موروث». */
export type EngineValues = {
  startDate: string | null;
  workDays: number[];
  exceptions: string[];
  /** سجلّ الوقت بتاريخ سريانه، الأقدم أولاً. والفارغ = ٢٣:٠٠ منذ البداية. */
  deadlines: { from: string; time: string }[];
  dailyLimit: number;
  creditEnabled: boolean;
  compensationEnabled: boolean;
  progressMeasure: ProgressMeasure;
};

export const DEFAULT_DEADLINE = "23:00";

/** الوقت الساري في يوم من سجلّه — الأحدث الذي سرى قبله أو فيه، وما قبل أوله بأوله. */
export function deadlineOn(deadlines: EngineValues["deadlines"], day: string): string {
  if (deadlines.length === 0) return DEFAULT_DEADLINE;
  let current = deadlines[0]!.time;
  for (const row of deadlines) if (row.from <= day) current = row.time;
  return current;
}

/** هل خصّص المسار الإعداد — وما خصّصه يُقرأ منه، وما سواه من البرنامج. */
export type TrackOverrides = Partial<Record<EngineKey, boolean>>;

export function effectiveValues(
  program: EngineValues,
  track: { overrides: TrackOverrides; values: EngineValues } | null,
): EngineValues {
  if (!track) return program;
  const pick = <K extends keyof EngineValues>(key: EngineKey, field: K): EngineValues[K] =>
    track.overrides[key] ? track.values[field] : program[field];
  return {
    startDate: pick("start_date", "startDate"),
    workDays: pick("work_days", "workDays"),
    exceptions: pick("exceptions", "exceptions"),
    deadlines: pick("deadline", "deadlines"),
    dailyLimit: pick("daily_limit", "dailyLimit"),
    creditEnabled: pick("credit_enabled", "creditEnabled"),
    compensationEnabled: pick("compensation_enabled", "compensationEnabled"),
    progressMeasure: pick("progress_measure", "progressMeasure"),
  };
}
