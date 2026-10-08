import { describe, expect, it } from "vitest";
import { identitySchema, maskNationalId, normalizeNationalId } from "./identity";

describe("هوية المشارك", () => {
  it("**الرقم يُطبَّع لاتينياً** — من لوحة عربية أو بمسافات", () => {
    expect(normalizeNationalId("١٠٢٣٤٥٦٧٨٩")).toBe("1023456789");
    expect(normalizeNationalId("2023 456 789")).toBe("2023456789");
  });

  it("**عشرة أرقام تبدأ بـ1 أو 2** — وغيرها مرفوض", () => {
    expect(identitySchema.parse({ nationalId: "1023456789" })).toMatchObject({ national_id: "1023456789" });
    expect(identitySchema.parse({ nationalId: "2023456789" })).toMatchObject({ national_id: "2023456789" });
    for (const bad of ["3023456789", "102345678", "10234567890", "10234x6789"]) {
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
