import { formatNumber } from "@/lib/format";

/**
 * معايير تقييم الاختبار النهائي كما تُعلن للمشارك في دليله (`adr/0056`).
 * المصدر: «دليل المحكّم — ١٤٤٨هـ» (القسمان ٤ و٥). **نصٌّ في الكود لا في الإعدادات** — دَين `د-١٤`.
 */

/** عدد أسئلة النهائي بترتيب المسارات: الأول ← الخامس. */
export const QUESTIONS_BY_TRACK_ORDER = [10, 15, 20, 25, 30] as const;

/**
 * أسطر بطاقة «عدد الأسئلة»: المسار بعدده. **لا تُعرض إلا والمسارات بعدد الأعداد المعلنة** — فالعدد يُربط
 * بالموضع لا بالمعرّف، وإعادة ترتيب المسارات أو أرشفة أحدها أو إضافة آخر تُنسب لمسارٍ عدد غيره (`د-١٤`).
 */
export function questionCountRows(tracks: readonly { id: string; name: string }[]): { id: string; name: string; count: number }[] | null {
  if (tracks.length !== QUESTIONS_BY_TRACK_ORDER.length) return null;
  return tracks.flatMap((t, i) => {
    const count = QUESTIONS_BY_TRACK_ORDER[i];
    return count === undefined ? [] : [{ id: t.id, name: t.name, count }];
  });
}

export type Deduction = { name: string; description: string; points: 1 | 0.5 | 0.25 };

export const DEDUCTIONS: readonly Deduction[] = [
  {
    name: "الخطأ في المتن أو الراوي",
    description: "حذف كلمة أو زيادتها أو استبدالها بغير معناها، أو خطأ في اسم الراوي",
    points: 1,
  },
  { name: "التوقف الطويل", description: "توقف كامل تجاوز 10 ثوانٍ", points: 1 },
  { name: "التردد أو التلعثم", description: "تكرار الكلمة أكثر من مرة، أو تردد واضح يقطع انسياب القراءة", points: 0.5 },
  { name: "اللحن الجلي", description: "خطأ في حركات الإعراب بما يخل بالقواعد النحوية", points: 0.5 },
  {
    name: "اللحن الخفي",
    description: "خطأ في مخارج الحروف أو نطق الكلمات بطريقة غير فصيحة، دون تغيير المعنى",
    points: 0.25,
  },
  { name: "الإبدال بمرادف", description: "استبدال كلمة بأخرى بمعناها دون إخلال بالمعنى العام", points: 0.25 },
  {
    name: "الخلط بين الأحاديث",
    description: "الانتقال من متن حديث إلى حديث آخر، ويُخصم عند تنبيه اللجنة",
    points: 0.25,
  },
];

const DEDUCTION_LABELS: Record<Deduction["points"], string> = { 1: "درجة", 0.5: "نصف درجة", 0.25: "ربع درجة" };

export const deductionLabel = (points: Deduction["points"]): string => DEDUCTION_LABELS[points];

export const CRITERIA_INTRO = "الاختبار النهائي شفهي حضوري أمام لجنة تحكيم، ويتدرّج عدد أسئلته بحسب المسار.";

export const DEDUCTIONS_INTRO = "لكل سؤال عشر درجات، وتُخصم منها الأخطاء الآتية:";

export const DEDUCTIONS_NOTE = "يُحسب الخصم لكل سؤال على حدة.";

export const SCORING_STEPS: readonly string[] = [
  "درجة السؤال: عشر درجات ناقص الخصومات.",
  "درجتك عند المحكّم الواحد: مجموع درجات أسئلتك.",
  "درجتك النهائية: متوسط درجات المحكّمين.",
  "تُعتمد في النتيجة والجوائز النسبة المئوية لا الدرجة الخام.",
  "يُرتَّب المتسابقون تنازلياً في كل مسار.",
];

export const AWARD_INTRO = "لا تُمنح الجائزة إلا لمن اجتمع فيه شرطان معاً:";

/** شروط الجائزة — النسبة من إعداد الاختبار النهائي الحيّ (`awardPercentage`)، فلا تختلف عن شرط الأهلية المعلن. */
export function awardRules(awardPercentage: number): string[] {
  const pct = `${formatNumber(awardPercentage)}٪`;
  return [
    `أن يكون من العشرة الأوائل في مساره.`,
    `أن تبلغ نسبته ${pct} فأكثر.`,
  ];
}

/** ما يترتب على فقدان أحد الشرطين، وما يُفعل عند التساوي. */
export function awardNotes(awardPercentage: number): string[] {
  const pct = `${formatNumber(awardPercentage)}٪`;
  return [
    `من حقق ${pct} فأكثر ولم يكن من العشرة الأوائل فلا جائزة له.`,
    `من كان من العشرة الأوائل ولم يبلغ ${pct} فلا جائزة له.`,
    "عند التساوي في أيٍّ من المراكز العشرة الأولى، يُجرى اختبار شفهي إضافي للفصل بين المتساويين.",
  ];
}
