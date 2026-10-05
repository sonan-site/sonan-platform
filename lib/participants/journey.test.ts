import { describe, expect, it } from "vitest";
import {
  canMark,
  canUndo,
  commitmentLabel,
  daysText,
  defaultDay,
  followsPlan,
  pace,
  parseJourneyState,
  resolveDay,
  type JourneyState,
} from "./journey";

function state(over: Partial<JourneyState> = {}): JourneyState {
  return {
    stage: "tasks",
    planId: "p",
    trackId: "t",
    dayCount: 40,
    currentDay: 5,
    doneDays: 4,
    completedToday: 0,
    lastCompletedToday: false,
    dailyLimit: 2,
    startDate: "2026-10-01",
    today: "2026-10-05",
    isProgramDay: true,
    deadline: "23:00",
    expectedDay: 5,
    dueDays: 4,
    progressPct: 10,
    progressUnits: 20,
    shareSize: 200,
    measure: "units",
    stumbled: 0,
    compensated: 0,
    carried: false,
    ...over,
  };
}

describe("قراءة الحال", () => {
  it("لا خطة = null", () => {
    expect(parseJourneyState({ state: "no_plan" })).toBeNull();
  });

  it("تُقرأ الحقول بأسمائها في القاعدة", () => {
    const s = parseJourneyState({
      state: "done_today",
      plan_id: "p1",
      track_id: "t1",
      day_count: 40,
      current_day: 6,
      done_days: 5,
      deadline: "21:30",
      is_program_day: true,
      measure: "days",
      carried: false,
    });
    expect(s).toMatchObject({ stage: "done_today", currentDay: 6, doneDays: 5, deadline: "21:30", measure: "days" });
  });

  it("حالٌ لا تُعرف تُرمى ولا تُختلَق", () => {
    expect(() => parseJourneyState({ state: "other" })).toThrow();
    expect(() => parseJourneyState(null)).toThrow();
  });
});

describe("اليوم المعروض", () => {
  it("من يرصد يرى يومه الحالي", () => {
    expect(defaultDay(state())).toBe(5);
  });

  it("من أتمّ يوماً اليوم يرى ما أتمّه لا ما لم يبدأه", () => {
    expect(defaultDay(state({ stage: "done_today", currentDay: 6 }))).toBe(5);
    expect(defaultDay(state({ stage: "limit", currentDay: 7 }))).toBe(6);
  });

  it("من أتمّ الخطة يرى آخر أيامها", () => {
    expect(defaultDay(state({ stage: "finished", currentDay: 41, doneDays: 40 }))).toBe(40);
  });

  it("لا يُفتح يومٌ بعد يومه، والرابط القديم يُصحَّح", () => {
    expect(resolveDay(state(), 3)).toBe(3);
    expect(resolveDay(state(), 6)).toBe(5);
    expect(resolveDay(state(), 0)).toBe(5);
    expect(resolveDay(state({ stage: "done_today", currentDay: 6 }), 6)).toBe(6);
  });
});

describe("الرصد والتراجع", () => {
  it("يُرصد اليوم الحالي وحده وهو يرصد", () => {
    expect(canMark(state(), 5, "10:00")).toBe(true);
    expect(canMark(state(), 4, "10:00")).toBe(false);
    expect(canMark(state({ stage: "done_today", currentDay: 6 }), 6, "10:00")).toBe(false);
    expect(canMark(state({ stage: "not_started" }), 5, "10:00")).toBe(false);
  });

  it("واليوم المتمّ للتوّ يُكمَل اختياريّه قبل وقت نهاية رصده", () => {
    const done = state({ stage: "done_today", currentDay: 6, lastCompletedToday: true });
    expect(canMark(done, 5, "10:00")).toBe(true);
    expect(canMark(done, 5, "23:30")).toBe(false);
    // أُتمّ في يومٍ سبق: أُغلق.
    expect(canMark(state({ stage: "finished", currentDay: 41, lastCompletedToday: false }), 40, "10:00")).toBe(false);
  });

  it("التراجع لرصد اليوم قبل وقت نهاية رصده", () => {
    expect(canUndo(state(), 5, "2026-10-05", "20:00")).toBe(true);
    expect(canUndo(state(), 5, "2026-10-05", "23:00")).toBe(false);
    expect(canUndo(state(), 5, "2026-10-04", "20:00")).toBe(false);
  });

  it("وعن اليوم المتمّ للتوّ ما لم يبدأ ما بعده", () => {
    expect(canUndo(state({ stage: "done_today", currentDay: 6 }), 5, "2026-10-05", "20:00")).toBe(true);
    expect(canUndo(state({ stage: "finished", currentDay: 41 }), 40, "2026-10-05", "20:00")).toBe(true);
    // بدأ السادس: «tasks» على السادس، فالخامس مغلق.
    expect(canUndo(state({ stage: "tasks", currentDay: 6 }), 5, "2026-10-05", "20:00")).toBe(false);
  });
});

describe("الموعد", () => {
  it("ما أتمّه مقابل ما انقضى وقته — من القاعدة", () => {
    expect(pace(state({ dueDays: 4, doneDays: 4 }))).toEqual({ tone: "on", text: "في موعدك" });
    expect(pace(state({ dueDays: 5, doneDays: 4 }))).toEqual({ tone: "behind", text: "متأخر يوماً واحداً" });
  });

  it("المتأخر والمتقدّم بأيامهما", () => {
    expect(pace(state({ dueDays: 4, doneDays: 1 })).text).toBe("متأخر ٣ أيام");
    expect(pace(state({ dueDays: 4, doneDays: 6 })).text).toBe("متقدّم يومين");
  });
});

describe("صيغ", () => {
  it("الأيام على وجوهها الأربعة", () => {
    expect(daysText(1)).toBe("يوماً واحداً");
    expect(daysText(2)).toBe("يومين");
    expect(daysText(3)).toBe("٣ أيام");
    expect(daysText(11)).toBe("١١ يوماً");
    expect(daysText(103)).toBe("١٠٣ أيام");
  });

  it("حكم الأرشيف — والمعوَّض يبقى متعثّراً", () => {
    expect(commitmentLabel("completed", false)).toBe("أتمّ");
    expect(commitmentLabel("exempt", false)).toBe("معفى برصيد التقدّم");
    expect(commitmentLabel("stumbled", true)).toBe("متعثّر · معوَّض");
  });

  it("الحالات التي تتبع الخطة", () => {
    expect(followsPlan("memorizing")).toBe(true);
    expect(followsPlan("withdrawn")).toBe(false);
  });
});
