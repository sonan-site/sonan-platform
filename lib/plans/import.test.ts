import { describe, expect, it } from "vitest";
import { withStarts, type Material } from "@/lib/programs/material";
import { planIssues, type PlanField, type TrackShare } from "./engine";
import {
  buildPrompt,
  findSection,
  mappingWarnings,
  normalizeName,
  parseCsv,
  parseExternalPlan,
  rowsToExternal,
  suggestMapping,
} from "./import";

const field = (id: string, label: string, kind: PlanField["kind"], props: Partial<PlanField> = {}): PlanField => ({
  id,
  label,
  kind,
  isBase: false,
  isConstrained: false,
  isMaterialLinked: kind !== "counted",
  isRequired: true,
  countUnit: kind === "counted" ? "مرة" : null,
  defaultRepetition: null,
  sortOrder: 0,
  ...props,
});

const hifz = field("h", "حفظ", "ranged", { isBase: true, sortOrder: 1, defaultRepetition: 15 });
const rabt = field("r", "ربط", "explicit", { isConstrained: true, sortOrder: 2 });
const review = field("m", "مراجعة", "explicit", { isConstrained: true, sortOrder: 3 });
const fields = [hifz, rabt, review];

/** مادة ١٤٤٨ بأسماء الملفات: «الأربعون في …». */
const material: Material = {
  forms: { sectionLabel: "باب", singular: "الحديث", one: "حديث واحد", two: "حديثان", few: "أحاديث", many: "حديثاً" },
  sections: withStarts([
    { id: "a", name: "الإيمان", unit_count: 47 },
    { id: "b", name: "الطهارة", unit_count: 44 },
    { id: "c", name: "الصلاة", unit_count: 48 },
    { id: "d", name: "الآداب", unit_count: 42 },
    { id: "e", name: "الأذكار", unit_count: 48 },
  ]),
};
const track5: TrackShare = { id: "t5", name: "الخامس", ranges: [{ from: 1, to: 229, sortOrder: 0 }] };

describe("الأسماء", () => {
  it("«الحفظ» = «حفظ»، والهمزات والتاء المربوطة", () => {
    expect(normalizeName("الحفظ")).toBe(normalizeName("حفظ"));
    expect(normalizeName("إلى")).toBe("الي");
    expect(normalizeName("المراجعة")).toBe("مراجعه");
  });

  it("اسم الباب في الملف يحوي اسمه في المادة", () => {
    expect(findSection(material, "الأربعون في الطهارة")?.start).toBe(48);
    expect(findSection(material, "الأربعون في الأذكار")?.start).toBe(182);
    expect(findSection(material, "الزكاة")).toBeNull();
  });
});

