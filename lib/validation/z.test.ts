import { describe, expect, it } from "vitest";
import { z } from "./z";

const messageOf = (schema: z.ZodType, value: unknown) =>
  schema.safeParse(value).error?.issues[0]?.message;

/** لا حرف لاتيني في رسالة تُعرض للمستخدم. */
const LATIN = /[A-Za-z]/;

describe("رسائل التحقق بلغة المُعِدّ", () => {
  it("**لا رسالة إنجليزية ولا تقنية** للقواعد الشائعة بلا رسالة مكتوبة", () => {
    const cases: [z.ZodType, unknown][] = [
      [z.coerce.number().int().max(366), 400],
      [z.coerce.number().min(1), 0],
      [z.number(), "نص"],
      [z.string().min(1), ""],
      [z.string().min(3), "أب"],
      [z.string().max(5), "طويل جداً جداً"],
      [z.enum(["a", "b"]), "c"],
      [z.email(), "ليس-بريداً"],
      [z.uuid(), "123"],
      [z.string(), undefined],
    ];
    for (const [schema, value] of cases) {
      const message = messageOf(schema, value);
      expect(message, String(value)).toBeTruthy();
      expect(message, String(value)).not.toMatch(LATIN);
    }
  });

  it("الرسالة تقول ما يُفعَل", () => {
    expect(messageOf(z.coerce.number().max(366), 400)).toContain("أكبر قيمة مسموحة");
    expect(messageOf(z.string(), undefined)).toBe("هذا الحقل مطلوب");
    expect(messageOf(z.enum(["a"]), "x")).toBe("اختر من القائمة");
  });

  it("**الرسالة المكتوبة على القاعدة تتقدّم** — الإعداد العامّ احتياطٌ لا بديل", () => {
    expect(messageOf(z.string().min(5, "نصّ السؤال مطلوب"), "")).toBe("نصّ السؤال مطلوب");
  });
});
