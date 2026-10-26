import { describe, expect, it } from "vitest";
import { parseContact } from "./campaign-content";

describe("جهة التواصل", () => {
  it("«التسمية: القيمة» تُقسم", () => {
    expect(parseContact("شؤون الطلاب: 0553088688")).toEqual({ label: "شؤون الطلاب", value: "0553088688" });
    expect(parseContact("واتساب : 0553088688")).toEqual({ label: "واتساب", value: "0553088688" });
  });

  it("الروابط لا تُقسم عند مخطّطها", () => {
    expect(parseContact("https://wa.me/966553088688")).toEqual({ label: null, value: "https://wa.me/966553088688" });
    expect(parseContact("mailto:info@sonan.sa")).toEqual({ label: null, value: "mailto:info@sonan.sa" });
  });

  it("رقمٌ وحده بلا تسمية · والفارغ لا شيء", () => {
    expect(parseContact("0553088688")).toEqual({ label: null, value: "0553088688" });
    expect(parseContact("  ")).toBeNull();
    expect(parseContact(null)).toBeNull();
  });
});
