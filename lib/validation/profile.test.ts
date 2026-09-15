import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile";

const valid = {
  firstName: "إبراهيم",
  fatherName: "محمد",
  grandfatherName: "",
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
      grandfather_name: null,
      phone: "+966501234567",
      phone_secondary: null,
    });
  });

  it("الاسم الرباعي: الجد اختياري، والثلاثة الأخرى إلزامية", () => {
    expect(profileSchema.parse({ ...valid, grandfatherName: "عبدالله" }).grandfather_name).toBe("عبدالله");
    expect(errorsOf({ ...valid, fatherName: "" })).toHaveProperty("fatherName");
    expect(errorsOf({ ...valid, familyName: "1234" })).toHaveProperty("familyName");
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
