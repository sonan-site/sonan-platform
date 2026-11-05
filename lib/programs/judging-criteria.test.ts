import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format";
import {
  DEDUCTIONS,
  QUESTIONS_BY_TRACK_ORDER,
  awardNotes,
  awardRules,
  deductionLabel,
  questionCountRows,
} from "./judging-criteria";

describe("معايير التقييم المعلنة", () => {
  it("أسئلة المسارات الخمسة تتدرّج من ١٠ إلى ٣٠", () => {
    expect([...QUESTIONS_BY_TRACK_ORDER]).toEqual([10, 15, 20, 25, 30]);
  });

  it("أعداد الأسئلة تُنسب للمسارات بترتيبها حين تكون خمسة", () => {
    const five = ["أ", "ب", "ج", "د", "هـ"].map((name, i) => ({ id: `t${i}`, name }));
    expect(questionCountRows(five)?.map((r) => r.count)).toEqual([10, 15, 20, 25, 30]);
    expect(questionCountRows(five)?.[2]).toEqual({ id: "t2", name: "ج", count: 20 });
  });

  it("وإن لم تكن خمسةً فلا أعداد — لا رقمٌ قد يخصّ مساراً غيره", () => {
    const track = (i: number) => ({ id: `t${i}`, name: `م${i}` });
    expect(questionCountRows([])).toBeNull();
    expect(questionCountRows([0, 1, 2, 3].map(track))).toBeNull();
    expect(questionCountRows([0, 1, 2, 3, 4, 5].map(track))).toBeNull();
  });

  it("سبعة معايير خصم، لكلٍّ خصمٌ معلوم", () => {
    expect(DEDUCTIONS).toHaveLength(7);
    expect(DEDUCTIONS.map((d) => deductionLabel(d.points))).toEqual([
      "درجة",
      "درجة",
      "نصف درجة",
      "نصف درجة",
      "ربع درجة",
      "ربع درجة",
      "ربع درجة",
    ]);
    expect(new Set(DEDUCTIONS.map((d) => d.name)).size).toBe(DEDUCTIONS.length);
  });

  it("شرطا الجائزة معاً: العشرة الأوائل ونسبة الأهلية من إعداد الاختبار", () => {
    const rules = awardRules(90);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain("العشرة الأوائل");
    expect(rules[1]).toContain(`${formatNumber(90)}٪`);
  });

  it("من فقد أحد الشرطين لا جائزة له، وللتساوي اختبار إضافي", () => {
    const notes = awardNotes(90);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain("فلا جائزة له");
    expect(notes[1]).toContain("فلا جائزة له");
    expect(notes[2]).toContain("اختبار شفهي إضافي");
  });

  it("النسبة تتبع الإعداد لا قيمةً ثابتة", () => {
    expect(awardRules(85)[1]).toContain(`${formatNumber(85)}٪`);
    expect(awardNotes(85)[0]).toContain(`${formatNumber(85)}٪`);
  });
});
