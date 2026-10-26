import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format";
import {
  canMark,
  cardStatus,
  remainingText,
  afterDaysText,
  autoCompletes,
  canUndo,
  commitmentLabel,
  daysLeftText,
  daysText,
  daysUntil,
  defaultDay,
  followsPlan,
  leftText,
  minutesLeft,
  pace,
  parseJourneyState,
  primaryIndex,
  resolveDay,
  timesText,
  type JourneyState,
} from "./journey";

function state(over: Partial<JourneyState> = {}): JourneyState {
  return {
    creditedDays: 0,
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
    judgeStart: "2026-10-01",
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

  it("القادم يُفتح للاطّلاع حتى آخر الخطة، وما وراءها يُصحَّح", () => {
    expect(resolveDay(state(), 3)).toBe(3);
    // اليوم القادم يُفتح للاطّلاع حتى آخر الخطة (الهجرة ٠٩٥) — وما وراءها يُصحَّح.
    expect(resolveDay(state(), 6)).toBe(6);
    expect(resolveDay(state({ dayCount: 40 }), 41)).toBe(5);
    expect(resolveDay(state({ stage: "not_started", currentDay: 1, doneDays: 0 }), 3)).toBe(1);
    expect(resolveDay(state(), 0)).toBe(5);
    expect(resolveDay(state({ stage: "done_today", currentDay: 6 }), 6)).toBe(6);
  });
});

describe("الرصد والتراجع", () => {
  it("يُرصد اليوم الحالي وحده وهو يرصد", () => {
    expect(canMark(state(), 5, "10:00")).toBe(true);
    // اليوم القادم يُعرض ولا يُرصد.
    expect(canMark(state(), 6, "10:00")).toBe(false);
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
    expect(pace(state({ dueDays: 4, doneDays: 1 })).text).toBe("متأخر 3 أيام");
    expect(pace(state({ dueDays: 4, doneDays: 6 })).text).toBe("متقدّم يومين");
  });
});

