import { describe, expect, it } from "vitest";
import { registrationState, type ProgramWindow } from "./registration";

const AT = new Date("2026-09-02T09:00:00Z");

const base: ProgramWindow = {
  status: "published",
  capacity: null,
  opensAt: null,
  closesAt: null,
  registeredCount: 0,
};

describe("BR-CAP-01 — حالة التسجيل مشتقّة", () => {
  it("المسوّدة غير منشورة مهما كانت التواريخ", () => {
    expect(registrationState({ ...base, status: "draft" }, AT)).toBe("unpublished");
  });

  it("المغلق يدوياً مغلق ولو كانت نافذته مفتوحة", () => {
    expect(
      registrationState(
        { ...base, status: "closed", closesAt: "2027-01-01T00:00:00Z" },
        AT,
      ),
    ).toBe("closed");
  });

  it("قبل تاريخ الفتح: قريباً", () => {
    expect(registrationState({ ...base, opensAt: "2026-10-01T00:00:00Z" }, AT)).toBe(
      "not_open_yet",
    );
  });

  it("بعد تاريخ الإغلاق: مغلق", () => {
    expect(registrationState({ ...base, closesAt: "2026-08-01T00:00:00Z" }, AT)).toBe("closed");
  });

  it("لحظة الفتح بالضبط: مفتوح", () => {
    expect(registrationState({ ...base, opensAt: AT.toISOString() }, AT)).toBe("open");
  });

  it("لحظة الإغلاق بالضبط: مغلق — الحدّ الأعلى لا يشمل نفسه", () => {
    expect(registrationState({ ...base, closesAt: AT.toISOString() }, AT)).toBe("closed");
  });

  it("بلوغ السعة يُغلق التسجيل آلياً", () => {
    expect(registrationState({ ...base, capacity: 50, registeredCount: 50 }, AT)).toBe("full");
    expect(registrationState({ ...base, capacity: 50, registeredCount: 49 }, AT)).toBe("open");
  });

  it("السعة الفارغة = بلا سقف", () => {
    expect(registrationState({ ...base, capacity: null, registeredCount: 9999 }, AT)).toBe("open");
  });

  it("التاريخ يسبق السعة: مغلق ولو كان فيه متّسع", () => {
    expect(
      registrationState(
        { ...base, capacity: 50, registeredCount: 0, closesAt: "2026-08-01T00:00:00Z" },
        AT,
      ),
    ).toBe("closed");
  });
});
