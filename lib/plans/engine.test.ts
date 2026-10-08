import { describe, expect, it } from "vitest";
import { withStarts, type Material } from "@/lib/programs/material";
import {
  baseReach,
  cumulativeOrdinals,
  dayTasks,
  fromPayload,
  ordinalOf,
  ordinalSpan,
  planIssues,
  repetitionText,
  toPayload,
  trackSize,
  unitAt,
  type PlanDraft,
  type PlanField,
  type TrackShare,
} from "./engine";

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

const hifz = field("h", "حفظ", "ranged", { isBase: true, sortOrder: 1 });
const rabt = field("r", "ربط", "explicit", { isConstrained: true, sortOrder: 2 });
const review = field("m", "مراجعة", "explicit", { isConstrained: true, sortOrder: 3 });
const fields = [hifz, rabt, review];

const material: Material = {
  forms: { sectionLabel: "باب", singular: "الحديث", one: "حديث واحد", two: "حديثان", few: "أحاديث", many: "حديثاً" },
  sections: withStarts([
    { id: "a", name: "الإيمان", unit_count: 47 },
    { id: "b", name: "الطهارة", unit_count: 44 },
  ]),
};

const track1: TrackShare = { id: "t1", name: "الأول", ranges: [{ from: 1, to: 47, sortOrder: 0 }] };
const track2: TrackShare = { id: "t2", name: "الثاني", ranges: [{ from: 1, to: 91, sortOrder: 0 }] };

/** أول خمسة أيام من خطة المسار الأول ١٤٤٨ — حفظ وربط حفظِ أمس ومراجعة ما قبله. */
const firstDays: PlanDraft = {
  dayCount: 5,
  values: [
    { day: 1, fieldId: "h", amount: 1, repetition: 15 },
    { day: 2, fieldId: "h", amount: 1, repetition: 15 },
    { day: 2, fieldId: "r", from: 1, to: 1, repetition: 5 },
    { day: 3, fieldId: "h", amount: 1, repetition: 15 },
    { day: 3, fieldId: "r", from: 2, to: 2, repetition: 5 },
    { day: 3, fieldId: "m", from: 1, to: 2 },
    { day: 4, fieldId: "h", amount: 1, repetition: 15 },
    { day: 4, fieldId: "r", from: 3, to: 3, repetition: 5 },
    { day: 4, fieldId: "m", from: 1, to: 3 },
    { day: 5, fieldId: "h", amount: 1, repetition: 15 },
    { day: 5, fieldId: "r", from: 4, to: 4, repetition: 5 },
    { day: 5, fieldId: "m", from: 1, to: 4 },
  ],
};

describe("نصيب المسار ورتبته", () => {
  const split: TrackShare = {
    id: "s",
    name: "متفرّق",
    ranges: [
      { from: 61, to: 70, sortOrder: 0 },
      { from: 1, to: 10, sortOrder: 1 },
    ],
  };

  it("الرتبة تتبع ترتيب المقاطع لا ترتيب الأرقام", () => {
    expect(trackSize(split)).toBe(20);
    expect(ordinalOf(split, 61)).toBe(1);
    expect(ordinalOf(split, 1)).toBe(11);
    expect(ordinalOf(split, 30)).toBeNull();
    expect(unitAt(split, 11)).toBe(1);
    expect(unitAt(split, 21)).toBeNull();
  });

  it("النطاق العابر لفجوة يُقطع مقطعين", () => {
    expect(ordinalSpan(split, 9, 12)).toEqual([
      { from: 69, to: 70 },
      { from: 1, to: 2 },
    ]);
  });
});

describe("التراكمي", () => {
  it("يبدأ حيث انتهى ما قبله في الخطة", () => {
    const draft: PlanDraft = {
      dayCount: 3,
      values: [
        { day: 1, fieldId: "h", amount: 2 },
        { day: 3, fieldId: "h", amount: 5 },
      ],
    };
    const r = cumulativeOrdinals(draft, "h");
    expect(r.get(1)).toEqual({ from: 1, to: 2 });
    expect(r.get(2)).toBeUndefined();
    expect(r.get(3)).toEqual({ from: 3, to: 7 });
    expect(baseReach(draft, "h", 2)).toBe(2);
  });
});

describe("ملاحظات الخطة", () => {
  it("خطة صحيحة لا تغطّي النصيب كله: تنبيه لا خطأ", () => {
    const issues = planIssues(firstDays, fields, [track1]);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues[0]?.message).toBe("الخطة لا تغطّي نصيب المسار كله: مجموع مقادير «حفظ» 5 من 47");
  });

  it("**المقيَّد لا يتجاوز ما بلغه الحفظ في يومه**", () => {
    const bad: PlanDraft = { ...firstDays, values: [...firstDays.values.filter((v) => !(v.day === 2 && v.fieldId === "r")), { day: 2, fieldId: "r", from: 1, to: 3 }] };
    expect(planIssues(bad, fields, [track1]).map((i) => i.message)).toContain(
      "اليوم 2: «ربط» يتجاوز ما بلغه الحفظ في هذا اليوم",
    );
  });

  it("الصريح خارج النصيب، والصيغة المخالفة، واليوم الفارغ", () => {
    const bad: PlanDraft = {
      dayCount: 6,
      values: [...firstDays.values, { day: 5, fieldId: "m", from: 60, to: 60 }, { day: 1, fieldId: "r", amount: 1 }],
    };
    const messages = planIssues(bad, fields, [track1]).map((i) => i.message);
    expect(messages).toContain("اليوم 5: «مراجعة» مكرّر");
    expect(messages).toContain("اليوم 5: «مراجعة» خارج نصيب المسار");
    expect(messages).toContain("اليوم 1: «ربط» يحتاج «من» و«إلى» موجبين، والبداية لا تزيد على النهاية");
    expect(messages).toContain("اليوم 6 بلا نشاط إلزامي");
  });

  it("مع أكثر من مسار تُسبق الملاحظة باسمه", () => {
    const big: PlanDraft = { dayCount: 1, values: [{ day: 1, fieldId: "h", amount: 48 }] };
    const messages = planIssues(big, fields, [track1, track2]).map((i) => i.message);
    expect(messages).toContain("الأول: مجموع مقادير «حفظ» (48) يتجاوز نصيب المسار (47)");
    expect(messages).toContain("الثاني: الخطة لا تغطّي نصيب المسار كله: مجموع مقادير «حفظ» 48 من 91");
  });
});

describe("الصيغة المعيارية", () => {
  it("ذهاباً وإياباً بلا فقد", () => {
    expect(fromPayload(toPayload(firstDays))).toEqual(firstDays);
  });
});

describe("ما يراه المشارك", () => {
  it("اليوم الثالث من المسار الأول", () => {
    const tasks = dayTasks(firstDays, fields, track1, material, 3);
    expect(tasks.map((t) => [t.field.label, t.lines.join(" + "), t.repetition])).toEqual([
      ["حفظ", "الحديث 3 من باب الإيمان", 15],
      ["ربط", "الحديث 2 من باب الإيمان", 5],
      ["مراجعة", "من الحديث 1 إلى 2 من باب الإيمان (حديثان)", null],
    ]);
  });

  it("التكرار بصيغته", () => {
    expect([1, 2, 3, 10, 11, 15].map(repetitionText)).toEqual([
      "مرة واحدة",
      "مرتين",
      "3 مرات",
      "10 مرات",
      "11 مرة",
      "15 مرة",
    ]);
  });
});
