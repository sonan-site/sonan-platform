import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateBoth,
  formatHijri,
  formatNumber,
  formatPercent,
  formatRelative,
  toDateInput,
  toLatinDigits,
} from "./index";

// تاريخ مثبَّت: الأربعاء ٢ سبتمبر ٢٠٢٦، ١٢:٠٠ ظهراً بتوقيت الرياض
const FIXED = new Date("2026-09-02T09:00:00Z");

describe("الأرقام", () => {
  it("العرض بأرقام هندية-عربية", () => {
    expect(formatNumber(1448)).toMatch(/[٠-٩]/);
    expect(formatNumber(1448)).not.toMatch(/[0-9]/);
  });

  it("النسبة بأرقام هندية-عربية وعلامة مئوية", () => {
    const out = formatPercent(0.85);
    expect(out).toMatch(/[٠-٩]/);
    expect(out).toMatch(/٨٥/);
  });

  it("التحويل للاتيني يعكس العرض", () => {
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });
});

describe("التاريخ", () => {
  it("الميلادي عربي بأرقام هندية", () => {
    const out = formatDate(FIXED);
    expect(out).toMatch(/[٠-٩]/);
    expect(out).toMatch(/٢٠٢٦/);
  });

  it("الهجري بأم القرى وسنة في نطاق ١٤٤٧–١٤٤٨", () => {
    const out = formatHijri(FIXED);
    expect(out).toMatch(/١٤٤[٧٨]/);
  });

  it("الصيغة المزدوجة تحمل التقويمين", () => {
    const out = formatDateBoth(FIXED);
    expect(out).toContain("·");
    expect(out).toMatch(/٢٠٢٦/);
    expect(out).toMatch(/١٤٤[٧٨]/);
  });

  it("صيغة الإدخال لاتينية وبتوقيت الرياض لا المتصفح", () => {
    expect(toDateInput(FIXED)).toBe("2026-09-02");
    // منتصف ليل UTC = الثالثة فجراً بالرياض — اليوم نفسه، لا الذي قبله
    expect(toDateInput(new Date("2026-09-02T00:00:00Z"))).toBe("2026-09-02");
    // التاسعة مساءً UTC = منتصف ليل الرياض التالي — اليوم التالي
    expect(toDateInput(new Date("2026-09-02T21:30:00Z"))).toBe("2026-09-03");
  });

  it("الفرق الزمني مقروء بالعربية", () => {
    const threeDaysLater = new Date(FIXED.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(formatRelative(threeDaysLater, FIXED)).toMatch(/[٠-٩]|غد/);
  });
});
