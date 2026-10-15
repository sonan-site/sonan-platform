import { describe, expect, it } from "vitest";
import { isSafeHref, parseBlockContent, pickGuide } from "./blocks";

describe("رابط عنصر الدعوة ودليل المشارك (ملاحظات الجوال أ٥ · ح٣)", () => {
  it("**يُقبل http(s) والمسار الداخلي والبريد والهاتف** — لا `javascript:` ولا نطاقٌ متخفٍّ", () => {
    expect(isSafeHref("")).toBe(true);
    expect(isSafeHref("https://example.org/guide.pdf")).toBe(true);
    expect(isSafeHref("/p/sunan/guide")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("//evil.example")).toBe(false);
    expect(isSafeHref("www.example.org")).toBe(false);
    expect(isSafeHref("/\\evil.example")).toBe(false);
    expect(isSafeHref("mailto:info@example.org")).toBe(true);
    expect(isSafeHref("tel:+966500000000")).toBe(true);
  });

  it("المخطط يرفض الرابط المخالف", () => {
    expect(parseBlockContent("cta", { text: "اقرأ الدليل", buttonHref: "javascript:x" }).ok).toBe(false);
    expect(parseBlockContent("cta", { text: "اقرأ الدليل", buttonHref: "https://a.b/g" }).ok).toBe(true);
  });

  it("**الدليل أول دعوةٍ لها رابط**", () => {
    expect(pickGuide([{ buttonHref: "" }, { buttonHref: "https://a.b/g" }, { buttonHref: "/x" }])?.buttonHref).toBe(
      "https://a.b/g",
    );
    expect(pickGuide([{ buttonHref: "" }])).toBeUndefined();
    expect(pickGuide([{ buttonHref: "mailto:a@b.c" }])).toBeUndefined();
  });
});
