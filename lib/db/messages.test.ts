import { describe, expect, it } from "vitest";
import { userMessage } from "./messages";

describe("رسالة خطأ القاعدة للمستخدم", () => {
  it("رسالة حارسٍ عربية تُعرض كما هي", () => {
    expect(userMessage({ code: "23514", message: "هذا الواجب مستعمَل في شكل يوم" }, "تعذّر")).toBe(
      "هذا الواجب مستعمَل في شكل يوم.",
    );
  });

  it("**رسالة Postgres الإنجليزية لا تصل المستخدم**", () => {
    expect(
      userMessage({ code: "23514", message: 'new row violates check constraint "chk_x"' }, "تعذّر الحفظ."),
    ).toBe("تعذّر الحفظ.");
  });

  it("التكرار برسالته الخاصة إن وُجدت", () => {
    expect(userMessage({ code: "23505", message: "duplicate key" }, "تعذّر.", "الاسم مستخدَم.")).toBe(
      "الاسم مستخدَم.",
    );
    expect(userMessage({ code: "23505", message: "duplicate key" }, "تعذّر.")).toBe("تعذّر.");
  });
});
