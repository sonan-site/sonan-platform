import { formatNumber, TIMEZONE, toDate } from "@/lib/format";

/**
 * إحصاءات النشاط (adr/0061) — المرشّحات وحدودها وتسميات الفترات. نقيّةٌ بلا قاعدة، فتُختبر وحدها.
 * والإنفاذ (النطاق والمدخلات) في `fn_activity_stats` لا هنا: هذه تجربة استخدام.
 */

/** أول يومٍ سُجّل فيه النشاط — وما قبله لا بيانات له (قرار ٤: لا تقدير رجعي). */
export const ACTIVITY_SINCE = "2026-11-15";

export const BUCKETS = ["hour", "3h", "6h", "day"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const BUCKET_LABEL: Record<Bucket, string> = { hour: "ساعة", "3h": "3 ساعات", "6h": "6 ساعات", day: "يوم" };
const BUCKET_HOURS: Record<Bucket, number> = { hour: 1, "3h": 3, "6h": 6, day: 24 };
/** أطول مدى لكل فترة — فلا يُرسم ١٤٤٠ عموداً لساعات شهرين. */
const BUCKET_MAX_DAYS: Record<Bucket, number> = { hour: 14, "3h": 31, "6h": 62, day: 366 };

export const AUDIENCES = ["all", "student", "staff"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = { all: "الكل", student: "الطلاب", staff: "الفريق" };

export const RANGES = ["today", "7", "30", "60", "custom"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABEL: Record<Range, string> = {
  today: "اليوم",
  "7": "7 أيام",
  "30": "30 يوماً",
  "60": "60 يوماً",
  custom: "مدى مخصّص",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** يومٌ حقيقي لا صيغته وحدها — «2026-00-10» و«2026-02-30» يُردّان (مراجعة الكود ح٣). */
export function isDay(value: string | undefined): value is string {
  if (!value || !DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const UUID = /^[0-9a-f-]{36}$/i;

/** يومٌ `YYYY-MM-DD` مزاحاً بأيام — حسابٌ على التقويم لا على الساعة، فلا تنزلق المنطقة الزمنية. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** عدد الأيام بين يومين شاملاً طرفيهما. */
export function spanDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
}

/** الفترات المتاحة لمدىً بطوله. */
export function bucketsFor(days: number): Bucket[] {
  return BUCKETS.filter((b) => days <= BUCKET_MAX_DAYS[b]);
}

export type StatsQuery = {
  range: Range;
  from: string;
  to: string;
  bucket: Bucket;
  audience: Audience;
  program: string | null;
  track: string | null;
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isOf = <T extends string>(list: readonly T[], v: string | undefined): v is T => list.includes(v as T);

/**
 * المرشّحات من الرابط بحدودها: ما لا يصحّ يعود إلى أصله. والمحصور (`scoped`) فئته «الطلاب» وبرنامجه
 * من نطاقه، فلا يُعرض له ما ستردّه القاعدة.
 */
export function parseStatsQuery(
  params: Params,
  today: string,
  scope: { global: boolean; programs: string[] },
): StatsQuery {
  const rangeParam = one(params.range);
  const range: Range = isOf(RANGES, rangeParam) ? rangeParam : "7";

  let from = today;
  let to = today;
  if (range === "custom") {
    const f = one(params.from);
    const t = one(params.to);
    to = isDay(t) && t <= today ? t : today;
    from = isDay(f) && f <= to ? f : addDays(to, -6);
    if (spanDays(from, to) > 366) from = addDays(to, -365);
  } else if (range !== "today") {
    from = addDays(today, -(Number(range) - 1));
  }

  const allowed = bucketsFor(spanDays(from, to));
  const bucketParam = one(params.bucket);
  const fallback: Bucket = range === "today" ? "hour" : "day";
  const bucket: Bucket = isOf(allowed, bucketParam) ? bucketParam : fallback;

  const audienceParam = one(params.audience);
  const audience: Audience = !scope.global ? "student" : isOf(AUDIENCES, audienceParam) ? audienceParam : "all";

  const programParam = one(params.program);
  let program = audience === "student" && programParam && UUID.test(programParam) ? programParam : null;
  if (!scope.global && (!program || !scope.programs.includes(program))) program = scope.programs[0] ?? null;

  const trackParam = one(params.track);
  const track = program && trackParam && UUID.test(trackParam) ? trackParam : null;

  return { range, from, to, bucket, audience, program, track };
}

// ── تسميات الفترات — بتوقيت الرياض ──

const weekday = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: TIMEZONE, weekday: "long" });
const dayMonth = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: TIMEZONE, day: "numeric", month: "long" });
const hourOf = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hourCycle: "h23" });

/** ساعة الرياض (٠–٢٣) لبداية فترة. */
export function riyadhHour(iso: string): number {
  return Number(hourOf.format(toDate(iso)));
}

/** «٩ م» — ساعةٌ بنظام الاثنتي عشرة. */
export function clockLabel(hour: number): string {
  const h = hour % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${formatNumber(twelve)} ${h < 12 ? "ص" : "م"}`;
}

/** يوم الفترة: «الأحد 15 نوفمبر». */
export function dayLabel(iso: string): string {
  return `${weekday.format(toDate(iso))} ${dayMonth.format(toDate(iso))}`;
}

/** ساعات الفترة: «9 م» للساعة، و«6 م – 12 ص» للأوسع، ولا شيء لليوم. */
export function hoursLabel(iso: string, bucket: Bucket): string {
  if (bucket === "day") return "";
  const start = riyadhHour(iso);
  if (bucket === "hour") return clockLabel(start);
  return `${clockLabel(start)} – ${clockLabel(start + BUCKET_HOURS[bucket])}`;
}

/** التسمية الكاملة للفترة. */
export function periodLabel(iso: string, bucket: Bucket): string {
  const hours = hoursLabel(iso, bucket);
  return hours ? `${dayLabel(iso)} · ${hours}` : dayLabel(iso);
}

/** أيام الأسبوع بترتيب `dow` في القاعدة (الأحد = ٠). */
export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

const shortDay = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: TIMEZONE, day: "numeric", month: "numeric" });

/** تسمية محور الزمن: اليوم «15/11»، والساعة «9 م» — وأول ساعات اليوم باسم يومه. */
export function tickLabel(iso: string, bucket: Bucket): string {
  if (bucket === "day") return shortDay.format(toDate(iso));
  const hour = riyadhHour(iso);
  return hour === 0 ? weekday.format(toDate(iso)) : clockLabel(hour);
}
