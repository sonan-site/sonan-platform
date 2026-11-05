import { describe, expect, it } from "vitest";
import { ageLabel, ageOn, birthYears, daysInMonth, initialMonth, monthGrid, parseDateInput, toDateValue } from "./calendar";

describe("حساب التقويم", () => {
  it("يقرأ التاريخ الصحيح ويرفض ما ليس تاريخاً", () => {
    expect(parseDateInput("1998-11-16")).toEqual({ year: 1998, month: 11, day: 16 });
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("2026-13-01")).toBeNull();
    expect(parseDateInput("١٩٩٨-١١-١٦")).toBeNull();
  });

  it("فبراير الكبيسة تسعة وعشرون", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it("الشبكة أسابيعُ كاملة، وأول يوم تحت اسم يومه", () => {
    // ١ نوفمبر ٢٠٢٦ يقع يوم الأحد — أول أعمدة الشبكة.
    const weeks = monthGrid(2026, 11);
    expect(weeks[0]![0]).toBe(1);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((d) => d !== null)).toHaveLength(30);
  });

  it("الشهر الذي يبدأ في وسط الأسبوع تسبقه خانات فارغة", () => {
    // ١ يناير ٢٠٢٦ يوم الخميس: أربع خانات فارغة قبله.
    const weeks = monthGrid(2026, 1);
    expect(weeks[0]!.slice(0, 4)).toEqual([null, null, null, null]);
    expect(weeks[0]![4]).toBe(1);
  });

  it("يكتب القيمة بصيغة التخزين", () => {
    expect(toDateValue({ year: 2001, month: 3, day: 7 })).toBe("2001-03-07");
  });

  it("سنوات الميلاد مئة وواحدة، الأحدث أولاً", () => {
    const years = birthYears();
    expect(years).toHaveLength(101);
    expect(years[0]! - years[100]!).toBe(100);
  });

  it("الميلاد الفارغ يُفتح بلا سنة، وذو القيمة على شهرها", () => {
    expect(initialMonth("", "birth")).toEqual({ year: null, month: 1 });
    expect(initialMonth("2016-05-20", "birth")).toEqual({ year: 2016, month: 5 });
    expect(initialMonth("", "event").year).not.toBeNull();
  });

  it("العمر بالسنوات الكاملة يوم الحساب", () => {
    const at = new Date("2026-11-05T09:00:00Z");
    expect(ageOn("2016-11-05", at)).toBe(10);
    expect(ageOn("2016-11-06", at)).toBe(9);
    expect(ageOn("2027-01-01", at)).toBeNull();
    expect(ageOn("", at)).toBeNull();
  });

  it("نص العمر تحت الحقل", () => {
    const at = new Date("2026-11-05T09:00:00Z");
    expect(ageLabel("2016-01-01", at)).toBe("العمر: 10 سنوات");
    expect(ageLabel("2006-01-01", at)).toBe("العمر: 20 سنة");
    expect(ageLabel("", at)).toBeNull();
  });
});
