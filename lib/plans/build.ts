import { toLatinDigits } from "@/lib/format";

/**
 * بناء أيام الخطة — منطق خالص بلا قاعدة ولا شبكة.
 *
 * **مصادر البناء ثلاثة ونتيجتها واحدة** (`ENTITIES §ز`): توليد بمعطيات، وإدخال
 * يدوي، ورفع ملف. والرفع **صورة من اليدوي لا مصدر ثالث**: يُترجَم إلى الصفوف
 * نفسها التي ينتجها التوليد، ثم تُحرَّر كما تُحرَّر أي خطة. ولذلك لا يُخزَّن
 * مصدر البناء — لأنه لا يبقى منه أثر بعد أول تعديل.
 */

export type DayType = "normal" | "rest" | "exam";

export type DayDraft = {
  dayNumber: number;
  dayType: DayType;
  dayTemplateId: string | null;
  amountMultiplier: number;
  examId: string | null;
};

/** سقف طول الخطة. سنة كاملة — وأطول من ذلك خطأُ لصقٍ لا خطة. */
export const MAX_PLAN_DAYS = 366;

// ── التوليد بمعطيات ──

export type GenerateInput = {
  dayCount: number;
  dayTemplateId: string;
  /** مضاعف الأيام العادية. مقدار الحقل = الأساسي في القالب × هذا. */
  amountMultiplier?: number;
  /** راحة كل كم يوم. صفر أو غياب = بلا راحة. */
  restEvery?: number;
};

/**
 * خطة من قالب واحد بإيقاع راحة دوري.
 *
 * الراحة **بالترتيب لا بالتاريخ**: الخطة نسبية بلا تاريخ بدء، فيومها رقمٌ لا
 * يوم أسبوع. من أراد راحة الجمعة، حرّك أيام الراحة يدوياً بعد التوليد.
 */
export function generateDays(input: GenerateInput): DayDraft[] {
  const count = Math.trunc(input.dayCount);
  const restEvery = Math.trunc(input.restEvery ?? 0);
  const multiplier = input.amountMultiplier ?? 1;

  const days: DayDraft[] = [];
  for (let dayNumber = 1; dayNumber <= count; dayNumber += 1) {
    const isRest = restEvery > 0 && dayNumber % restEvery === 0;
    days.push(
      isRest
        ? { dayNumber, dayType: "rest", dayTemplateId: null, amountMultiplier: 1, examId: null }
        : {
            dayNumber,
            dayType: "normal",
            dayTemplateId: input.dayTemplateId,
            amountMultiplier: multiplier,
            examId: null,
          },
    );
  }
  return days;
}

// ── الرفع ──

export type ParseIssue = { line: number; message: string };
export type ParseResult =
  | { ok: true; days: DayDraft[] }
  | { ok: false; issues: ParseIssue[] };

const NORMAL_WORDS = new Set(["عادي", "عاديّ", "normal"]);
const REST_WORDS = new Set(["راحة", "راحه", "rest"]);
const EXAM_WORDS = new Set(["اختبار", "exam"]);
const HEADER_WORDS = new Set(["النوع", "نوع اليوم", "نوع", "type", "day_type"]);

/**
 * ملف مفصول بفواصل: سطرٌ لكل يوم، وعموده الأول النوع والثاني المضاعف.
 *
 * **رقم اليوم من ترتيب السطر لا من عمود.** رقمٌ مكتوب يُغري بالفجوات
 * والتكرار، وترتيب السطر لا يحتمل واحدةً منهما.
 *
 * أيام الاختبار لا تُرفَع: اليوم يشير إلى اختبار معرَّف مسبقاً، ولا يُعرَف
 * الاختبار من نصّ في ملف. تُضاف بعد الرفع.
 */
