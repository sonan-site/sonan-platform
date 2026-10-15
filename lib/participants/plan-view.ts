/**
 * صفحة «الخطة» — منطقٌ خالص بلا قاعدة (`adr/0050` · خطة صفحتي الخطة وإنجازي ش١).
 *
 * الأيام من `fn_my_plan`، والحال من `fn_journey_state`. ما هنا قراءةُ ذلك كلاماً: حال كل يوم
 * بمصطلحات `adr/0041`، وتاريخه المعروض، وتجميعه أسبوعاً أسبوعاً، وموضع محطات الاختبار بينها.
 */

import { formatNumber, toDateInput } from "@/lib/format";
import { countedText, spanParts, type TrackShare } from "@/lib/plans/engine";
import type { Material } from "@/lib/programs/material";
import type { JourneyState } from "./journey";

export type PlanTask = {
  fieldId: string;
  label: string;
  kind: "ranged" | "explicit" | "counted";
  isRequired: boolean;
  isMaterialLinked: boolean;
  countUnit: string | null;
  amount: number | null;
  ordFrom: number | null;
  ordTo: number | null;
  value: number | null;
  repetition: number | null;
};

export type PlanDay = {
  day: number;
  /** موعده المقرَّر — يومُ البرنامج الذي يقع عليه لو مضى في موعده. */
  scheduled: string | null;
  /** لما بقي: التاريخ المتوقَّع من يومه الحالي، يومُ برنامجٍ لكل يوم خطة. */
  expected: string | null;
  completedOn: string | null;
  stumbled: boolean;
  compensated: boolean;
  tasks: PlanTask[];
};

