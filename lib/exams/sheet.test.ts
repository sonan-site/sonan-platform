import { describe, expect, it } from "vitest";
import { parseSheet, questionScore } from "./sheet";

const raw = {
  participant: { name: "محمد", registration_no: 7 },
  approved: false,
  total: "3.5",
  max: "4",
  questions: [
    {
      id: "q1",
      text: "س",
      answer: "ج",
      score: "2",
      evaluated: true,
      marked: ["c1"],
      criteria: [
        { id: "c1", label: "تردّد", value: "0.5" },
        { id: "c2", label: "إبدال", value: "3", archived: true },
      ],
    },
  ],
};

describe("ورقة المحكّم", () => {
  it("تُقرأ بأرقامها", () => {
    const s = parseSheet(raw);
    expect(s.participant).toEqual({ name: "محمد", registrationNo: 7 });
    expect(s.total).toBe(3.5);
    expect(s.questions[0]!.criteria[1]!.value).toBe(3);
  });

  it("**درجة السؤال كالقاعدة** — لا تنزل عن صفر", () => {
    const q = parseSheet(raw).questions[0]!;
    expect(questionScore(q)).toBe(1.5);
    expect(questionScore({ ...q, marked: ["c1", "c2"] })).toBe(0);
  });

  it("وغير المتوقَّع يُرفض", () => {
    expect(() => parseSheet(null)).toThrow();
    expect(() => parseSheet({ participant: {} })).toThrow();
  });
});
