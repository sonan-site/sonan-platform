import { describe, expect, it } from "vitest";
import { cleanNamePart, isArabicName, nameSchema, profileSchema } from "./profile";

const valid = {
  firstName: "إبراهيم",
  fatherName: "محمد",
  grandfatherName: "عبدالله",
  familyName: "الحسين",
  gender: "male",
  birthDate: "1995-05-20",
  nationality: "SA",
  phoneCountry: "SA",
  phone: "0501234567",
  phoneSecondaryCountry: "SA",
  phoneSecondary: "",
};

const errorsOf = (input: Record<string, string>) =>
  Object.fromEntries((profileSchema.safeParse(input).error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

describe("بيانات الحساب", () => {
  it("**الصحيحة تُطبَّع إلى صفّ القاعدة** — والجوال بالصيغة الدولية", () => {
    const parsed = profileSchema.parse(valid);
    expect(parsed).toMatchObject({
      first_name: "إبراهيم",
      grandfather_name: "عبدالله",
      phone: "+966501234567",
      phone_secondary: null,
    });
  });

  it("**الاسم الرباعي إلزاميٌّ كلّه** (ملاحظات الجوال أ٤)", () => {
    expect(errorsOf({ ...valid, grandfatherName: "" })).toHaveProperty("grandfatherName");
    expect(errorsOf({ ...valid, grandfatherName: "   " })).toHaveProperty("grandfatherName");
    expect(errorsOf({ ...valid, fatherName: "" })).toHaveProperty("fatherName");
    expect(errorsOf({ ...valid, familyName: "1234" })).toHaveProperty("familyName");
  });

  it("**الاسم بالحروف العربية** (adr/0062) — بتشكيله وشَرطته وحروف الأردية", () => {
    for (const bad of ["Ali", "عليA", "علي1", "1علي", "-علي", "علي.", "ـعلي"]) {
      expect(errorsOf({ ...valid, firstName: bad }).firstName, bad).toMatch(/بالحروف العربية/);
    }
    for (const ok of ["عبد الله", "عبدالرحمن", "مُحَمَّد", "آل-سعود", "ابن ٱلقيم", "پرویز", "عائشہ", "ئيلاف", "يحيى", "الشيخة"]) {
      expect(errorsOf({ ...valid, firstName: ok }), ok).toEqual({});
    }
  });

  it("**ما لا يُرى يُنظَّف قبل الفحص** — علامات الاتجاه والوصل وأشكال العرض والمسافات المتتابعة", () => {
    const c = String.fromCharCode;
    expect(cleanNamePart(`${c(0x200f)}سالم${c(0x200c)}`)).toBe("سالم");
    expect(cleanNamePart("عبد   الله ")).toBe("عبد الله");
    // «ﻋﻠﻲ» بأشكال العرض (U+FECB U+FEE0 U+FEF2) ← «علي».
    expect(cleanNamePart(`${c(0xfecb)}${c(0xfee0)}${c(0xfef2)}`)).toBe("علي");
    expect(errorsOf({ ...valid, firstName: `${c(0x200f)}سالم` })).toEqual({});
    expect(errorsOf({ ...valid, firstName: "سالم-" }).firstName).toMatch(/بالحروف العربية/);
  });

  it("**أجزاء الاسم وحدها** لنافذة التحديث، و`isArabicName` يحكم على المحفوظ", () => {
    expect(nameSchema.parse({ firstName: " سالم ", fatherName: "محمد", grandfatherName: "علي", familyName: "التجربة" })).toEqual({
      first_name: "سالم",
      father_name: "محمد",
      grandfather_name: "علي",
      family_name: "التجربة",
    });
    expect(nameSchema.safeParse({ firstName: "Salem", fatherName: "محمد", grandfatherName: "علي", familyName: "التجربة" }).success).toBe(false);
    const parts = { first_name: "سالم", father_name: "محمد", grandfather_name: null, family_name: "التجربة" };
    expect(isArabicName(parts)).toBe(true);
    expect(isArabicName({ ...parts, family_name: "Altajriba" })).toBe(false);
  });

  it("الجنس والميلاد والجنسية إلزامية", () => {
    expect(errorsOf({ ...valid, gender: "" })).toHaveProperty("gender");
    expect(errorsOf({ ...valid, birthDate: "" })).toHaveProperty("birthDate");
    expect(errorsOf({ ...valid, nationality: "XX" })).toHaveProperty("nationality");
  });

  it("**عمرٌ غير منطقي يُرفض**", () => {
    expect(errorsOf({ ...valid, birthDate: "2099-01-01" })).toHaveProperty("birthDate");
    expect(errorsOf({ ...valid, birthDate: "1800-01-01" })).toHaveProperty("birthDate");
  });

  it("**الجوال غير الصالح لدولته يُرفض برسالة عربية**", () => {
    expect(errorsOf({ ...valid, phone: "05012" }).phone).toMatch(/غير صحيح/);
  });

  it("**الرقم الإضافي: اختياري، ولا يساوي الأساسي** ولو كُتب بصيغة أخرى", () => {
    expect(profileSchema.parse({ ...valid, phoneSecondary: "0551234567" }).phone_secondary).toBe("+966551234567");
    expect(errorsOf({ ...valid, phoneSecondary: "+966 50 123 4567" }).phoneSecondary).toMatch(/نفسه/);
  });
});
