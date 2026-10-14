import { describe, expect, it } from "vitest";
import { gateRedirect } from "./gate";

const go = (path: string, search: string, signedIn: boolean, isPublic = false) =>
  gateRedirect({ path, search, signedIn, isPublic });

describe("بوّابة الوسيط (رحلة التسجيل ت٢)", () => {
  it("**الزائر** يُردّ إلى بابه بوجهته واستعلامها", () => {
    expect(go("/journey/abc", "?day=3", false)).toBe(`/sign-in?next=${encodeURIComponent("/journey/abc?day=3")}`);
    expect(go("/programs/x", "", false)).toBe(`/admin?next=${encodeURIComponent("/programs/x")}`);
  });

  it("الصفحة العامة تمضي لكل أحد", () => {
    expect(go("/p/sunan/register", "?track=1", false, true)).toBeNull();
    expect(go("/journey", "", true)).toBeNull();
  });

  it("**الداخل على صفحة دخول** يُردّ إلى وجهته الآمنة لا إلى اللوحة", () => {
    expect(go("/sign-in", `?next=${encodeURIComponent("/p/sunan/register?track=7")}`, true, true)).toBe(
      "/p/sunan/register?track=7",
    );
    expect(go("/sign-up", "", true, true)).toBe("/dashboard");
  });

  it("**لا تحويل مفتوح ولا دوران:** الخارجية وصفحات الدخول تُستبدل باللوحة", () => {
    expect(go("/sign-in", "?next=//evil.example", true, true)).toBe("/dashboard");
    expect(go("/sign-in", "?next=https://evil.example", true, true)).toBe("/dashboard");
    expect(go("/sign-in", `?next=${encodeURIComponent("/sign-up?next=/x")}`, true, true)).toBe("/dashboard");
    expect(go("/admin", "?next=/admin", true, true)).toBe("/dashboard");
  });
});
