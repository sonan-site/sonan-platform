import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("وجهة ما بعد الدخول", () => {
  it("الافتراضي لوحة المتابعة لا واجهة الزائر", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("المسار الداخلي يُحترَم — من حُوِّل من صفحة محمية يعود إليها", () => {
    expect(safeNext("/programs/abc/plans")).toBe("/programs/abc/plans");
    expect(safeNext("/journey?day=3")).toBe("/journey?day=3");
  });

  it("**العنوان البروتوكولي النسبي يُردّ** — تحويل مفتوح يُستعمَل في التصيّد", () => {
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example/steal")).toBe("/dashboard");
  });

  it("الشرطة المعكوسة تُردّ كذلك — بعض المتصفّحات تعاملها معاملة الشرطة", () => {
    expect(safeNext("/" + String.fromCharCode(92) + "evil.example")).toBe("/dashboard");
  });

  it("العنوان المطلق يُردّ", () => {
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });
});
