import { describe, expect, it } from "vitest";
import { dayStatus, matchesFilter, parsePlan, planWeeks, shortDate, type PlanDay } from "./plan-view";

const day = (n: number, over: Partial<PlanDay> = {}): PlanDay => ({
  day: n,
  scheduled: null,
  expected: null,
  completedOn: null,
  stumbled: false,
  compensated: false,
  credited: false,
  tasks: [],
  ...over,
});
const s = { stage: "tasks" as const, currentDay: 4, doneDays: 3, dueDays: 5 };

describe("حال يوم الخطة (adr/0041)", () => {
  it("**أتمّ · متعثّر · متعثّر معوَّض · اليوم · متأخر · قادم**", () => {
    expect(dayStatus(day(1), s)).toBe("done");
    expect(dayStatus(day(2, { stumbled: true }), s)).toBe("slipped");
    expect(dayStatus(day(3, { stumbled: true, compensated: true }), s)).toBe("recovered");
    expect(dayStatus(day(4), s)).toBe("now");
    expect(dayStatus(day(5), s)).toBe("overdue");
    expect(dayStatus(day(6), s)).toBe("ahead");
  });

  it("**بعد إتمام يومه لا «اليوم»** — يومه الحالي هو التالي ولم يُفتح", () => {
    expect(dayStatus(day(4), { ...s, stage: "done_today", dueDays: 3 })).toBe("ahead");
    expect(dayStatus(day(1), { ...s, stage: "not_started", currentDay: 1, doneDays: 0, dueDays: 0 })).toBe("ahead");
  });

  it("المرشّحات: القادمة بلا المُتمّ، والمتأخرة المتعثّر والمتأخر", () => {
    expect(matchesFilter("done", "next")).toBe(false);
    expect(matchesFilter("overdue", "next")).toBe(true);
    expect(matchesFilter("recovered", "late")).toBe(true);
    expect(matchesFilter("ahead", "late")).toBe(false);
    // اليوم الحالي المتأخر من «المتأخرة» (المراجعة م١).
    expect(matchesFilter("now", "late", true)).toBe(true);
    expect(matchesFilter("now", "late", false)).toBe(false);
  });
});

