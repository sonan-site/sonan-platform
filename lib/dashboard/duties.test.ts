import { describe, expect, it } from "vitest";
import { dutyHeadline, dutyOpens, dutyPace, dutyState, type DutyRow } from "./duties";

const duty = (over: Partial<DutyRow> = {}): DutyRow => ({
  participantId: "pa1",
  programName: "مسابقة سنن",
  programStatus: "published",
  trackName: "المسار الأول",
  followsPlan: true,
  dayCount: 30,
  doneDays: 6,
  progressPct: 20,
  dueDays: 6,
  lastMarkedAt: null,
  proposedTrack: null,
  contact: "",
  ...over,
});

describe("حال المشارك في لوحته", () => {
  it("**يومٌ جارٍ بانتظاره**", () => {
    expect(dutyState(duty())).toBe("working");
    expect(dutyHeadline(duty())).toBe("اليوم 7 من 30");
  });

  it("**وبإتمام أيامها كلها: أتمّ خطته** — وهي الحالة التي لا تقولها شاشة الرحلة", () => {
    const row = duty({ doneDays: 30 });
    expect(dutyState(row)).toBe("finished_plan");
    expect(dutyHeadline(row)).toContain("أتممتَ");
  });

  it("**وبلا خطةٍ لمساره: مسارٌ لا يُبدأ به**", () => {
    const row = duty({ dayCount: 0, doneDays: 0 });
    expect(dutyState(row)).toBe("not_ready");
    // ولا يُفتح له رابطٌ إلى شاشةٍ لا شيء فيها.
    expect(dutyOpens(row)).toBe(false);
  });

  it("ومن انتهت رحلته لا يُدعى إلى واجب", () => {
    const row = duty({ followsPlan: false });
    expect(dutyState(row)).toBe("ended");
    expect(dutyHeadline(row)).toContain("سجلّك محفوظ");
    // ويُفتح سجلّه: الرحلة تُقرأ بعد انتهائها.
    expect(dutyOpens(row)).toBe(true);
  });

  it("وانتهاء الرحلة يسبق كل شيء: حتى بلا خطةٍ لمساره", () => {
    expect(dutyState(duty({ followsPlan: false, dayCount: 0 }))).toBe("ended");
  });
});

describe("الموعد", () => {
  it("في موعده، ومتأخر، ومتقدّم", () => {
    expect(dutyPace(duty())).toBe("في موعدك");
    expect(dutyPace(duty({ dueDays: 9 }))).toBe("متأخر 3 أيام");
    expect(dutyPace(duty({ dueDays: 4 }))).toBe("متقدّم يومين");
  });

  it("ولا موعد لمن أتمّ أو انتهت رحلته", () => {
    expect(dutyPace(duty({ doneDays: 30, dueDays: 30 }))).toBeNull();
    expect(dutyPace(duty({ followsPlan: false }))).toBeNull();
  });
});
