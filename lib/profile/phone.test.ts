import { describe, expect, it } from "vitest";
import { COUNTRIES, formatPhone, normalizePhone, splitPhone } from "./phone";

describe("تطبيع الجوال", () => {
  it("**ما يكتبه الناس فعلاً يُحفظ بصيغة واحدة**", () => {
    for (const written of [
      "0501234567",
      "501234567",
      "966501234567",
      "00966501234567",
      "+966 50 123 4567",
      "050-123-4567",
      "٠٥٠١٢٣٤٥٦٧",
    ]) {
      expect(normalizePhone(written, "SA"), written).toBe("+966501234567");
    }
  });

  it("رقم دولة أخرى بمفتاحها", () => {
    expect(normalizePhone("0501234567", "AE")).toBe("+971501234567");
    expect(normalizePhone("+971501234567", "SA")).toBe("+971501234567");
  });

  it("**الرقم الناقص أو العبث يُرفض**", () => {
    expect(normalizePhone("05012", "SA")).toBeNull();
    expect(normalizePhone("abc", "SA")).toBeNull();
    expect(normalizePhone("", "SA")).toBeNull();
  });

  it("العرض والتفكيك يعكسان التطبيع", () => {
    expect(formatPhone("+966501234567")).toBe("+966 50 123 4567");
    expect(splitPhone("+966501234567")).toEqual({ country: "SA", national: "501234567" });
    expect(splitPhone(null)).toEqual({ country: "SA", national: "" });
  });
});

describe("قائمة الدول", () => {
  it("**السعودية أولاً ثم الخليج**", () => {
    expect(COUNTRIES.slice(0, 6).map((c) => c.code)).toEqual(["SA", "AE", "KW", "QA", "BH", "OM"]);
    expect(COUNTRIES[0]).toMatchObject({ dial: "+966" });
  });

  it("كل الدول، بأسماء عربية", () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    expect(COUNTRIES.find((c) => c.code === "EG")?.name).toMatch(/مصر/);
  });
});