describe("الأسابيع والمحطات", () => {
  // السبت ٣١ أكتوبر ٢٠٢٦ أول الأسبوع.
  const days = [
    day(1, { completedOn: "2026-11-01" }),
    day(2, { completedOn: "2026-11-02" }),
    day(3, { expected: "2026-11-07" }),
    day(4, { expected: "2026-11-08" }),
  ];
  const OPTS = { today: "2026-11-03", dueDays: 2 };
  const status = (d: PlanDay) => dayStatus(d, { stage: "tasks", currentDay: 3, doneDays: 2, dueDays: 2 });

  it("**السبت أول الأسبوع**، ورقمه من أول أيام الخطة ثابتٌ مع المرشّح", () => {
    const all = planWeeks(days, status, "all", [], OPTS);
    expect(all.map((w) => [w.index, w.total, w.done])).toEqual([
      [1, 2, 2],
      [2, 2, 0],
    ]);
    expect(planWeeks(days, status, "next", [], OPTS).map((w) => w.index)).toEqual([2]);
  });

  it("**المحطة بعد آخر يومٍ تاريخه قبلها** — ولا محطات في «المتأخرة»", () => {
    const m = { examId: "e", name: "المرحلي", at: "2026-11-07T16:00:00+03:00", location: "", oral: false };
    const items = planWeeks(days, status, "all", [m], OPTS).flatMap((w) => w.items.map((i) => (i.kind === "day" ? i.day.day : "م")));
    expect(items).toEqual([1, 2, 3, "م", 4]);
    expect(planWeeks(days, status, "late", [m], OPTS).flatMap((w) => w.items)).toEqual([]);
  });

  it("**«القادمة» بلا محطةٍ مضت**، ولا أسبوعٌ فارغ يُبعث بها", () => {
    const past = { examId: "p", name: "مضى", at: "2026-10-20T16:00:00+03:00", location: "", oral: false };
    const next = planWeeks(days, status, "next", [past], OPTS);
    expect(next.flatMap((w) => w.items).some((i) => i.kind === "milestone")).toBe(false);
    expect(next.map((w) => w.index)).toEqual([2]);
  });

  it("محطتان في يومٍ واحد بترتيبهما", () => {
    const a = { examId: "a", name: "أ", at: "2026-11-07T09:00:00+03:00", location: "", oral: false };
    const b = { examId: "b", name: "ب", at: "2026-11-07T18:00:00+03:00", location: "", oral: false };
    const names = planWeeks(days, status, "all", [a, b], OPTS).flatMap((w) =>
      w.items.map((i) => (i.kind === "day" ? i.day.day : i.milestone.name)),
    );
    expect(names).toEqual([1, 2, 3, "أ", "ب", 4]);
  });

  it("**المتأخر في أسبوع موعده** لا في أسبوعٍ لم يبدأ (صوتك ١٢ نوفمبر)", () => {
    // بدأ السبت ٧ نوفمبر، والجمعة ليست يوم برنامج. ليلة الخميس ١٢ بعد ١١ م: أتمّ ٥ والمستحق ٦،
    // فتاريخ اليوم السادس المتوقَّع السبت ١٤ — وموعده الخميس ١٢.
    const plan = [
      ...[1, 2, 3, 4, 5].map((n) => day(n, { completedOn: `2026-11-${String(6 + n + (n > 1 ? 1 : 0)).padStart(2, "0")}` })),
      day(6, { scheduled: "2026-11-12", expected: "2026-11-14" }),
      day(7, { scheduled: "2026-11-14", expected: "2026-11-15" }),
    ];
    const st = (d: PlanDay) => dayStatus(d, { stage: "done_today", currentDay: 6, doneDays: 5, dueDays: 6 });
    expect(st(plan[5]!)).toBe("overdue");
    const weeks = planWeeks(plan, st, "all", [], { today: "2026-11-12", dueDays: 6 });
    expect(weeks.map((w) => [w.index, w.items.map((i) => (i.kind === "day" ? i.day.day : "م"))])).toEqual([
      [1, [1, 2, 3, 4, 5, 6]],
      [2, [7]],
    ]);
    expect(weeks[0]!.to).toBe("2026-11-12");
    // و«المتأخرة» تعرضه في أسبوعه نفسه.
    expect(planWeeks(plan, st, "late", [], { today: "2026-11-12", dueDays: 6 }).map((w) => w.index)).toEqual([1]);
    // ومحطةٌ يوم الجمعة ١٣ بعده لا قبله.
    const m = { examId: "x", name: "م", at: "2026-11-13T16:00:00+03:00", location: "", oral: false };
    const order = planWeeks(plan, st, "all", [m], { today: "2026-11-12", dueDays: 6 }).flatMap((w) =>
      w.items.map((i) => (i.kind === "day" ? i.day.day : "م")),
    );
    expect(order).toEqual([1, 2, 3, 4, 5, 6, "م", 7]);
  });

  // أيامٌ مرتّبةٌ عبر الأسابيع كلها — لا يتقدّم يومٌ على أصغر منه رقماً (المراجعة م٢).
  const ordered = (weeks: ReturnType<typeof planWeeks>) => {
    const seq = weeks.flatMap((w) => w.items.flatMap((i) => (i.kind === "day" ? [i.day.day] : [])));
    return seq.every((n, i) => i === 0 || seq[i - 1]! < n);
  };

  it("**«اليوم» المتأخر كذلك** — الجمعة ولم يرصد شيئاً (المراجعة م١)", () => {
    const plan = [
      ...[1, 2, 3, 4, 5].map((n) => day(n, { completedOn: ["2026-11-07", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-11"][n - 1]! })),
      day(6, { scheduled: "2026-11-12", expected: "2026-11-14" }),
      day(7, { scheduled: "2026-11-14", expected: "2026-11-15" }),
    ];
    const st = (d: PlanDay) => dayStatus(d, { stage: "tasks", currentDay: 6, doneDays: 5, dueDays: 6 });
    expect(st(plan[5]!)).toBe("now");
    const weeks = planWeeks(plan, st, "all", [], { today: "2026-11-13", dueDays: 6 });
    expect(weeks.map((w) => [w.index, w.items.map((i) => (i.kind === "day" ? i.day.day : "م"))])).toEqual([
      [1, [1, 2, 3, 4, 5, 6]],
      [2, [7]],
    ]);
    expect(planWeeks(plan, st, "late", [], { today: "2026-11-13", dueDays: 6 }).map((w) => w.index)).toEqual([1]);
  });

  it("**من يعوّض يبقى مرتّباً** — أتمّ الخامس اليوم والمستحق سبعة", () => {
    // الإثنين ١٦ نوفمبر: أتمّ ١–٤ في الأسبوع الأول والخامس اليوم، والسادس والسابع فات موعدهما.
    const plan = [
      ...[1, 2, 3, 4].map((n) => day(n, { completedOn: `2026-11-${String(6 + n).padStart(2, "0")}` })),
      day(5, { completedOn: "2026-11-16" }),
      day(6, { scheduled: "2026-11-12", expected: "2026-11-17" }),
      day(7, { scheduled: "2026-11-14", expected: "2026-11-18" }),
      day(8, { scheduled: "2026-11-15", expected: "2026-11-19" }),
    ];
    for (const stage of ["done_today", "tasks"] as const) {
      const st = (d: PlanDay) => dayStatus(d, { stage, currentDay: 6, doneDays: 5, dueDays: 7 });
      const weeks = planWeeks(plan, st, "all", [], { today: "2026-11-16", dueDays: 7 });
      expect(ordered(weeks), stage).toBe(true);
      expect(weeks.map((w) => w.items.map((i) => (i.kind === "day" ? i.day.day : "م"))), stage).toEqual([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ]);
    }
  });

  it("التاريخ القصير بلا انزلاق منطقة", () => {
    expect(shortDate("2026-11-03")).toMatch(/3/);
  });
});

describe("قراءة fn_my_plan", () => {
  it("**شكلٌ غريب يُرمى** لا يُختلَق", () => {
    expect(() =>
      parsePlan([{ day_number: 1, scheduled_date: null, expected_date: null, completed_on: null, stumbled: false, compensated: false, tasks: {} }]),
    ).toThrow();
  });
});

describe("المحتسب من مسارٍ سابق", () => {
  it("يومٌ متمٌّ محتسب يُوسم «محتسب» لا «أتمّ»، ولا يدخل «المتأخرة»", () => {
    const s = { stage: "tasks" as const, currentDay: 6, doneDays: 5, dueDays: 6 };
    expect(dayStatus(day(3, { credited: true }), s)).toBe("credited");
    expect(dayStatus(day(3), s)).toBe("done");
    expect(matchesFilter("credited", "late")).toBe(false);
    expect(matchesFilter("credited", "next")).toBe(false);
    expect(matchesFilter("credited", "all")).toBe(true);
  });
});
