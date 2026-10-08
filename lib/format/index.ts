/**
 * منفذ التنسيق الوحيد — التاريخ والوقت والأرقام.
 *
 * الأرقام **لاتينية عرضاً وإدخالاً وتخزيناً** (`adr/0046`) — تُبطل في هذه المنصة
 * قاعدة `ui-ux.md` §١١.١ التي كانت تعرضها هندية-عربية.
 * و`guard-style` يمنع `new Date()` خارج هذه الوحدة: مصدر وقت واحد يعني أن
 * تثبيت الوقت في الاختبار ممكن، وأن المنطقة الزمنية تُضبط في موضع واحد.
 */

/** المنطقة الزمنية التشغيلية. القاعدة تخزّن `timestamptz`، والعرض يحوّل هنا. */
export const TIMEZONE = "Asia/Riyadh";
const LOCALE = "ar-SA";

/** **مصدر الوقت الوحيد.** كل ما يحتاج «الآن» يمرّ من هنا. */
export function now(): Date {
  return new Date();
}

/** «الآن» بصيغة ISO — لأعمدة `timestamptz` في القاعدة. */
export function nowIso(): string {
  return now().toISOString();
}

/** يبني تاريخاً من قيمة القاعدة. يقبل النصّ ISO أو التاريخ نفسه. */
export function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

// ── الأرقام ──

const displayDigits = new Intl.NumberFormat(LOCALE, { numberingSystem: "latn" });

/** رقم للعرض بالأرقام اللاتينية (0123) — `adr/0046`. */
export function formatNumber(value: number): string {
  return displayDigits.format(value);
}

/** نسبة مئوية للعرض. تُقرَّب لأقرب صحيح ما لم يُطلب غير ذلك. */
export function formatPercent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    numberingSystem: "latn",
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** رقم للإدخال أو للتخزين: لاتيني دائماً. */
export function toLatinDigits(value: number | string): string {
  return String(value).replace(/[٠-٩]/g, (d) =>
    String(d.charCodeAt(0) - 0x0660),
  );
}

// ── التاريخ ──

const gregorian = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  numberingSystem: "latn",
  calendar: "gregory",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  timeZone: TIMEZONE,
  numberingSystem: "latn",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const timeOnly = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  numberingSystem: "latn",
  hour: "2-digit",
  minute: "2-digit",
});

/** تاريخ ميلادي: «٢ سبتمبر ٢٠٢٦». */
export function formatDate(value: string | Date): string {
  return gregorian.format(toDate(value));
}

/** تاريخ هجري بأم القرى: «١٩ صفر ١٤٤٨ هـ». */
export function formatHijri(value: string | Date): string {
  return hijri.format(toDate(value));
}

/** الاثنان معاً — الصيغة المعتمدة في الوثائق الرسمية للجمعية. */
export function formatDateBoth(value: string | Date): string {
  return `${formatDate(value)} · ${formatHijri(value)}`;
}

/** وقت فقط: «٠٩:٤٥». */
export function formatTime(value: string | Date): string {
  return timeOnly.format(toDate(value));
}

/** تاريخ ووقت. */
export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)} — ${formatTime(value)}`;
}

/**
 * صيغة `YYYY-MM-DD` للتخزين والإدخال — **لاتينية دائماً**، بتوقيت الرياض
 * لا بتوقيت المتصفح، فلا ينزلق اليوم عند من يفتح المنصة من منطقة أخرى.
 */
export function toDateInput(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(value));
  return parts;
}

/** الرياض بلا توقيت صيفي، فالإزاحة ثابتة طوال السنة. */
const RIYADH_OFFSET = "+03:00";

/**
 * حدّا يومٍ `YYYY-MM-DD` بتوقيت الرياض — لنافذةٍ تُدخَل أياماً وتُخزَّن
 * `timestamptz`. فالتاريخ المجرّد يقرؤه Postgres منتصف ليل UTC، أي الثالثة
 * فجراً بالرياض: يُغلق يومُ الإغلاق قبل أن يبدأ، ويُفتح يومُ الفتح متأخراً.
 */
export function riyadhDayStart(day: string): string {
  return `${day}T00:00:00${RIYADH_OFFSET}`;
}

export function riyadhDayEnd(day: string): string {
  return `${day}T23:59:59.999${RIYADH_OFFSET}`;
}

/** صيغة `HH:MM` بتوقيت الرياض — لاتينية، تُقارَن بوقت نهاية الرصد كما تُخزَّن. */
export function toTimeInput(value: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(toDate(value));
}

/** وقتٌ مخزَّن `HH:MM` للعرض: «٩:٣٠ م». */
export function formatClock(value: string): string {
  const [h = 0, m = 0] = value.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${formatNumber(hour)}:${formatNumber(Math.floor(m / 10))}${formatNumber(m % 10)} ${h < 12 ? "ص" : "م"}`;
}

/** فرق زمني مقروء: «قبل ٣ أيام» · «بعد ساعتين». */
export function formatRelative(value: string | Date, from: Date = now()): string {
  const diffMs = toDate(value).getTime() - from.getTime();
  const rtf = new Intl.RelativeTimeFormat(`${LOCALE}-u-nu-latn`, { numeric: "auto" });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(0, "second");
}
