import { describe, expect, it } from "vitest";
import { isRegisterPath } from "./register-steps";

describe("صفحة تسجيل في «next»", () => {
  it("**بمسارٍ محمول أو بدونه** (ملاحظات الجوال أ١)", () => {
    expect(isRegisterPath("/p/sunan-competition-1448/register")).toBe(true);
    expect(isRegisterPath("/p/sunan-competition-1448/register?track=abc")).toBe(true);
    expect(isRegisterPath("/p/x/registered")).toBe(false);
    expect(isRegisterPath("/journey")).toBe(false);
    expect(isRegisterPath("/p/a/b/register")).toBe(false);
  });
});
