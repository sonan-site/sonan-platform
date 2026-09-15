import { describe, expect, it } from "vitest";
import { parseShowcase, showcaseInput, showcaseSchema } from "./showcase";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("شرائح واجهة الدخول", () => {
  it("تُسقَط الشريحة الفارغة كلها وتبقى المعبّأة بترتيبها", () => {
    const input = showcaseInput(
      form({ "title-0": "واجبك اليومي", "body-0": "", "title-2": " تقدّمك ", "body-2": "نصّ" }),
    );
    expect(input.slides).toEqual([
      { title: "واجبك اليومي", body: "" },
      { title: "تقدّمك", body: "نصّ" },
    ]);
  });

  it("النصّ بلا عنوان يُرفض", () => {
    const parsed = showcaseSchema.safeParse(showcaseInput(form({ "body-1": "نصّ بلا عنوان" })));
    expect(parsed.success).toBe(false);
  });

  it("القيمة التالفة تعني لا شرائح — لا تُسقط الشاشة", () => {
    expect(parseShowcase(null)).toEqual({ slides: [] });
    expect(parseShowcase({ slides: "x" })).toEqual({ slides: [] });
    expect(parseShowcase({ slides: [{ title: "أهلاً", body: "" }] }).slides).toHaveLength(1);
  });

  it("أكثر من خمس شرائح يُرفض", () => {
    const slides = Array.from({ length: 6 }, () => ({ title: "عنوان", body: "" }));
    expect(showcaseSchema.safeParse({ slides }).success).toBe(false);
  });
});