type Raw = {
  day_number: number;
  scheduled_date: string | null;
  expected_date: string | null;
  completed_on: string | null;
  stumbled: boolean;
  compensated: boolean;
  tasks: unknown;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** يقرأ ناتج `fn_my_plan` — ويرمي على شكلٍ لا يعرفه، فالصفحة تعرض خطأً لا خطةً مختلَقة. */
export function parsePlan(rows: Raw[]): PlanDay[] {
  return rows.map((r) => {
    if (!Array.isArray(r.tasks)) throw new Error("plan-tasks");
    return {
      day: r.day_number,
      scheduled: r.scheduled_date,
      expected: r.expected_date,
      completedOn: r.completed_on,
      stumbled: r.stumbled,
      compensated: r.compensated,
      tasks: (r.tasks as Record<string, unknown>[]).map((t) => ({
        fieldId: String(t["field_id"]),
        label: String(t["label"]),
        kind: t["kind"] as PlanTask["kind"],
        isRequired: Boolean(t["is_required"]),
        isMaterialLinked: Boolean(t["is_material_linked"]),
        countUnit: (t["count_unit"] as string | null) ?? null,
        amount: num(t["amount"]),
        ordFrom: num(t["ord_from"]),
        ordTo: num(t["ord_to"]),
        value: num(t["value"]),
        repetition: num(t["repetition"]),
      })),
    };
  });
}

/**
 * حال يوم الخطة — بمصطلحات `adr/0041`:
 * أتمّ · متعثّر (له صفُّ تعثّرٍ في أرشيف خطته) · متعثّر معوَّض · اليوم · متأخر (فات موعده ولم يُتمّ) · قادم.
 */
export type DayStatus = "done" | "slipped" | "recovered" | "now" | "overdue" | "ahead";

export function dayStatus(d: PlanDay, s: Pick<JourneyState, "stage" | "currentDay" | "doneDays" | "dueDays">): DayStatus {
  if (d.day <= s.doneDays) return d.stumbled ? (d.compensated ? "recovered" : "slipped") : "done";
  // «اليوم» ليومٍ مفتوحٍ يُرصد الآن وحده — بعد إتمام يومه فيومُه الحالي التالي، وليس «اليوم».
  if (s.stage === "tasks" && d.day === s.currentDay) return "now";
  if (d.day <= s.dueDays) return "overdue";
  return "ahead";
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  done: "أتمّ",
  slipped: "متعثّر",
  recovered: "متعثّر معوَّض",
  now: "اليوم",
  overdue: "متأخر",
  ahead: "قادم",
};

export type PlanFilter = "all" | "next" | "late";

export const isPlanFilter = (v: unknown): v is PlanFilter => v === "all" || v === "next" || v === "late";

/** `behind`: فات موعده ولم يُتمّ — فيومه الحالي المتأخر من «المتأخرة» وإن كان «اليوم» (المراجعة م١). */
export function matchesFilter(status: DayStatus, filter: PlanFilter, behind = false): boolean {
  if (filter === "next") return status === "now" || status === "overdue" || status === "ahead";
  if (filter === "late") return status === "slipped" || status === "recovered" || status === "overdue" || (status === "now" && behind);
  return true;
}

/** التاريخ المعروض: يوم إتمامه، وإلا المتوقَّع، وإلا المقرَّر. */
export const shownDate = (d: PlanDay): string | null => d.completedOn ?? d.expected ?? d.scheduled;

const DAY_MS = 86_400_000;
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/** بداية الأسبوع: السبت. */
const weekStart = (iso: string) => {
  const ms = dayMs(iso);
  const dow = new Date(ms).getUTCDay(); // ٠ الأحد … ٦ السبت
  return ms - ((dow + 1) % 7) * DAY_MS;
};

const shortFmt = new Intl.DateTimeFormat("ar-SA", {
  timeZone: "UTC",
  numberingSystem: "latn",
  calendar: "gregory",
  weekday: "short",
  day: "numeric",
  month: "short",
});
/** «الثلاثاء، 3 نوفمبر» — لتاريخٍ مجرّد `YYYY-MM-DD` بلا انزلاق منطقة. */
export const shortDate = (iso: string): string => shortFmt.format(new Date(dayMs(iso)));

export type Milestone = { examId: string; name: string; at: string; location: string; oral: boolean };

export type PlanItem = { kind: "day"; day: PlanDay; status: DayStatus } | { kind: "milestone"; milestone: Milestone };

export type PlanWeek = { index: number; from: string | null; to: string | null; done: number; total: number; items: PlanItem[] };

/**
 * الأسابيع: يُجمَع كل يومٍ بأسبوع تاريخه المعروض (السبت أوله)، ورقمُ الأسبوع من أول أيام الخطة —
 * ثابتٌ مهما كان المرشّح. والمحطة بعد آخر يومٍ تاريخه قبلها أو فيه.
 */
export function planWeeks(
  days: PlanDay[],
  statusOf: (d: PlanDay) => DayStatus,
  filter: PlanFilter,
  milestones: Milestone[],
  opts: { today: string; dueDays: number },
): PlanWeek[] {
  const first = days.map(shownDate).find((x): x is string => x !== null);
  const origin = first ? weekStart(first) : 0;
  const weeks = new Map<number, PlanWeek>();
  const weekOf = (d: PlanDay) => {
    const date = shownDate(d);
    return date && first ? Math.floor((weekStart(date) - origin) / (7 * DAY_MS)) + 1 : 1;
  };

  for (const d of days) {
    const index = weekOf(d);
    const week = weeks.get(index) ?? { index, from: null, to: null, done: 0, total: 0, items: [] };
    const status = statusOf(d);
    const date = shownDate(d);
    week.total += 1;
    if (status === "done" || status === "slipped" || status === "recovered") week.done += 1;
    if (date) {
      if (!week.from || date < week.from) week.from = date;
      if (!week.to || date > week.to) week.to = date;
    }
    if (matchesFilter(status, filter, d.day <= opts.dueDays)) week.items.push({ kind: "day", day: d, status });
    weeks.set(index, week);
  }

  // المحطات في المرشّحَين «الكل» و«القادمة» — فالمتأخرة أيامٌ لا مواعيد.
  if (filter !== "late") {
    const ordered = [...weeks.values()].sort((a, b) => a.index - b.index);
    for (const m of milestones) {
      const on = toDateInput(m.at);
      // «القادمة» لا تحمل محطةً مضت (المراجعة م٢).
      if (filter === "next" && on < opts.today) continue;
      // آخر عنصرٍ تاريخه قبل المحطة أو فيه — يومٌ أو محطةٌ قبلها في اليوم نفسه — والمحطة بعده.
      let target: PlanWeek | undefined;
      let after = -1;
      for (const w of ordered) {
        w.items.forEach((it, i) => {
          const date = it.kind === "day" ? shownDate(it.day) : toDateInput(it.milestone.at);
          if (date && date <= on) {
            target = w;
            after = i;
          }
        });
      }
      // قبل كل الأيام: أول أسبوعٍ فيه عناصر، لا أسبوعٌ فارغ يُبعث برأسه.
      if (!target) {
        target = ordered.find((w) => w.items.length > 0);
        after = -1;
      }
      target?.items.splice(after + 1, 0, { kind: "milestone", milestone: m });
    }
  }

  return [...weeks.values()].sort((a, b) => a.index - b.index).filter((w) => w.items.length > 0);
}

/** سطور حقلٍ في يوم — بالمنطق نفسه الذي في شاشة اليوم. */
export function taskLines(t: PlanTask, share: TrackShare, material: Material): string[] {
  if (t.kind === "counted") return [countedText(t.value, t.countUnit)];
  if (t.kind === "explicit" && t.isMaterialLinked && (t.ordFrom === null || t.ordTo === null)) return ["خارج نصيب مسارك"];
  return spanParts(t.isMaterialLinked, share, material, t.ordFrom, t.ordTo).map((p) => p.text);
}

/** سطر اليوم في القائمة: مدى الحقل الأول المرتبط بالمادة، ثم أسماء الباقي. */
export function daySummary(d: PlanDay, share: TrackShare, material: Material): string {
  const lead = d.tasks.find((t) => t.kind !== "counted" && t.isMaterialLinked && t.isRequired) ?? d.tasks[0];
  if (!lead) return "";
  const rest = d.tasks.filter((t) => t !== lead).map((t) => t.label);
  return [`${lead.label}: ${taskLines(lead, share, material).join("، ")}`, ...rest].join(" · ");
}

/** «تكرار 15» لما له تكرار. */
export const repetitionText = (t: PlanTask): string | null =>
  t.repetition ? `تكرار ${formatNumber(t.repetition)}` : null;
