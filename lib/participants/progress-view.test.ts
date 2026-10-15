import { describe, expect, it } from "vitest";
import { heatRange, heatWeeks, nextExam, stripTarget, weekRange, weekStrip } from "./progress-view";

describe("خريطة الالتزام", () => {
  it("**أربعة أسابيع، السبت أولها، وتنتهي بأسبوع اليوم**", () => {
    // الخميس ١٥ أكتوبر ٢٠٢٦ — سبت أسبوعه ١٠ أكتوبر.
    expect(heatRange("2026-10-15")).toEqual({ from: "2026-09-19", to: "2026-10-16" });
    expect(heatRange("2026-10-10")).toEqual({ from: "2026-09-19", to: "2026-10-16" });
  });

  const calendar = [
    { date: "2026-10-10", isProgramDay: true },
    { date: "2026-10-11", isProgramDay: true },
    { date: "2026-10-12", isProgramDay: true },
    { date: "2026-10-13", isProgramDay: true },
    { date: "2026-10-14", isProgramDay: true },
    { date: "2026-10-15", isProgramDay: true },
    { date: "2026-10-16", isProgramDay: false },
  ];

  it("**حال كل يوم بمصطلحات adr/0041** — والراحة وما قبل البداية وما لم يُحكم عليه", () => {
    const [week] = heatWeeks({
      calendar,
      archive: [
        { date: "2026-10-11", status: "completed", compensated: false },
        { date: "2026-10-12", status: "stumbled", compensated: true },
        { date: "2026-10-13", status: "exempt", compensated: false },
      ],
      today: "2026-10-15",
      startDate: "2026-10-11",
      completedToday: 0,
    });
    expect(week!.map((c) => c.kind)).toEqual(["before", "done", "recovered", "exempt", "pending", "future", "rest"]);
    expect(week!.find((c) => c.today)?.date).toBe("2026-10-15");
  });

  it("**اليوم قبل الحكم: «أتمّ» إن أُتمّ فيه يوم** — لا متعثّراً قبل وقته", () => {
    const [week] = heatWeeks({ calendar, archive: [], today: "2026-10-15", startDate: "2026-10-01", completedToday: 1 });
    expect(week![5]).toEqual({ date: "2026-10-15", kind: "done", today: true });
  });
});

describe("الاختبار القادم", () => {
  it("**أقربُ ما لم يحن، بالوقت لا بالنصّ**", () => {
    const items = [
      { name: "مضى", at: "2026-10-01T09:00:00+00:00" },
      { name: "الثاني", at: "2026-12-01T09:00:00+00:00" },
      { name: "الأول", at: "2026-11-21T00:00:00+03:00" },
    ];
    expect(nextExam(items, "2026-10-15T07:00:00.000Z")?.name).toBe("الأول");
    expect(nextExam(items, "2027-01-01T00:00:00.000Z")).toBeNull();
  });
});

describe("شريط الأسبوع (ب١)", () => {
  it("**السبت إلى الجمعة**", () => {
    expect(weekRange("2026-10-15")).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    expect(weekRange("2026-10-16")).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    expect(weekRange("2026-10-17")).toEqual({ from: "2026-10-17", to: "2026-10-23" });
  });

  const cell = (over: Partial<{ date: string; today: boolean }> = {}) => ({ date: "2026-10-12", kind: "done" as const, today: false, ...over });
  const row = (planDay: number | null, completedDays: number[]) => ({ date: "2026-10-12", status: "completed" as const, compensated: false, planDay, completedDays });

  it("**آخر يومٍ أُتمّ فيه، وإلا المتعثَّر عليه** — في حدود ما يُفتح", () => {
    expect(stripTarget(cell(), row(5, [4, 5]), 9)).toBe(5);
    expect(stripTarget(cell(), row(6, []), 9)).toBe(6);
    expect(stripTarget(cell(), row(12, []), 9)).toBeNull();
    expect(stripTarget(cell(), undefined, 9)).toBeNull();
    expect(stripTarget(cell({ today: true }), undefined, 9)).toBe("today");
  });

  it("**حالاتٌ حدّية**: اليوم بعد إتمام يومٍ فيه · قبل البداية · معفى بلا يوم · يومٌ وراء ما يُفتح", () => {
    expect(stripTarget(cell(), row(null, []), 9)).toBeNull();
    expect(stripTarget(cell(), row(3, [10]), 9)).toBeNull();
    const cells = weekStrip({
      calendar: [
        { date: "2026-10-10", isProgramDay: true },
        { date: "2026-10-11", isProgramDay: true },
      ],
      archive: [],
      today: "2026-10-11",
      startDate: "2026-10-11",
      completedToday: 1,
      lastVisible: 3,
    });
    expect(cells.map((c) => [c.kind, c.target])).toEqual([
      ["before", null],
      ["done", "today"],
    ]);
  });

  it("الخلايا بحالها ووجهتها", () => {
    const cells = weekStrip({
      calendar: [
        { date: "2026-10-10", isProgramDay: true },
        { date: "2026-10-11", isProgramDay: true },
        { date: "2026-10-12", isProgramDay: false },
      ],
      archive: [{ date: "2026-10-10", status: "completed", compensated: false, planDay: 2, completedDays: [1, 2] }],
      today: "2026-10-11",
      startDate: "2026-10-01",
      completedToday: 0,
      lastVisible: 3,
    });
    expect(cells.map((c) => [c.kind, c.target])).toEqual([
      ["done", 2],
      ["future", "today"],
      ["rest", null],
    ]);
  });
});