export function parseUploadedPlan(text: string, dayTemplateId: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, cells: line.split(",").map((c) => c.trim()) }))
    .filter((row) => row.cells.some((c) => c.length > 0));

  if (rows.length > 0 && HEADER_WORDS.has(rows[0]!.cells[0]!.toLowerCase())) {
    rows.shift();
  }

  const issues: ParseIssue[] = [];
  const days: DayDraft[] = [];

  if (rows.length === 0) {
    return { ok: false, issues: [{ line: 0, message: "الملف فارغ — لا سطر واحد يقرأ." }] };
  }
  if (rows.length > MAX_PLAN_DAYS) {
    return {
      ok: false,
      issues: [
        { line: 0, message: `الملف ${rows.length} سطراً، والحدّ ${MAX_PLAN_DAYS} يوماً.` },
      ],
    };
  }

  for (const [index, row] of rows.entries()) {
    const dayNumber = index + 1;
    const kind = (row.cells[0] ?? "").toLowerCase();
    const rawAmount = toLatinDigits(row.cells[1] ?? "").trim();

    if (EXAM_WORDS.has(kind)) {
      issues.push({
        line: row.line,
        message: "يوم الاختبار لا يُرفَع — يُضاف بعد الرفع باختيار اختباره.",
      });
      continue;
    }

    if (REST_WORDS.has(kind)) {
      days.push({
        dayNumber,
        dayType: "rest",
        dayTemplateId: null,
        amountMultiplier: 1,
        examId: null,
      });
      continue;
    }

    if (!NORMAL_WORDS.has(kind)) {
      issues.push({
        line: row.line,
        message: `نوع غير معروف: «${row.cells[0]}». المقبول: عادي · راحة.`,
      });
      continue;
    }

    const amount = rawAmount === "" ? 1 : Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      issues.push({ line: row.line, message: `مضاعف غير صالح: «${row.cells[1]}».` });
      continue;
    }

    days.push({
      dayNumber,
      dayType: "normal",
      dayTemplateId,
      amountMultiplier: amount,
      examId: null,
    });
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, days };
}

// ── الفحص قبل الكتابة ──

/**
 * ما يمنع كتابة هذه الأيام. قائمة فارغة = صالحة.
 *
 * يُفحَص هنا ما تفحصه القاعدة أيضاً — لا تكراراً بل **إنذاراً مبكراً**: القاعدة
 * تردّ الصفّ برسالة قيدٍ لا يفهمها المستخدم، وهذا يردّه برسالة يفهمها. القاعدة
 * تبقى هي الفاصل.
 */
export function planIssues(days: DayDraft[]): string[] {
  const issues: string[] = [];

  if (days.length === 0) issues.push("الخطة بلا أيام.");
  if (days.length > MAX_PLAN_DAYS) issues.push(`الخطة أطول من ${MAX_PLAN_DAYS} يوماً.`);

  const numbers = days.map((d) => d.dayNumber);
  const contiguous = numbers.every((n, i) => n === i + 1);
  if (!contiguous) issues.push("ترقيم الأيام غير متّصل من ١.");

  for (const day of days) {
    const where = `اليوم ${day.dayNumber}`;
    if (day.dayType === "normal" && !day.dayTemplateId) {
      issues.push(`${where}: يوم عادي بلا قالب.`);
    }
    if (day.dayType === "exam" && !day.examId) {
      issues.push(`${where}: يوم اختبار بلا اختبار.`);
    }
    if (day.dayType !== "normal" && day.dayTemplateId) {
      issues.push(`${where}: قالب على يوم ليس عادياً.`);
    }
    if (day.dayType !== "exam" && day.examId) {
      issues.push(`${where}: اختبار على يوم ليس اختباراً.`);
    }
    if (!(day.amountMultiplier > 0)) {
      issues.push(`${where}: مضاعف غير موجب.`);
    }
  }

  return issues;
}

/** عدد الأيام النشطة — يوم الراحة يخرج من العدّ، فهو لا يحمل واجباً. */
export function activeDayCount(days: DayDraft[]): number {
  return days.filter((d) => d.dayType !== "rest").length;
}
