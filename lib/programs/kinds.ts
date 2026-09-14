/**
 * أنماط البرنامج — **الكتالوج المغلق**، ومصدر الحقيقة الوحيد للنمط في التطبيق.
 *
 * `adr/0003` جعل «البرنامج» حاوية عامة بثلاثة أنماط، و`adr/0024` رسم **أين
 * يقع الحدّ**: ما يخصّ المسابقة لا يقع في غيرها `[BR-KIND-01]`.
 *
 * وهذا الملف لا يفرض شيئاً — الفرض في القاعدة (الهجرة ٠٢٥). ما هنا **مصدر
 * واحد للتسمية والسماح** تستهلكه الشاشات، بدل ثلاث نسخ مكتوبة يدوياً كانت
 * متفرّقة في `programs-view` و`participants-view` و`participant-actions`.
 *
 * على غرار `config/permissions.ts`: كتالوج مغلق، وما ليس فيه غير موجود.
 */

export const PARTICIPANT_STATUSES = [
  "registered",
  "memorizing",
  "qualified",
  "not_qualified",
  "passed",
  "not_passed",
] as const;

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

/** التسمية المعروضة. النفي حيادي — **لا «راسب»**. */
export const PARTICIPANT_STATUS_LABEL: Record<ParticipantStatus, string> = {
  registered: "مسجَّل",
  memorizing: "حافظ",
  qualified: "مؤهَّل",
  not_qualified: "غير مؤهَّل",
  passed: "مجتاز",
  not_passed: "لم يجتز",
};

/** الحالتان اللتان تصفان موقعاً في الرحلة لا حكماً على نتيجة. */
const OPEN_STATUSES: readonly ParticipantStatus[] = ["registered", "memorizing"];

type KindEntry = {
  label: string;
  /**
   * ماذا يعطيك هذا النمط — **بلغة المُعِدّ**، وبما هو موجود فعلاً.
   * لا وعد بما لم يُبنَ ولا اعتذار عنه: ما ليس فيه لا يُذكر.
   */
  lede: string;
  /** مبنيّ فعلاً، أم محجوز معمارياً بلا سلوك خاصّ به بعد. */
  built: boolean;
  /** يقيس المشارك مقابل نتيجة — فله عتبتا اجتياز وجوائز. */
  scored: boolean;
  /** تُعرَّف فيه اختبارات، وتُضاف أيام اختبار إلى خطته. */
  exams: boolean;
  statuses: readonly ParticipantStatus[];
};

export const PROGRAM_KINDS = {
  competition: {
    label: "مسابقة",
    lede: "مسارات ومادة وخطة يومية، ومعها اختبارات ونسبتا الاجتياز والجوائز.",
    built: true,
    scored: true,
    exams: true,
    statuses: PARTICIPANT_STATUSES,
  },
  weekly_followup: {
    label: "متابعة أسبوعية",
    lede: "مسارات ومادة وخطة يومية، بلا اختبارات ولا نسب اجتياز.",
    built: false,
    scored: false,
    exams: false,
    statuses: OPEN_STATUSES,
  },
  remote_memorization: {
    label: "حفظ عن بعد",
    lede: "مسارات ومادة وخطة يومية، بلا اختبارات ولا نسب اجتياز.",
    built: false,
    scored: false,
    exams: false,
    statuses: OPEN_STATUSES,
  },
} as const satisfies Record<string, KindEntry>;

export type ProgramKind = keyof typeof PROGRAM_KINDS;

export const PROGRAM_KIND_CODES = Object.keys(PROGRAM_KINDS) as [ProgramKind, ...ProgramKind[]];

export function isProgramKind(value: unknown): value is ProgramKind {
  return typeof value === "string" && value in PROGRAM_KINDS;
}

/** تُعرَّف فيه اختبارات؟ `[BR-KIND-01]` */
export function kindAllowsExams(kind: ProgramKind): boolean {
  return PROGRAM_KINDS[kind].exams;
}

/** له عتبتا اجتياز وجوائز؟ `[BR-KIND-01]` */
export function kindIsScored(kind: ProgramKind): boolean {
  return PROGRAM_KINDS[kind].scored;
}

export function kindLabel(kind: ProgramKind): string {
  return PROGRAM_KINDS[kind].label;
}

/** الحالات المسموحة لمشارك في هذا النمط. `[BR-KIND-01]` */
export function statusesOf(kind: ProgramKind): readonly ParticipantStatus[] {
  return PROGRAM_KINDS[kind].statuses;
}

export function isStatusAllowed(kind: ProgramKind, status: string): boolean {
  return (statusesOf(kind) as readonly string[]).includes(status);
}
