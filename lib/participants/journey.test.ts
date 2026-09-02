import { describe, expect, it } from "vitest";
import {
  canSubmit,
  currentDayNumber,
  journeyProgress,
  neighbours,
  resolveDayNumber,
  type JourneyDay,
} from "./journey";

/** خطة عشرة أيام، راحة في السابع، واختبار في العاشر. */
function plan(submittedUpTo: number, workless: number[] = []): JourneyDay[] {
  return Array.from({ length: 10 }, (_, i) => {
    const dayNumber = i + 1;
    const dayType: JourneyDay["dayType"] =
      dayNumber === 7 ? "rest" : dayNumber === 10 ? "exam" : "normal";
    return {
      id: `d${dayNumber}`,
      dayNumber,
      dayType,
      submitted: dayType === "normal" && dayNumber <= submittedUpTo,
      hasWork: dayType === "normal" && !workless.includes(dayNumber),
    };
  });
}

describe("اليوم الجاري", () => {
  it("خطة لم تبدأ: أول يوم", () => {
    expect(currentDayNumber(plan(0))).toBe(1);
  });

  it("**الراحة تُتخطّى** — ولو عُدّت لتوقّفت الرحلة عندها", () => {
    // أُرسلت ١–٦، والسابع راحة فلا يُرسَل.
    expect(currentDayNumber(plan(6))).toBe(8);
  });

  it("يوم الاختبار يُتخطّى كذلك", () => {
    const days = plan(9);
    expect(currentDayNumber(days)).toBeNull();
  });

  it("خطة فارغة بلا يوم جارٍ", () => {
    expect(currentDayNumber([])).toBeNull();
  });

  it("المتعثّر يجد يومه حيث تركه لا حيث كان يُفترَض", () => {
    expect(currentDayNumber(plan(3))).toBe(4);
  });
});

describe("اليوم المعروض", () => {
  it("المطلوب يُحترَم إن كان موجوداً", () => {
    expect(resolveDayNumber(plan(2), 9)).toBe(9);
  });

  it("رقم خارج الخطة يسقط على الجاري لا يُفشل الصفحة", () => {
    expect(resolveDayNumber(plan(2), 99)).toBe(3);
  });

  it("بلا طلب: الجاري", () => {
    expect(resolveDayNumber(plan(5), null)).toBe(6);
  });

  it("خطة أُتمّت: آخر يوم", () => {
    expect(resolveDayNumber(plan(9), null)).toBe(10);
  });

  it("خطة فارغة: لا يوم", () => {
    expect(resolveDayNumber([], null)).toBeNull();
  });
});

describe("التنقّل", () => {
  it("الجوار يشمل الراحة — التنقّل يعرضها ولا يتخطّاها", () => {
    expect(neighbours(plan(0), 7)).toEqual({ previous: 6, next: 8 });
  });

  it("الطرفان بلا جار خارجهما", () => {
    expect(neighbours(plan(0), 1).previous).toBeNull();
    expect(neighbours(plan(0), 10).next).toBeNull();
  });

  it("رقم غير موجود بلا جوار", () => {
    expect(neighbours(plan(0), 44)).toEqual({ previous: null, next: null });
  });
});

describe("الإرسال — الجاري وحده", () => {
  it("اليوم الجاري يُرسَل", () => {
    expect(canSubmit(plan(3), 4)).toBe(true);
  });

  it("**الماضي لا يُرسَل ثانيةً** — اللقطة تُثبَّت مرة", () => {
    expect(canSubmit(plan(3), 2)).toBe(false);
  });

  it("**المستقبل لا يُرسَل** — سلسلةٌ فيها ثقوب", () => {
    expect(canSubmit(plan(3), 8)).toBe(false);
  });

  it("الراحة لا تُرسَل", () => {
    expect(canSubmit(plan(6), 7)).toBe(false);
  });

  it("خطة أُتمّت: لا إرسال لأي يوم", () => {
    const done = plan(9);
    expect(done.every((d) => !canSubmit(done, d.dayNumber))).toBe(true);
  });
});

describe("التقدّم", () => {
  it("أيام العمل تستثني الراحة والاختبار", () => {
    expect(journeyProgress(plan(0)).workDays).toBe(8);
  });

  it("الالتزام نسبة المُرسَل من أيام العمل", () => {
    const p = journeyProgress(plan(4));
    expect(p.submittedDays).toBe(4);
    expect(p.commitment).toBe(0.5);
  });

  it("خطة فارغة بلا قسمة على صفر", () => {
    expect(journeyProgress([])).toEqual({ workDays: 0, submittedDays: 0, commitment: 0 });
  });
});

describe("اليوم بقالبٍ بلا حقول", () => {
  it("**يُتخطّى ولا يعلق المشارك عنده** — لا شيء فيه يُرسَل", () => {
    // اليومان الرابع والخامس بقالب بلا حقول، ولم يُرسَل شيء.
    expect(currentDayNumber(plan(3, [4, 5]))).toBe(6);
  });

  it("لا يُحتسَب يوم عمل في الالتزام", () => {
    const p = journeyProgress(plan(0, [2, 3]));
    // ثمانية أيام عادية، اثنان بلا حقول.
    expect(p.workDays).toBe(6);
  });

  it("لا يُرسَل", () => {
    expect(canSubmit(plan(3, [4]), 4)).toBe(false);
  });

  it("خطة كلها بلا حقول: لا يوم جارٍ ولا قسمة على صفر", () => {
    const empty = plan(0, [1, 2, 3, 4, 5, 6, 8, 9]);
    expect(currentDayNumber(empty)).toBeNull();
    expect(journeyProgress(empty).commitment).toBe(0);
  });
});
