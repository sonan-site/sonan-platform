import { describe, expect, it } from "vitest";
import { binNotice, daysLeft, deletedLabel, isDue } from "./bin";

const AT = new Date("2026-10-01T12:00:00Z");
const after = (days: number) => new Date(AT.getTime() + days * 86_400_000).toISOString();

describe("مدّة السلّة", () => {
  it("**ما بقي يُحسب صاعداً** — من بقيت له ساعةٌ فله يوم لا صفر", () => {
    expect(daysLeft(new Date(AT.getTime() + 3_600_000).toISOString(), AT)).toBe(1);
  });

  it("والمنقضية سالبة أو صفر", () => {
    expect(daysLeft(after(-2), AT)).toBe(-2);
    expect(isDue(after(-2), AT)).toBe(true);
    expect(isDue(after(5), AT)).toBe(false);
  });

  it("**والعربية تعدّ على أربعة وجوه**", () => {
    expect(binNotice(after(1), AT)).toBe("يُمحى بعد يوم واحد");
    expect(binNotice(after(2), AT)).toBe("يُمحى بعد يومين");
    expect(binNotice(after(4), AT)).toBe("يُمحى بعد ٤ أيام");
    expect(binNotice(after(30), AT)).toBe("يُمحى بعد ٣٠ يوماً");
  });

  it("والمنقضي يُقال صراحةً لا برقمٍ سالب", () => {
    expect(binNotice(after(-1), AT)).toBe("انقضت مدّته — يُمحى الآن");
  });
});

describe("صفة المحذوف", () => {
  it("**الصفة تبقى والاسم يذهب** — نظيرها في القاعدة", () => {
    expect(deletedLabel(true)).toBe("إداريّ محذوف");
    expect(deletedLabel(false)).toBe("مشارك محذوف");
  });
});
