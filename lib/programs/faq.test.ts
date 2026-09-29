import { describe, expect, it } from "vitest";
import { groupFaq, type FaqItem } from "./faq";

const item = (id: string, category: string): FaqItem => ({
  id,
  question: `سؤال ${id}`,
  answer: "جواب",
  category,
});

describe("تجميع الأسئلة الشائعة", () => {
  it("**الترتيب ترتيب الظهور لا الأبجدية** — الإدارة رتّبت، فلا يُعاد ترتيبها", () => {
    const groups = groupFaq([
      item("1", "الجوائز"),
      item("2", "التسجيل"),
      item("3", "الجوائز"),
    ]);
    expect(groups.map(([name]) => name)).toEqual(["الجوائز", "التسجيل"]);
    expect(groups[0]![1].map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("**وما لا مجموعة له يتقدّم بلا عنوان** — ولا يُخترع له اسم", () => {
    const groups = groupFaq([item("1", "التسجيل"), item("2", ""), item("3", "التسجيل")]);
    expect(groups[0]![0]).toBe("");
    expect(groups[0]![1].map((i) => i.id)).toEqual(["2"]);
    expect(groups[1]![0]).toBe("التسجيل");
  });

  it("والفراغ حول الاسم لا يصنع مجموعةً ثانية", () => {
    const groups = groupFaq([item("1", "التسجيل"), item("2", "  التسجيل  ")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]![1]).toHaveLength(2);
  });

  it("وبلا أسئلة لا مجموعات", () => {
    expect(groupFaq([])).toEqual([]);
  });
});
