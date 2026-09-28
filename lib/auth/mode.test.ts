import { describe, expect, it } from "vitest";
import { gateFor, isStaffPath, resolveMode } from "./mode";

describe("وضع الجلسة", () => {
  it("**ما اختاره الباب يفوز**", () => {
    expect(resolveMode("staff", false)).toBe("staff");
    expect(resolveMode("participant", true)).toBe("participant");
  });

  it("وبلا كوكي: صاحب الدور إلى الإدارة وغيره إلى المشاركة", () => {
    expect(resolveMode(undefined, true)).toBe("staff");
    expect(resolveMode(undefined, false)).toBe("participant");
  });

  it("وقيمةٌ غريبة كأنها لا شيء — لا يقف أحدٌ بلا تجربة", () => {
    expect(resolveMode("admin", true)).toBe("staff");
    expect(resolveMode("", false)).toBe("participant");
  });
});

describe("باب الوجهة", () => {
  it("**الوجهة الإدارية تُردّ إلى بوابة الإدارة**", () => {
    for (const path of ["/programs", "/team/roles", "/participants", "/settings", "/audit"]) {
      expect(gateFor(path), path).toBe("/admin");
    }
  });

  it("وما سواها إلى بوابة المشاركين", () => {
    for (const path of ["/dashboard", "/journey/abc", "/account"]) {
      expect(gateFor(path), path).toBe("/sign-in");
    }
  });

  it("والتشابه في أول الاسم لا يكفي", () => {
    expect(isStaffPath("/participants")).toBe(true);
    expect(isStaffPath("/participants-guide")).toBe(false);
    expect(isStaffPath("/journey")).toBe(false);
  });
});
