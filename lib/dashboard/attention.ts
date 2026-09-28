import { formatNumber } from "@/lib/format";

/**
 * «ما يحتاج انتباهك» — من مفتاحٍ في القاعدة إلى جملةٍ وطريقٍ إلى الإصلاح.
 *
 * القاعدة تُرجع `kind` ورقماً (`fn_attention_items`)، والنصّ العربي هنا: لغةٌ
 * تتغيّر لا تُخزَّن. **ولكل بندٍ رابطُ إصلاحه** — بندٌ بلا طريق إخبارٌ بالعطب
 * وتركٌ لصاحبه، وهو أسوأ من السكوت عنه.
 */

export const ATTENTION_KINDS = [
  "orphan_track",
  "track_without_plan",
  "track_change",
  "closed_with_followers",
  "no_contact",
  "full",
  "profile_missing",
] as const;

export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/** صفٌّ كما يأتي من `fn_attention_items`. */
export type AttentionRow = {
  kind: string;
  programId: string | null;
  programName: string | null;
  amount: number;
};

export type AttentionItem = {
  key: string;
  title: string;
  /** ماذا يترتّب على تركه — بلغة صاحب القرار لا بلغة الجدول. */
  consequence: string;
  href: string;
  cta: string;
};

/**
 * ترتيب العرض = **ترتيب الضرر**: من عَلِق به إنسانٌ اليوم قبل ما ينتظر قراراً،
 * وما ينتظر قراراً قبل ما هو إعدادٌ ناقص. ورقمُ الترتيب هنا لا في الاستعلام،
 * فالقاعدة تعدّ والشاشة ترتّب.
 */
const SEVERITY: Record<AttentionKind, number> = {
  orphan_track: 1,
  track_without_plan: 2,
  track_change: 3,
  closed_with_followers: 4,
  no_contact: 5,
  full: 6,
  profile_missing: 7,
};

function isKind(value: string): value is AttentionKind {
  return value in SEVERITY;
}

type Shape = (row: AttentionRow) => Omit<AttentionItem, "key">;

const SHAPE: Record<AttentionKind, Shape> = {
  orphan_track: (r) => ({
    title: `${formatNumber(r.amount)} مشاركاً على مسارٍ مؤرشف — ${r.programName}`,
    consequence: "لا خطة تُقرأ لهم ولا يوم يُرسَل. انقلهم إلى مسارٍ قائم.",
    href: `/programs/${r.programId}/participants`,
    cta: "افتح المشاركين",
  }),
  track_without_plan: (r) => ({
    title: `${formatNumber(r.amount)} مساراً بلا خطة — ${r.programName}`,
    consequence: "البرنامج منشور، ومن يسجّل في هذه المسارات لا يجد ما يبدأ به.",
    href: `/programs/${r.programId}/plans`,
    cta: "افتح الخطط",
  }),
  track_change: (r) => ({
    title: `${formatNumber(r.amount)} طلب نقلٍ ينتظر البتّ — ${r.programName}`,
    consequence: "المشارك واقفٌ حتى تقرّر، ولا يُنقل أحدٌ بلا قرارك.",
    href: `/programs/${r.programId}/participants`,
    cta: "افتح المشاركين",
  }),
  closed_with_followers: (r) => ({
    title: `${formatNumber(r.amount)} مشاركاً في برنامجٍ مغلق — ${r.programName}`,
    consequence: "البرنامج أُغلق وحالاتهم ما زالت تتبع الخطة، فتُطلب منهم أيامٌ انتهى وقتها.",
    href: `/programs/${r.programId}/participants`,
    cta: "افتح المشاركين",
  }),
  no_contact: (r) => ({
    title: `${r.programName} منشورٌ بلا جهة تواصل`,
    consequence: "كل رسالة توقّفٍ في رحلة المشارك تقول «تواصل مع الإدارة» — بلا وسيلة.",
    href: `/programs/${r.programId}`,
    cta: "افتح البرنامج",
  }),
  full: (r) => ({
    title: `${r.programName} اكتمل مقعده`,
    consequence: `السعة ${formatNumber(r.amount)}، والتسجيل متوقّف. ارفعها أو اترك الباب مغلقاً.`,
    href: `/programs/${r.programId}`,
    cta: "افتح البرنامج",
  }),
  profile_missing: (r) => ({
    title: `${formatNumber(r.amount)} حساباً بلا ملفّ مكتمل`,
    consequence: "مدعوٌّ لم يُفعّل حسابه، أو داخلٌ لم يُكمل بياناته — ولا يظهر في أي قائمة.",
    href: "/team",
    cta: "افتح الإدارة",
  }),
};

/**
 * يحوّل صفوف القاعدة إلى بنودٍ مرتّبة. والمفتاح المجهول **يُتجاهَل** لا يُعرَض
 * خاماً: هجرةٌ أضافت نوعاً قبل نشر الشاشة لا تُظهر رمزاً إنجليزياً للمدير.
 */
export function attentionItems(rows: readonly AttentionRow[]): AttentionItem[] {
  return rows
    .filter((r): r is AttentionRow & { kind: AttentionKind } => isKind(r.kind) && r.amount > 0)
    .sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind])
    .map((r) => ({ key: `${r.kind}:${r.programId ?? "-"}`, ...SHAPE[r.kind](r) }));
}
