import { describe, expect, it } from "vitest";
import { accountState, suggestedName, type ProfileCompleteness } from "./account-state";

const complete: ProfileCompleteness = {
  deleted_at: null,
  first_name: "إبراهيم",
  father_name: "محمد",
  family_name: "الحسين",
  gender: "male",
  birth_date: "1990-01-01",
  nationality: "SA",
  phone: "+966501234567",
};

describe("حالة الحساب", () => {
  it("**بلا ملف ← ناقص لا موقوف** — دخل بـ Google ولم يستكمل", () => {
    expect(accountState(null)).toBe("incomplete");
  });

  it("ملفٌ مكتمل حيّ ← نشط", () => {
    expect(accountState(complete)).toBe("active");
  });

  it("ملفٌ محذوف حذفاً ليّناً ← موقوف، ولو كان ناقصاً", () => {
    expect(accountState({ ...complete, deleted_at: "2026-09-15T10:00:00Z" })).toBe("suspended");
    expect(accountState({ ...complete, first_name: null, deleted_at: "2026-09-15T10:00:00Z" })).toBe(
      "suspended",
    );
  });

  it("**ملفٌ قائم تنقصه بيانة إلزامية ← ناقص** — الحسابات القديمة تُستكمل مرة", () => {
    for (const key of ["first_name", "father_name", "family_name", "gender", "birth_date", "nationality"] as const) {
      expect(accountState({ ...complete, [key]: null }), key).toBe("incomplete");
    }
  });

  it("**جوالٌ بالصيغة القديمة ← ناقص** — يُعاد إدخاله بمفتاح دولته", () => {
    expect(accountState({ ...complete, phone: "0501234567" })).toBe("incomplete");
  });
});

describe("الاسم المقترح من Google", () => {
  it("من `given_name` و`family_name` إن وُجدا", () => {
    expect(suggestedName({ given_name: "Ibrahim", family_name: "Alhussain" })).toEqual({
      first: "Ibrahim",
      family: "Alhussain",
    });
  });

  it("وإلا من الاسم الكامل: أوله وآخره", () => {
    expect(suggestedName({ full_name: "جمعية سنن التعليمية" })).toEqual({
      first: "جمعية",
      family: "التعليمية",
    });
  });

  it("بلا اسم ← فراغ لا خطأ", () => {
    expect(suggestedName(undefined)).toEqual({ first: "", family: "" });
  });
});
