import { describe, expect, it } from "vitest";
import {
  activeDayCount,
  generateDays,
  MAX_PLAN_DAYS,
  parseUploadedPlan,
  planIssues,
  type DayDraft,
} from "./build";

const TPL = "11111111-1111-1111-1111-111111111111";

describe("التوليد بمعطيات", () => {
  it("يولّد العدد المطلوب مرقّماً من ١ بلا فجوة", () => {
    const days = generateDays({ dayCount: 10, dayTemplateId: TPL });
    expect(days).toHaveLength(10);
    expect(days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("بلا إيقاع راحة: كلها عادية بقالبها", () => {
    const days = generateDays({ dayCount: 5, dayTemplateId: TPL });
    expect(days.every((d) => d.dayType === "normal")).toBe(true);
    expect(days.every((d) => d.dayTemplateId === TPL)).toBe(true);
  });

  it("راحة كل سابع يوم تقع على ٧ و١٤ لا غير", () => {
    const days = generateDays({ dayCount: 15, dayTemplateId: TPL, restEvery: 7 });
    const rest = days.filter((d) => d.dayType === "rest").map((d) => d.dayNumber);
    expect(rest).toEqual([7, 14]);
  });

  it("يوم الراحة بلا قالب وبلا اختبار — وإلا كسر قيد الاتساق", () => {
    const rest = generateDays({ dayCount: 7, dayTemplateId: TPL, restEvery: 7 }).at(-1)!;
    expect(rest.dayType).toBe("rest");
    expect(rest.dayTemplateId).toBeNull();
    expect(rest.examId).toBeNull();
  });

  it("المضاعف يسري على الأيام العادية دون الراحة", () => {
    const days = generateDays({ dayCount: 3, dayTemplateId: TPL, amountMultiplier: 2, restEvery: 3 });
    expect(days[0]!.amountMultiplier).toBe(2);
    expect(days[2]!.amountMultiplier).toBe(1);
  });

  it("صفر يوم يعطي خطة فارغة لا خطأً — والفحص يردّها", () => {
    const days = generateDays({ dayCount: 0, dayTemplateId: TPL });
    expect(days).toEqual([]);
    expect(planIssues(days)).toContain("الخطة بلا أيام.");
  });

  it("إيقاع راحة ١ لا يجعل الخطة كلها راحة بلا واجب... بل يجعلها كذلك صراحةً", () => {
    const days = generateDays({ dayCount: 4, dayTemplateId: TPL, restEvery: 1 });
    expect(days.every((d) => d.dayType === "rest")).toBe(true);
    expect(activeDayCount(days)).toBe(0);
  });
});

describe("عدّ الأيام النشطة", () => {
  it("الراحة خارج العدّ", () => {
    const days = generateDays({ dayCount: 14, dayTemplateId: TPL, restEvery: 7 });
    expect(days).toHaveLength(14);
    expect(activeDayCount(days)).toBe(12);
  });
});

describe("الرفع صورة من اليدوي", () => {
  it("سطر لكل يوم، والرقم من الترتيب", () => {
    const result = parseUploadedPlan("عادي\nعادي\nراحة\nعادي", TPL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(result.days.map((d) => d.dayType)).toEqual(["normal", "normal", "rest", "normal"]);
  });

  it("المضاعف من العمود الثاني، وغيابه واحد", () => {
    const result = parseUploadedPlan("عادي,2\nعادي", TPL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days[0]!.amountMultiplier).toBe(2);
    expect(result.days[1]!.amountMultiplier).toBe(1);
  });

  it("**الأرقام العربية تُقرأ** — الملصوق من جدول عربي لا يُردّ", () => {
    const result = parseUploadedPlan("عادي,٣", TPL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days[0]!.amountMultiplier).toBe(3);
  });

  it("ترويسة معروفة تُتخطّى ولا تُحسب يوماً", () => {
    const result = parseUploadedPlan("النوع,المضاعف\nعادي,1\nراحة", TPL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days).toHaveLength(2);
    expect(result.days[0]!.dayNumber).toBe(1);
  });

  it("الأسطر الفارغة تُتجاهل ولا تُزحزح الترقيم", () => {
    const result = parseUploadedPlan("عادي\n\n\nراحة\n", TPL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days.map((d) => d.dayNumber)).toEqual([1, 2]);
  });

  it("نوع مجهول يُردّ برقم سطره لا برسالة عامة", () => {
    const result = parseUploadedPlan("عادي\nمراجعة\nراحة", TPL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.line).toBe(2);
    expect(result.issues[0]!.message).toContain("مراجعة");
  });

  it("**يوم الاختبار لا يُرفَع** — يُردّ برسالة تقول ماذا يُفعل بدلاً منه", () => {
    const result = parseUploadedPlan("عادي\nاختبار", TPL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.message).toContain("يُضاف بعد الرفع");
  });

  it("مضاعف غير موجب يُردّ", () => {
    const result = parseUploadedPlan("عادي,0\nعادي,-2\nعادي,س", TPL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.line)).toEqual([1, 2, 3]);
  });

  it("ملف فارغ يُردّ ولا يُنتج خطة صفرية", () => {
    const result = parseUploadedPlan("\n\n  \n", TPL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.message).toContain("فارغ");
  });

  it("أطول من الحدّ يُردّ قبل قراءة سطوره", () => {
    const text = Array.from({ length: MAX_PLAN_DAYS + 1 }, () => "عادي").join("\n");
    const result = parseUploadedPlan(text, TPL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.message).toContain(String(MAX_PLAN_DAYS));
  });

  it("خطأ واحد يُبطل الرفع كلّه — لا خطة نصفها مرفوع", () => {
    const result = parseUploadedPlan("عادي\nخطأ\nعادي", TPL);
    expect(result.ok).toBe(false);
  });

  it("المصدران ينتهيان إلى الصفوف نفسها", () => {
    const generated = generateDays({ dayCount: 3, dayTemplateId: TPL, restEvery: 3 });
    const uploaded = parseUploadedPlan("عادي\nعادي\nراحة", TPL);
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    expect(uploaded.days).toEqual(generated);
  });
});

describe("الفحص قبل الكتابة", () => {
  const good: DayDraft = {
    dayNumber: 1,
    dayType: "normal",
    dayTemplateId: TPL,
    amountMultiplier: 1,
    examId: null,
  };

  it("خطة سليمة بلا ملاحظات", () => {
    expect(planIssues(generateDays({ dayCount: 30, dayTemplateId: TPL, restEvery: 7 }))).toEqual([]);
  });

  it("ترقيم منقطع يُرصد", () => {
    expect(planIssues([good, { ...good, dayNumber: 3 }])).toContain("ترقيم الأيام غير متّصل من ١.");
  });

  it("يوم عادي بلا قالب يُرصد", () => {
    expect(planIssues([{ ...good, dayTemplateId: null }])).toContain("اليوم 1: يوم عادي بلا قالب.");
  });

  it("قالب على يوم راحة يُرصد", () => {
    expect(planIssues([{ ...good, dayType: "rest" }])).toContain(
      "اليوم 1: قالب على يوم ليس عادياً.",
    );
  });

  it("يوم اختبار بلا اختبار يُرصد", () => {
    expect(
      planIssues([{ ...good, dayType: "exam", dayTemplateId: null }]),
    ).toContain("اليوم 1: يوم اختبار بلا اختبار.");
  });

  it("مضاعف صفر يُرصد", () => {
    expect(planIssues([{ ...good, amountMultiplier: 0 }])).toContain("اليوم 1: مضاعف غير موجب.");
  });
});
