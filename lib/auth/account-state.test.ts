import { describe, expect, it } from "vitest";
import { accountState, suggestedName } from "./account-state";

describe("حالة الحساب", () => {
  it("**بلا ملف ← ناقص لا موقوف** — دخل بـ Google ولم يستكمل", () => {
    expect(accountState(null)).toBe("incomplete");
  });

  it("ملفٌ حيّ ← نشط", () => {
    expect(accountState({ deleted_at: null })).toBe("active");
  });

  it("ملفٌ محذوف حذفاً ليّناً ← موقوف", () => {
    expect(accountState({ deleted_at: "2026-09-15T10:00:00Z" })).toBe("suspended");
  });
});

describe("الاسم المقترح من مزوّد الدخول", () => {
  it("يأخذ `full_name` ثم `name`", () => {
    expect(suggestedName({ full_name: " إبراهيم الحسين " })).toBe("إبراهيم الحسين");
    expect(suggestedName({ name: "Ibrahim" })).toBe("Ibrahim");
  });

  it("بلا اسم ← فراغ لا خطأ", () => {
    expect(suggestedName(undefined)).toBe("");
    expect(suggestedName({ full_name: 42 })).toBe("");
  });
});