describe("صيغ", () => {
  it("الأيام على وجوهها الأربعة", () => {
    expect(daysText(1)).toBe("يوماً واحداً");
    expect(daysText(2)).toBe("يومين");
    expect(daysText(3)).toBe("3 أيام");
    expect(daysText(11)).toBe("11 يوماً");
    expect(daysText(103)).toBe("103 أيام");
    expect(daysText(100)).toBe("100 يوم");
    expect(daysText(102)).toBe("102 يوم");
    expect(daysText(111)).toBe("111 يوماً");
    expect(timesText(100)).toBe("100 مرة");
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

describe("شاشة اليوم", () => {
  it("**الوقت الباقي** حتى نهاية الرصد، وصفرٌ بعده", () => {
    expect(minutesLeft("17:48", "23:59")).toBe(371);
    expect(minutesLeft("23:59", "23:59")).toBe(0);
    expect(minutesLeft("23:59", "22:00")).toBe(0);
    expect(leftText(371)).toBe(`${formatNumber(6)}س ${formatNumber(11)}د`);
    expect(leftText(40)).toBe(`${formatNumber(40)}د`);
  });

  it("**الأيام حتى البداية** — وصفرٌ يومها وبعدها", () => {
    expect(daysUntil("2026-10-14", "2026-10-23")).toBe(9);
    expect(daysUntil("2026-10-23", "2026-10-23")).toBe(0);
    expect(daysUntil("2026-10-25", "2026-10-23")).toBe(0);
    expect(daysLeftText(1)).toBe("يومٌ واحد");
    expect(daysLeftText(2)).toBe("يومان");
  });

  it("**الخطوة الحالية:** أول إلزاميٍّ لم يُرصد", () => {
    const s = (isRequired: boolean, marked: boolean) => ({ isRequired, markedAt: marked ? "t" : null });
    expect(primaryIndex([s(true, true), s(true, false), s(true, false)])).toBe(1);
    expect(primaryIndex([s(false, false), s(true, false)])).toBe(1);
    expect(primaryIndex([s(true, true), s(false, false)])).toBe(1);
    expect(primaryIndex([s(true, true)])).toBe(-1);
  });

  it("**الإتمام التلقائي** على زيادةٍ أكّدتها القاعدة وحدها", () => {
    const base = { delta: 1 as const, confirmed: 15, repetition: 15, inflight: 0, marked: false };
    expect(autoCompletes(base)).toBe(true);
    expect(autoCompletes({ ...base, delta: -1 })).toBe(false); // الإنقاص لا يُتمّ
    expect(autoCompletes({ ...base, confirmed: 14 })).toBe(false); // ما لم تؤكّده القاعدة
    expect(autoCompletes({ ...base, inflight: 1 })).toBe(false); // ضغطةٌ معلّقة بعد
    expect(autoCompletes({ ...base, marked: true })).toBe(false);
    expect(autoCompletes({ ...base, repetition: null })).toBe(false);
  });
});

describe("صيغ العدد في شاشة اليوم", () => {
  it("**بعد الأيام** مجرورةً، **والتكرار** بتمييزه", () => {
    expect(afterDaysText(1)).toBe("يومٍ واحد");
    expect(afterDaysText(2)).toBe("يومين");
    expect(afterDaysText(9)).toBe(`${formatNumber(9)} أيام`);
    expect(timesText(2)).toBe("مرتان");
    expect(timesText(5)).toBe(`${formatNumber(5)} مرات`);
    expect(timesText(15)).toBe(`${formatNumber(15)} مرةً`);
  });
});

describe("بطاقة البرنامج في «رحلتي»", () => {
  const step = (isRequired: boolean, marked: boolean) => ({ isRequired, markedAt: marked ? "2026-10-05T08:00:00Z" : null });

  it("**العدّ بالإلزامي وحده** — والاختياري لا يظهر في العدد", () => {
    const r = cardStatus(state(), [step(true, true), step(true, false), step(false, true)]);
    expect(r).toEqual({ tone: "now", text: `واجب اليوم: ${formatNumber(1)} من ${formatNumber(2)}` });
  });

  it("بلا إلزامي يُعدّ الكل", () => {
    expect(cardStatus(state(), [step(false, true), step(false, false)]).text).toBe(
      `واجب اليوم: ${formatNumber(1)} من ${formatNumber(2)}`,
    );
  });

  it("المرحَّل · الراحة · المُتَمّ · الحدّ · الختم", () => {
    expect(cardStatus(state({ carried: true }), [step(true, false)]).tone).toBe("warn");
    expect(cardStatus(state({ isProgramDay: false }), []).text).toBe("يوم راحة");
    expect(cardStatus(state({ stage: "done_today" }), []).text).toBe("أتممت واجب اليوم");
    expect(cardStatus(state({ stage: "limit" }), []).tone).toBe("done");
    expect(cardStatus(state({ stage: "finished" }), []).text).toBe("أتممت الخطة");
  });

  it("قبل البداية بعدد الأيام", () => {
    expect(cardStatus(state({ stage: "not_started", today: "2026-10-01", startDate: "2026-10-03" }), []).text).toBe(
      "يبدأ بعد يومين",
    );
    expect(cardStatus(state({ stage: "not_started", today: "2026-10-03", startDate: "2026-10-03" }), []).text).toBe("يبدأ اليوم");
  });

  it("**المرحَّل يُقال في يوم الراحة**، والراحة بعد بدءٍ فيها عدٌّ لا راحة (المراجعة ٣)", () => {
    expect(cardStatus(state({ carried: true, isProgramDay: false }), [step(true, false)]).tone).toBe("warn");
    expect(cardStatus(state({ isProgramDay: false }), [step(true, true), step(true, false)]).tone).toBe("now");
  });

  it("أتمّ يومه وفتح التالي: لا يُستحثّ · وبلا خطوات بلا «٠ من ٠»", () => {
    expect(cardStatus(state({ completedToday: 1 }), [step(true, false)]).tone).toBe("done");
    expect(cardStatus(state(), []).text).toBe("واجب اليوم");
  });

  it("الباقي على الختم", () => {
    expect(remainingText(state({ dayCount: 40, doneDays: 38 }))).toBe("بقي يومان على الختم");
    expect(remainingText(state({ dayCount: 40, doneDays: 40 }))).toBe("");
  });
});
