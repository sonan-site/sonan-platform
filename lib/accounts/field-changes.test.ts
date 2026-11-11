import { describe, expect, it } from "vitest";
import { auditDetail } from "@/lib/audit/labels";
import { fieldChanges, fieldChangeText, fieldLabelsFromCsv } from "./field-changes";

const before = { fields: { first_name: "فهد", phone: "+966501234567", gender: "male" } };
const after = {
  fields: { first_name: "سالم", phone: "+966509876543", gender: "female" },
  names: ["first_name", "phone", "gender"],
  by_admin: true,
  out_of_gender: true,
};

describe("سطر تعديل البيانات", () => {
  it("**بقيمه لمن يقرأ الحسابات** — بترتيب النموذج، والجنس والجوال مقروءان", () => {
    expect(fieldChanges(before, after, true)).toEqual([
      { label: "الاسم الأول", from: "فهد", to: "سالم" },
      { label: "الجنس", from: "ذكر", to: "أنثى" },
      { label: "الجوال", from: "+966 50 123 4567", to: "+966 50 987 6543" },
    ]);
  });

  it("**وبأسماء حقوله وحدها لغيره**", () => {
    expect(fieldChangeText(before, after, false)).toBe("بيد الإدارة · الاسم الأول · الجنس · الجوال · صار خارج شرط الجنس في برنامجه");
  });

  it("**رقم الوثيقة اسمٌ بلا قيمة** ولو طُلبت القيم، والفارغ «فارغ»", () => {
    const id = { fields: { guardian_phone: null } };
    const idAfter = { fields: { guardian_phone: "+966500000001" }, names: ["guardian_phone", "national_id"], by_admin: false };
    expect(fieldChanges(id, idAfter, true)).toEqual([
      { label: "رقم الوثيقة", from: null, to: null },
      { label: "جوال وليّ الأمر", from: "فارغ", to: "+966 50 000 0001" },
    ]);
  });

  it("**بعد المحو** تبقى الأسماء والعلامات بلا قيم", () => {
    expect(fieldChangeText({}, { names: ["birth_date"], by_admin: false, out_of_track: true }, true)).toBe(
      "بيد صاحبه · تاريخ الميلاد · صار خارج سنّ مساره",
    );
  });

  it("**وحقلٌ عاد إلى قيمته في السطر المدموج يسقط**", () => {
    expect(fieldChanges({ fields: { phone: "+966501234567" } }, { fields: { phone: "+966501234567" }, names: ["phone"] }, true)).toEqual([]);
  });

  it("وفي السجلّ: `auditDetail` يمرّ به", () => {
    expect(auditDetail("profile_changed", after, before, false)).toContain("بيد الإدارة");
  });
});

describe("أسماء الحقول في الإشعار", () => {
  it("من نصّ القاعدة بترتيب النموذج، وما لا يُعرف يسقط", () => {
    expect(fieldLabelsFromCsv("phone,first_name,x")).toEqual(["الاسم الأول", "الجوال"]);
    expect(fieldLabelsFromCsv(null)).toEqual([]);
  });
});
