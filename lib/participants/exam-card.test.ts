import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";
import { attemptsLeft, isHotExam, lastExamMoment, type ExamCardInput } from "./exam-card";

const exam = (over: Partial<ExamCardInput> = {}): ExamCardInput => ({
  closesAt: "2026-11-29T21:00:00.000Z",
  attempts: 0,
  maxAttempts: 3,
  passed: false,
  open: false,
  blocker: null,
  ...over,
});

describe("بطاقة الاختبار", () => {
  it("**يُبرَز** ما يدخله الآن أو بدأه — لا ما لم يبلغ نسبته ولا ما اجتازه أو نفدت محاولاته", () => {
    expect(isHotExam(exam())).toBe(true);
    expect(isHotExam(exam({ open: true, attempts: 1 }))).toBe(true);
    expect(isHotExam(exam({ blocker: "يُدخل بإنجاز 75٪" }))).toBe(false);
    expect(isHotExam(exam({ passed: true, attempts: 1, blocker: "اجتزت هذا الاختبار" }))).toBe(false);
    expect(isHotExam(exam({ blocker: "استنفدت محاولاتك", attempts: 3 }))).toBe(false);
    // محاولةٌ مفتوحة ومشاركةٌ موقوفة: البوابة تمنع، فلا بطاقة بارزة بزرٍّ لا يعمل.
    expect(isHotExam(exam({ open: true, attempts: 1, blocker: "مشاركتك لا تتيح الاختبار الآن" }))).toBe(false);
  });

  it("المحاولات الباقية", () => {
    expect(attemptsLeft(exam({ attempts: 1 }))).toBe(2);
    expect(attemptsLeft(exam({ attempts: 5 }))).toBe(0);
    expect(attemptsLeft(exam({ maxAttempts: null }))).toBeNull();
  });

  it("**آخر موعد** يومُ ما قبل الإغلاق — نهاية ٢٩ نوفمبر لا ٣٠", () => {
    // الإغلاق 2026-11-30 00:00 بتوقيت الرياض = 21:00Z من ٢٩.
    expect(lastExamMoment("2026-11-29T21:00:00.000Z")).toBe("2026-11-29T20:59:59.000Z");
    expect(formatDate(lastExamMoment("2026-11-29T21:00:00.000Z")!)).toBe(formatDate("2026-11-29T12:00:00+03:00"));
    // كما تخزّنه الإدارة: نهاية اليوم.
    expect(formatDate(lastExamMoment("2026-11-29T23:59:59.999+03:00")!)).toBe(formatDate("2026-11-29T12:00:00+03:00"));
    expect(lastExamMoment(null)).toBeNull();
    expect(lastExamMoment("ليس تاريخاً")).toBeNull();
  });
});
