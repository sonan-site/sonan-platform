import { describe, expect, it } from "vitest";
import { heatRange, heatWeeks, nextExam } from "./progress-view";

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
