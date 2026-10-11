import { describe, expect, it } from "vitest";
import { parseAttemptState } from "./attempt";

describe("حالة المحاولة", () => {
  it("المفتوحة بسؤالها وخياراته", () => {
    expect(
      parseAttemptState({
        status: "open",
        exam: "المرحلي",
        attempt_no: 1,
        index: 2,
        total: 20,
        seconds_left: 41,
        seconds_per_question: 60,
        skips_left: 0,
        question: { id: "q", text: "سؤال", type: "multiple", options: [{ id: "o1", text: "أ" }] },
      }),
    ).toEqual({
      status: "open",
      exam: "المرحلي",
      attemptNo: 1,
      index: 2,
      total: 20,
      secondsLeft: 41,
      secondsPerQuestion: 60,
      skipsLeft: 0,
      question: { id: "q", text: "سؤال", type: "multiple", options: [{ id: "o1", text: "أ" }] },
    });
  });

  it("المسلَّمة بنتيجتها — والأرقام النصّية تُقرأ أرقاماً", () => {
    expect(
      parseAttemptState({ status: "submitted", exam: "م", attempt_no: 2, score: "16", max: "20", percent: "80.0", passed: true, pass_percentage: "80.00" }),
    ).toMatchObject({ status: "submitted", percent: 80, passed: true, passPercentage: 80 });
  });

  it("**وغير المتوقَّع يُرفض** لا يُعرض نصفه", () => {
    expect(() => parseAttemptState(null)).toThrow();
    expect(() => parseAttemptState({ status: "open" })).toThrow();
    expect(() => parseAttemptState({ status: "weird" })).toThrow();
  });
});
