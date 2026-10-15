/**
 * صفحة «إنجازي» — منطقٌ خالص (`adr/0050` · خطة صفحتي الخطة وإنجازي ش٢).
 *
 * خريطة الالتزام: أربعة أسابيع تنتهي بأسبوع اليوم (السبت أولها)، لكل يومٍ حاله من الأرشيف
 * بمصطلحات `adr/0041` — ومن التقويم: الراحة وما قبل البداية وما لم يأتِ.
 */

export type HeatKind =
  | "done" // أتمّ
  | "exempt" // معفى
  | "stumbled" // متعثّر
  | "recovered" // متعثّر معوَّض
  | "pending" // يوم برنامجٍ مضى ولم يُحكم عليه بعد
  | "rest" // راحة
  | "before" // قبل بدايته
  | "future"; // لم يأتِ

export type HeatCell = { date: string; kind: HeatKind; today: boolean };

export const HEAT_LABEL: Record<HeatKind, string> = {
  done: "أتمّ",
  exempt: "معفى",
  stumbled: "متعثّر",
  recovered: "متعثّر معوَّض",
  pending: "لم يُحكم عليه بعد",
  rest: "راحة",
  before: "قبل بدايتك",
  future: "لم يأتِ",
};

const DAY_MS = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** نطاق الخريطة: من سبت ما قبل ثلاثة أسابيع إلى جمعة أسبوع اليوم — ٢٨ يوماً. */
export function heatRange(today: string): { from: string; to: string } {
  const t = ms(today);
  const dow = new Date(t).getUTCDay(); // ٠ الأحد … ٦ السبت
  const saturday = t - ((dow + 1) % 7) * DAY_MS;
  return { from: iso(saturday - 21 * DAY_MS), to: iso(saturday + 6 * DAY_MS) };
}

export type ArchiveDay = { date: string; status: "completed" | "exempt" | "stumbled"; compensated: boolean };

/**
 * خلايا الخريطة صفّاً لكل أسبوع. اليوم قبل الحكم عليه: «أتمّ» إن أُتمّ فيه يوم، وإلا «لم يأتِ»
 * بحلقة اليوم — فلا يُعرض متعثّراً قبل وقت نهاية رصده.
 */
export function heatWeeks(input: {
  calendar: { date: string; isProgramDay: boolean }[];
  archive: ArchiveDay[];
  today: string;
  startDate: string;
  completedToday: number;
}): HeatCell[][] {
  const byDate = new Map(input.archive.map((a) => [a.date, a]));
  const cells: HeatCell[] = input.calendar.map(({ date, isProgramDay }) => {
    const today = date === input.today;
    const a = byDate.get(date);
    if (a) {
      const kind: HeatKind =
        a.status === "completed" ? "done" : a.status === "exempt" ? "exempt" : a.compensated ? "recovered" : "stumbled";
      return { date, kind, today };
    }
    if (date < input.startDate) return { date, kind: "before", today };
    if (!isProgramDay) return { date, kind: "rest", today };
    if (today) return { date, kind: input.completedToday > 0 ? "done" : "future", today };
    if (date > input.today) return { date, kind: "future", today };
    return { date, kind: "pending", today };
  });
  const weeks: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** أقرب اختبارٍ لم يحن — بترتيب موعده. */
export function nextExam<T extends { at: string }>(items: readonly T[], nowIso: string): T | null {
  // بالوقت لا بالنصّ: القاعدة تُرجع إزاحتها، والآن بـ«Z».
  const now = Date.parse(nowIso);
  return items.filter((m) => Date.parse(m.at) >= now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] ?? null;
}
