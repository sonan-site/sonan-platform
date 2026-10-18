import { describe, expect, it } from "vitest";
import { identitySchema, maskNationalId, normalizeNationalId } from "./identity";

describe("هوية المشارك", () => {
  it("**الرقم يُطبَّع لاتينياً** — من لوحة عربية أو بمسافات", () => {
    expect(normalizeNationalId("١٠٢٣٤٥٦٧٨٩")).toBe("1023456789");
    expect(normalizeNationalId("2023 456 789")).toBe("2023456789");
    expect(normalizeNationalId("a12-34567")).toBe("A1234567");
  });

  it("**رقم وثيقةٍ مفتوح**: أرقام وأحرف لاتينية من ٥ إلى ٢٠ — وغيرها مرفوض", () => {
    for (const ok of ["1023456789", "2023456789", "3023456789", "4123456789", "A1234567", "12345", "A".repeat(20)]) {
      expect(identitySchema.parse({ nationalId: ok })).toMatchObject({ national_id: ok });
    }
    for (const bad of ["1234", "A".repeat(21), "10234/6789", "رقم12345"]) {
      expect(identitySchema.safeParse({ nationalId: bad }).error?.issues[0]?.path).toEqual(["nationalId"]);
    }
  });

  it("الحقلان اختياريان عند الحفظ — الإلزام عند التسجيل", () => {
    expect(identitySchema.parse({})).toEqual({ national_id: null, guardian_phone: null });
  });

  it("جوال وليّ الأمر بالصيغة الدولية", () => {
    expect(identitySchema.parse({ guardianPhone: "0501234567" }).guardian_phone).toBe("+966501234567");
    expect(identitySchema.safeParse({ guardianPhone: "123" }).success).toBe(false);
  });

  it("القناع يُبقي أوّل رقمٍ وآخر رقمين", () => {
    expect(maskNationalId("1023456789")).toBe("1••••••89");
  });
});