describe("الصيغة المعيارية", () => {
  it("**أيام عبور الباب من المسار الخامس** — الحفظ والربط والمراجعة بأقسامها", () => {
    const result = parseExternalPlan(
      {
        version: 1,
        day_count: 11,
        days: [
          { day: 1, values: { حفظ: { section: "الإيمان", from: 1, to: 2, repetition: 15 } } },
          { day: 2, values: { حفظ: { section: "الإيمان", from: 3, to: 7, repetition: 15 }, ربط: { section: "الإيمان", from: 1, to: 2, repetition: 5 } } },
          ...Array.from({ length: 7 }, (_, i) => ({
            day: i + 3,
            values: { حفظ: { amount: [4, 7, 6, 6, 6, 7, 4][i]! } },
          })),
          {
            day: 10,
            values: {
              حفظ: { section: "الأربعون في الطهارة", from: 1, to: 5, repetition: 15 },
              ربط: { section: "الأربعون في الإيمان", from: 44, to: 47, repetition: 5 },
              مراجعة: { from: 1, to: 47 },
            },
          },
          {
            day: 11,
            values: {
              حفظ: { section: "الطهارة", from: 6, to: 9 },
              ربط: { section: "الطهارة", from: 1, to: 5 },
              المراجعة: { from: { section: "الإيمان", number: 1 }, to: { section: "الطهارة", number: 5 } },
            },
          },
        ],
      },
      fields,
      material,
      track5,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const at = (day: number, id: string) => result.draft.values.find((v) => v.day === day && v.fieldId === id);
    expect(at(10, "h")).toEqual({ day: 10, fieldId: "h", amount: 5, repetition: 15 });
    expect(at(10, "r")).toMatchObject({ from: 44, to: 47 });
    expect(at(11, "m")).toMatchObject({ from: 1, to: 52 });
    expect(planIssues(result.draft, fields, [track5]).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("**الحفظ يبدأ حيث انتهى ما قبله** — والفجوة تُكشف", () => {
    const result = parseExternalPlan(
      {
        days: [
          { day: 1, values: { حفظ: { from: 1, to: 2 } } },
          { day: 2, values: { حفظ: { from: 4, to: 5 } } },
        ],
      },
      fields,
      material,
      track5,
    );
    expect(result).toEqual({
      ok: false,
      errors: ["اليوم ٢: «حفظ» يبدأ من الموضع ٤ والمتوقع ٣ — الحفظ يبدأ حيث انتهى ما قبله."],
    });
  });

  it("الحقل المجهول والقسم المجهول والرقم بعد آخر الباب", () => {
    const result = parseExternalPlan(
      {
        days: [
          { day: 1, values: { سرد: { amount: 1 }, ربط: { section: "الزكاة", from: 1, to: 1 } } },
          { day: 2, values: { مراجعة: { section: "الإيمان", from: 1, to: 48 } } },
        ],
      },
      fields,
      material,
      track5,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      "اليوم ١: الحقل «سرد» ليس من حقول البرنامج.",
      "اليوم ١: «ربط»: القسم «الزكاة» غير معروف في المادة.",
      "اليوم ٢: «مراجعة»: ٤٨ بعد آخر «الإيمان» (٤٧).",
    ]);
  });
});

describe("الجدول", () => {
  /** أسطر من ملف المسار الأول كما هي، مع فاصلٍ عربي واقتباس. */
  const csv = [
    "اليوم،المادة،الحفظ من،الحفظ إلى،تكرار الحفظ،الربط من،الربط إلى،تكرار الربط،المراجعة من،المراجعة إلى،الملاحظات",
    "1،الأربعون في الإيمان،1،1،15،،،،،،",
    "2،الأربعون في الإيمان،2،2،15،1،1،5،،،",
    '3،الأربعون في الإيمان،3،3،15،2،2،5،1،2،"مراجعة، أولى"',
  ].join("\n");

  it("يُقرأ بفاصله واقتباسه", () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[3]![10]).toBe("مراجعة، أولى");
  });

  it("**العناوين تقترح تعيينها**: الحفظ من/إلى، والتكرار، والمادة قسماً للأساس", () => {
    const mapping = suggestMapping(parseCsv(csv)[0]!, fields);
    expect(mapping.columns.map((c) => `${c.role}:${c.fieldId ?? "-"}`)).toEqual([
      "day:-",
      "section:h",
      "from:h",
      "to:h",
      "repetition:h",
      "from:r",
      "to:r",
      "repetition:r",
      "from:m",
      "to:m",
      "ignore:-",
    ]);
  });

  it("**حقلٌ بلا عمود قسم في مادةٍ مقسّمة يُنبَّه عليه** — أرقامه تُقرأ متّصلة", () => {
    const rows = parseCsv(csv);
    const warnings = mappingWarnings(suggestMapping(rows[0]!, fields), fields, material);
    expect(warnings).toEqual([
      "«ربط» بلا عمود قسم: تُقرأ أرقامه متّصلةً عبر المادة كلها. إن كان الملف يرقّم كل باب من ١ فعيّن عمود قسمه، أو استورد بالذكاء الاصطناعي.",
      "«مراجعة» بلا عمود قسم: تُقرأ أرقامه متّصلةً عبر المادة كلها. إن كان الملف يرقّم كل باب من ١ فعيّن عمود قسمه، أو استورد بالذكاء الاصطناعي.",
    ]);
  });

  it("الصفوف بتعيينها ← خطةٌ سليمة", () => {
    const rows = parseCsv(csv);
    const external = rowsToExternal(rows, suggestMapping(rows[0]!, fields), fields);
    const track1: TrackShare = { id: "t1", name: "الأول", ranges: [{ from: 1, to: 47, sortOrder: 0 }] };
    const result = parseExternalPlan(external, fields, material, track1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.dayCount).toBe(3);
    expect(result.draft.values).toHaveLength(6);
    expect(planIssues(result.draft, fields, [track1]).filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("البرومبت", () => {
  it("يحمل الأقسام بأرقامها المتّصلة والحقول ومثالاً", () => {
    const prompt = buildPrompt({ programName: "مسابقة سنن ١٤٤٨", material, fields, tracks: [track5] });
    expect(prompt).toContain("- الطهارة: 44 — الأرقام المتّصلة 48–91");
    expect(prompt).toContain('"حفظ": تراكمي (الحقل الأساس)');
    expect(prompt).toContain("الوحدة 5 من «الطهارة» = 48 + 5 − 1 = 52");
    expect(prompt).toContain('"day_count": 40');
  });
});

describe("ملاحظات المراجعة", () => {
  const parts: Material = {
    forms: material.forms,
    sections: withStarts([
      { id: "p1", name: "الجزء 1", unit_count: 5 },
      { id: "hj", name: "الحج", unit_count: 5 },
    ]),
  };

  it("**الكلمات كاملةً لا حروفاً** — «حجة الوداع» ليست «الحج»، و«الجزء ١١» ليس «الجزء 1»", () => {
    expect(findSection(parts, "حجة الوداع")).toBeNull();
    expect(findSection(parts, "الجزء 11")).toBeNull();
    expect(findSection(parts, "الجزء ١")?.id).toBe("p1");
    expect(findSection(parts, "‏الحج")?.id).toBe("hj");
  });

  it("الحقل الأطول تطابقاً يفوز في العنوان — «مراجعة الربط من» لا تُنسب إلى «الربط»", () => {
    const two = [field("r", "الربط", "explicit"), field("rr", "مراجعة الربط", "explicit")];
    expect(suggestMapping(["مراجعة الربط من"], two).columns[0]).toMatchObject({ role: "from", fieldId: "rr" });
  });

  it("**خلية القسم المدموجة تمتدّ لما تحتها**، والفارغ بلا سابقٍ خطأٌ لا رقمٌ متّصل", () => {
    const rows = [
      ["اليوم", "المادة", "الحفظ من", "الحفظ إلى"],
      ["1", "", "1", "2"],
      ["2", "الطهارة", "1", "2"],
      ["3", "", "3", "4"],
    ];
    const external = rowsToExternal(rows, suggestMapping(rows[0]!, fields), fields);
    const result = parseExternalPlan(external, fields, material, null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toBe("اليوم ١: «حفظ»: عمود القسم فارغ — اكتب قسم الرقم.");
    const fromTahara = external.days[2]!.values["حفظ"]!.from;
    expect(fromTahara).toEqual({ section: "الطهارة", number: "3" });
  });

  it("اليوم فوق حدّ الخطة يُرفض — عمود تواريخ Excel لا يُقرأ أياماً", () => {
    const result = parseExternalPlan({ days: [{ day: 45000, values: { حفظ: { amount: 1 } } }] }, fields, material, null);
    expect(result.ok).toBe(false);
  });

  it("CSV: اقتباسٌ في وسط الخلية حرفٌ منها، وسطر عنوانٍ لا يُضلّل كشف الفاصل", () => {
    const rows = parseCsv("خطة المسار\nاليوم;المادة\n1;قال \"اقرأ\" فقرأ\n2;ب");
    expect(rows[1]).toEqual(["اليوم", "المادة"]);
    expect(rows[2]).toEqual(["1", 'قال "اقرأ" فقرأ']);
    expect(rows).toHaveLength(4);
  });
});
