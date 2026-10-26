import { describe, expect, it } from "vitest";
import { eligibilityLines, type JourneyEligibility } from "./final-card";

const base: JourneyEligibility = {
  examId: "e",
  examName: "الاختبار النهائي",
  eligible: false,
  decided: false,
  percent: 80,
  entryPercentage: 100,
  prerequisiteName: "الاختبار المرحلي",
  prerequisitePassed: false,
};

describe("حالة التأهل", () => {
  it("المبدئي يذكر أسبابه كلها", () => {
    const out = eligibilityLines(base);
    expect(out[0]).toBe("لم تتأهل مبدئياً للاختبار النهائي:");
    expect(out.some((l) => l.startsWith("لم تبلغ نسبة الإنجاز"))).toBe(true);
    expect(out).toContain("لم تجتز «الاختبار المرحلي».");
  });

  it("سببٌ واحد حين يكون وحده", () => {
    const out = eligibilityLines({ ...base, percent: 100 });
    expect(out.some((l) => l.startsWith("لم تبلغ نسبة الإنجاز"))).toBe(false);
    expect(out).toContain("لم تجتز «الاختبار المرحلي».");
  });

  it("المتأهل مبدئياً · والقرار المسجَّل بلا «مبدئياً»", () => {
    expect(eligibilityLines({ ...base, eligible: true })[0]).toMatch(/^تأهلت مبدئياً/);
    expect(eligibilityLines({ ...base, eligible: true, decided: true })[0]).toMatch(/^تأهلت للاختبار النهائي/);
    expect(eligibilityLines({ ...base, decided: true })).toEqual(["لم تتأهل للاختبار النهائي. لمراجعة القرار تواصل مع إدارة البرنامج."]);
  });
});
