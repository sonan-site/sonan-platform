import { describe, expect, it } from "vitest";
import {
  formatClock,
  toTimeInput,
  formatDate,
  formatDateBoth,
  formatHijri,
  formatNumber,
  formatPercent,
  formatRelative,
  riyadhDayEnd,
  riyadhDayStart,
  toDateInput,
  toLatinDigits,
} from "./index";

// تاريخ مثبَّت: الأربعاء ٢ سبتمبر ٢٠٢٦، ١٢:٠٠ ظهراً بتوقيت الرياض
const FIXED = new Date("2026-09-02T09:00:00Z");

describe("الأرقام", () => {
  it("**العرض بأرقام لاتينية** (adr/0046)", () => {
    expect(formatNumber(1448)).toMatch(/[0-9]/);
    expect(formatNumber(1448)).not.toMatch(/[٠-٩]/);
  });

  it("النسبة بأرقام لاتينية وعلامة مئوية", () => {
    const out = formatPercent(0.85);
    expect(out).not.toMatch(/[٠-٩]/);
    expect(out).toMatch(/85/);
  });

  it("التحويل للاتيني يعكس العرض", () => {
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });
});

describe("التاريخ", () => {
  it("الميلادي عربيٌّ بأرقام لاتينية", () => {
    const out = formatDate(FIXED);
    expect(out).not.toMatch(/[٠-٩]/);
    expect(out).toMatch(/2026/);
  });

  it("الهجري بأم القرى وسنة في نطاق ١٤٤٧–١٤٤٨", () => {
    const out = formatHijri(FIXED);
    expect(out).toMatch(/144[78]/);
  });

  it("الصيغة المزدوجة تحمل التقويمين", () => {
    const out = formatDateBoth(FIXED);
    expect(out).toContain("·");
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/144[78]/);
  });

  it("صيغة الإدخال لاتينية وبتوقيت الرياض لا المتصفح", () => {
    expect(toDateInput(FIXED)).toBe("2026-09-02");
    // منتصف ليل UTC = الثالثة فجراً بالرياض — اليوم نفسه، لا الذي قبله
    expect(toDateInput(new Date("2026-09-02T00:00:00Z"))).toBe("2026-09-02");
    // التاسعة مساءً UTC = منتصف ليل الرياض التالي — اليوم التالي
    expect(toDateInput(new Date("2026-09-02T21:30:00Z"))).toBe("2026-09-03");
  });

  it("**حدّا اليوم بتوقيت الرياض** — لا منتصف ليل UTC", () => {
    expect(new Date(riyadhDayStart("2026-10-17")).toISOString()).toBe("2026-10-16T21:00:00.000Z");
    expect(new Date(riyadhDayEnd("2026-10-17")).toISOString()).toBe("2026-10-17T20:59:59.999Z");
    // واليومان يعودان يومهما في صيغة الإدخال — فلا ينزلق تاريخ النموذج عند فتحه
    expect(toDateInput(riyadhDayStart("2026-10-17"))).toBe("2026-10-17");
    expect(toDateInput(riyadhDayEnd("2026-10-17"))).toBe("2026-10-17");
  });

  it("الفرق الزمني مقروء بالعربية", () => {
    const threeDaysLater = new Date(FIXED.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(formatRelative(threeDaysLater, FIXED)).toMatch(/[0-9]|غد/);
  });

  it("الساعة بتوقيت الرياض لاتينيةً للمقارنة، وبصيغة ١٢ ساعة للعرض", () => {
    expect(toTimeInput(new Date("2026-09-02T18:05:00Z"))).toBe("21:05");
    expect(toTimeInput(new Date("2026-09-02T21:00:00Z"))).toBe("00:00");
    expect(formatClock("21:05")).toBe("9:05 م");
    expect(formatClock("00:30")).toBe("12:30 ص");
    expect(formatClock("12:00")).toBe("12:00 م");
  });
});
