import { describe, expect, it } from "vitest";
import { currentHour, TouchGate } from "./activity";

describe("حاجز ساعة النشاط", () => {
  it("الساعة رقمٌ يتغيّر عند رأس الساعة لا قبله", () => {
    expect(currentHour(new Date("2026-11-15T10:59:59Z"))).toBe(currentHour(new Date("2026-11-15T10:00:00Z")));
    expect(currentHour(new Date("2026-11-15T11:00:00Z"))).toBe(currentHour(new Date("2026-11-15T10:00:00Z")) + 1);
  });

  it("**نداءٌ واحد للجلسة في الساعة — وطلبات الصفحة المتزامنة لا تتسابق إليه**", () => {
    const gate = new TouchGate();
    expect(gate.take("s1", 100)).toBe(true);
    expect(gate.take("s1", 100)).toBe(false);
    // جلسةٌ أخرى — ولو للحساب نفسه — تنادي: علامة الدخول لكل جلسة.
    expect(gate.take("s2", 100)).toBe(true);
  });

  it("**الفشل يفكّ الحجز فيُعاد مع الطلب التالي** (مراجعة م١)", () => {
    const gate = new TouchGate();
    gate.take("s1", 100);
    gate.release("s1", 100);
    expect(gate.take("s1", 100)).toBe(true);
  });

  it("الساعة الجديدة تُفرغ الحاجز — ولا يفكّ فشلٌ متأخّر من ساعةٍ مضت حجزَ الجديدة", () => {
    const gate = new TouchGate();
    gate.take("s1", 100);
    expect(gate.take("s1", 101)).toBe(true);
    gate.release("s1", 100);
    expect(gate.take("s1", 101)).toBe(false);
  });
});
