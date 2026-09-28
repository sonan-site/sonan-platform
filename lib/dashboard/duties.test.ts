import { describe, expect, it } from "vitest";
import { dutyCompletion, dutyHeadline, dutyOpens, dutyState, type DutyRow } from "./duties";

const duty = (over: Partial<DutyRow> = {}): DutyRow => ({
  participantId: "pa1",
  programName: "مسابقة سنن",
  programStatus: "published",
  trackName: "المسار الأول",
  followsPlan: true,
  workDays: 30,
  submittedDays: 6,
  completeDays: 5,
  currentDay: 7,
  lastSubmittedAt: null,
  proposedTrack: null,
  contact: "",
  ...over,
});

describe("حال المشارك في لوحته", () => {
  it("**يومٌ جارٍ بانتظاره**", () => {
    expect(dutyState(duty())).toBe("working");
    expect(dutyHeadline(duty())).toBe("اليوم ٧ من ٣٠");
  });

  it("**وبلا يومٍ باقٍ: أتمّ خطته** — وهي الحالة التي لا تقولها شاشة الرحلة", () => {
    const row = duty({ currentDay: null, submittedDays: 30, completeDays: 28 });
    expect(dutyState(row)).toBe("finished_plan");
    expect(dutyHeadline(row)).toContain("أتممتَ");
  });

  it("**وبلا يوم عملٍ واحد: مسارٌ لا يُبدأ به** — لا خطة أو لا مسار أو قالبٌ فارغ", () => {
    const row = duty({ workDays: 0, submittedDays: 0, completeDays: 0, currentDay: null });
    expect(dutyState(row)).toBe("not_ready");
    // ولا يُفتح له رابطٌ إلى شاشةٍ لا شيء فيها.
    expect(dutyOpens(row)).toBe(false);
  });

  it("ومن انتهت رحلته لا يُدعى إلى واجب", () => {
    const row = duty({ followsPlan: false, currentDay: null });
    expect(dutyState(row)).toBe("ended");
    expect(dutyHeadline(row)).toContain("سجلّك محفوظ");
    // ويُفتح سجلّه: الرحلة تُقرأ بعد انتهائها.
    expect(dutyOpens(row)).toBe(true);
  });

  it("**والإتمام: المكتملة ÷ المُرسَلة** — معادلة شاشة الرحلة نفسها", () => {
    expect(dutyCompletion(duty({ submittedDays: 4, completeDays: 3 }))).toBeCloseTo(0.75);
  });

  it("ومن لم يُرسل شيئاً إتمامه صفر لا قسمةٌ على صفر", () => {
    expect(dutyCompletion(duty({ submittedDays: 0, completeDays: 0 }))).toBe(0);
  });

  it("وانتهاء الرحلة يسبق كل شيء: حتى بلا خطةٍ لمساره", () => {
    expect(dutyState(duty({ followsPlan: false, workDays: 0 }))).toBe("ended");
  });
});
