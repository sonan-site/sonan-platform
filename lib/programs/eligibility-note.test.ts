import { describe, expect, it } from "vitest";
import { eligibilityNote } from "./eligibility-note";

describe("eligibilityNote", () => {
  it("يجمع الشروط الثلاثة كما في مسابقة ١٤٤٨", () => {
    expect(eligibilityNote({ minAge: 7, allowedGender: "male", requireSaudiPhone: true })).toBe(
      "المسابقة للذكور من 7 سنوات فأكثر، وتشترط رقم جوال سعودي.",
    );
  });

  it("يميّز «سنوات» من «سنة»", () => {
    expect(eligibilityNote({ minAge: 15, allowedGender: null, requireSaudiPhone: false })).toBe(
      "المسابقة من 15 سنة فأكثر.",
    );
  });

  it("الجوال وحده", () => {
    expect(eligibilityNote({ minAge: null, allowedGender: null, requireSaudiPhone: true })).toBe(
      "تشترط المسابقة رقم جوال سعودي.",
    );
  });

  it("بلا شرط: لا سطر", () => {
    expect(eligibilityNote({ minAge: null, allowedGender: null, requireSaudiPhone: false })).toBeNull();
  });
});
