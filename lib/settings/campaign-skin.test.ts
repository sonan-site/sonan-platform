import { describe, expect, it } from "vitest";
import { skinForNext, skinForPath } from "./campaign-skin";

const F = "sunan-competition-1448";

describe("جلد الحملة", () => {
  it("صفحة تسجيل برنامج الحملة — بمسارٍ محمول أو بدونه", () => {
    expect(skinForPath(`/p/${F}/register`, F)).toBe("campaign");
    expect(skinForPath(`/p/${F}/register?track=abc`, F)).toBe("campaign");
    expect(skinForPath(`/p/${F}/register/`, F)).toBe("campaign");
  });

  it("غيرها بهوية المنصة: برنامجٌ آخر · اسمٌ يبدأ باسمها · صفحة البرنامج · الجذر", () => {
    expect(skinForPath("/p/other/register", F)).toBeNull();
    expect(skinForPath(`/p/${F}-other/register`, F)).toBeNull();
    expect(skinForPath(`/p/${F}`, F)).toBeNull();
    expect(skinForPath(`/p/${F}/registerx`, F)).toBeNull();
    expect(skinForPath("/", F)).toBeNull();
  });

  it("**المفتاح المطفأ يعيد كل شيء**", () => {
    expect(skinForPath(`/p/${F}/register`, null)).toBeNull();
    expect(skinForNext(`/p/${F}/register`, null)).toBeNull();
  });

  it("الوجهة: محلّيةٌ إلى تسجيل الحملة وحدها", () => {
    expect(skinForNext(`/p/${F}/register?track=abc`, F)).toBe("campaign");
    expect(skinForNext(null, F)).toBeNull();
    expect(skinForNext("", F)).toBeNull();
    expect(skinForNext("/dashboard", F)).toBeNull();
    expect(skinForNext(`//evil.example/p/${F}/register`, F)).toBeNull();
    expect(skinForNext(`/\\evil.example/p/${F}/register`, F)).toBeNull();
    expect(skinForNext(`https://evil.example/p/${F}/register`, F)).toBeNull();
  });
});
