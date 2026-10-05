import { describe, expect, it } from "vitest";
import {
  countPhrase,
  locateUnit,
  parseSectionLines,
  rangeText,
  samples,
  unitText,
  withStarts,
  type Material,
} from "./material";

/** مادة مسابقة ١٤٤٨ كما في ملفات المسارات: خمسة أبواب، كلٌّ يرقّم من ١. */
const sunan: Material = {
  forms: {
    sectionLabel: "باب",
    singular: "الحديث",
    one: "حديث واحد",
    two: "حديثان",
    few: "أحاديث",
    many: "حديثاً",
  },
  sections: withStarts([
    { id: "a", name: "الإيمان", unit_count: 47 },
    { id: "b", name: "الطهارة", unit_count: 44 },
    { id: "c", name: "الصلاة", unit_count: 48 },
    { id: "d", name: "الآداب", unit_count: 42 },
    { id: "e", name: "الأذكار", unit_count: 48 },
  ]),
};

const bare: Material = {
  forms: { sectionLabel: null, singular: null, one: null, two: null, few: null, many: null },
  sections: [],
};

describe("الترقيم المتّصل", () => {
  it("كل باب يبدأ بعد ما قبله", () => {
    expect(sunan.sections.map((s) => s.start)).toEqual([1, 48, 92, 140, 182]);
  });

  it("الرقم المتّصل ← الباب ورقمه فيه", () => {
    expect(locateUnit(sunan, 48)).toMatchObject({ section: { name: "الطهارة" }, index: 1 });
    expect(locateUnit(sunan, 229)).toMatchObject({ section: { name: "الأذكار" }, index: 48 });
    expect(locateUnit(sunan, 230)).toBeNull();
  });
});

describe("المعدود", () => {
  it.each([
    [1, "حديث واحد"],
    [2, "حديثان"],
    [3, "٣ أحاديث"],
    [10, "١٠ أحاديث"],
    [11, "١١ حديثاً"],
    [99, "٩٩ حديثاً"],
    [100, "١٠٠ حديث"],
    [103, "١٠٣ أحاديث"],
    [111, "١١١ حديثاً"],
    [229, "٢٢٩ حديثاً"],
  ])("%i ← %s", (n, text) => {
    expect(countPhrase(sunan, n)).toBe(text);
  });
});

describe("نصّ النطاق", () => {
  it("وحدة واحدة", () => {
    expect(unitText(sunan, 52)).toBe("الحديث ٥ من باب الطهارة");
  });

  it("في باب واحد", () => {
    expect(rangeText(sunan, 1, 3)).toBe("من الحديث ١ إلى ٣ من باب الإيمان (٣ أحاديث)");
  });

  it("عابراً بابين — مثال القرار ٠٠٣٩", () => {
    expect(rangeText(sunan, 46, 49)).toBe(
      "من الحديث ٤٦ من باب الإيمان إلى الحديث ٢ من باب الطهارة (٤ أحاديث)",
    );
  });

  it("بلا صيغ ولا أبواب ← الصيغة العامة", () => {
    expect(rangeText(bare, 3, 7)).toBe("من الوحدة ٣ إلى ٧ (٥ وحدات)");
    expect(unitText(bare, 4)).toBe("الوحدة ٤");
  });

  it("بلا اسم للقسم ← اسم الباب وحده", () => {
    const unnamed: Material = { ...sunan, forms: { ...sunan.forms, sectionLabel: null } };
    expect(unitText(unnamed, 48)).toBe("الحديث ١ من الطهارة");
  });

  it("الأمثلة تشمل العبور بين بابين", () => {
    expect(samples(sunan)).toContain(
      "من الحديث ٤٦ من باب الإيمان إلى الحديث ٢ من باب الطهارة (٤ أحاديث)",
    );
  });
});

describe("لصق الأبواب", () => {
  it("بأي فاصل وبالأرقام العربية", () => {
    const parsed = parseSectionLines("الإيمان ٤٧\nالطهارة، 44\nالصلاة\t48\n\n");
    expect(parsed).toEqual({
      ok: true,
      rows: [
        { name: "الإيمان", count: 47 },
        { name: "الطهارة", count: 44 },
        { name: "الصلاة", count: 48 },
      ],
    });
  });

  it("الرقم الأخير هو العدد — والاسم قد يحوي رقماً", () => {
    expect(parseSectionLines("الجزء 30 من القرآن 37")).toEqual({
      ok: true,
      rows: [{ name: "الجزء 30 من القرآن", count: 37 }],
    });
  });

  it("سطر بلا عدد، وعدد صفري، واسم مكرر", () => {
    const parsed = parseSectionLines("الإيمان\nالطهارة 0\nالصلاة 3\nالصلاة 4");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toHaveLength(3);
  });
});
