import { z } from "@/lib/validation/z";

/**
 * أنواع عناصر صفحة البرنامج — **مغلقة** (`adr/0011`).
 *
 * الحرية حرية **تركيب**: الإدارة تُنشئ أي عدد من النُّسخ بأي ترتيب، ويجوز تكرار
 * النوع الواحد. وليست حرية **تعريف**: إضافة نوع جديد تغييرٌ في الكود لا نقرة.
 * ولا CSS ولا JS يُخزَّنان — والسبب مكتوب في `adr/0035`.
 *
 * ولكل نوع مخطّطه هنا، والقاعدة تحمل قيد `CHECK` على مفاتيحه الإلزامية — فالحارس
 * في الطبقتين: مخطّط يُفرَض في الخادم، وقيد لا يُلتَفّ عليه.
 */

export const BLOCK_TYPES = [
  "header",
  "hero",
  "free_text",
  "image",
  "countdown",
  "stats",
  "timeline",
  "tracks",
  "prizes",
  "terms",
  "registration",
  "faq",
  "cta",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** الصنف بنيوي لا تجميلي: يحدّد **ما يُخزَّن** لا كيف يبدو. */
export const BLOCK_CATEGORY: Record<BlockType, "content" | "data" | "action"> = {
  header: "content",
  hero: "content",
  free_text: "content",
  image: "content",
  countdown: "data",
  stats: "content",
  timeline: "content",
  tracks: "data",
  prizes: "content",
  terms: "content",
  registration: "action",
  faq: "data",
  cta: "action",
};

export const BLOCK_LABEL: Record<BlockType, string> = {
  header: "ترويسة",
  hero: "غلاف",
  free_text: "نص حر",
  image: "صورة",
  countdown: "عدّاد الإغلاق",
  stats: "أرقام",
  timeline: "المراحل",
  tracks: "عرض المسارات",
  prizes: "جدول الجوائز",
  terms: "الشروط",
  registration: "زر التسجيل",
  faq: "الأسئلة الشائعة",
  cta: "دعوة",
};

/**
 * حدّ الصفوف في العناصر ذات القوائم.
 *
 * عددٌ ثابت لا إضافةٌ وحذف: النموذج يُعرض بصفوفه كلها والفارغُ يُسقَط — وهو نمط
 * شرائح شاشة الدخول (`lib/settings/showcase.ts`). فلا أزرارَ صفوفٍ تُدار بحالة.
 */
export const BLOCK_ROWS = {
  stats: 6,
  timeline: 8,
  prizes: 10,
  terms: 10,
} as const;

const text = (max = 120) => z.string().trim().max(max, `لا يزيد عن ${max} حرفاً`);

const headerContent = z.object({
  title: z.string().trim().min(2, "العنوان مطلوب"),
  subtitle: text(200).default(""),
});

/** الغلاف: أول ما يُرى — عنوانٌ ووصفٌ وزرّان اختياريان. */
const heroContent = z.object({
  title: z.string().trim().min(2, "العنوان مطلوب"),
  subtitle: text(300).default(""),
  primaryLabel: text(40).default(""),
  primaryHref: text(300).default(""),
  secondaryLabel: text(40).default(""),
  secondaryHref: text(300).default(""),
});

const freeTextContent = z.object({
  heading: text().default(""),
  text: z.string().trim().min(2, "النص مطلوب"),
});

const imageContent = z.object({
  attachmentId: z.uuid("اختر صورة"),
  alt: text(200).default(""),
});

/** عناصر عرض البيانات والإجراء تخزّن إعداداتها فقط — بياناتها مولَّدة. */
const tracksContent = z.object({
  heading: text().default("المسارات"),
  showCapacity: z.boolean().default(false),
  /** عدد وحدات المادة في نصيب كل مسار — محسوبٌ حيّ. */
  showUnits: z.boolean().default(false),
});

const faqContent = z.object({
  heading: text().default("الأسئلة الشائعة"),
});

const registrationContent = z.object({
  heading: text().default(""),
  buttonLabel: text(40).default("سجّل في البرنامج"),
});

/** العدّاد: موعده **من البرنامج** لا من هنا — فلا رقمان يفترقان. */
const countdownContent = z.object({
  heading: text().default("يُغلق التسجيل"),
  endedText: text(120).default("أُغلق التسجيل"),
});

const statsContent = z.object({
  heading: text().default(""),
  items: z
    .array(z.object({ value: text(24), label: text(60) }))
    .max(BLOCK_ROWS.stats)
    .default([]),
});

/** مصدر المراحل: نصٌّ يُكتب هنا، أو مواعيد البرنامج بتواريخها الحقيقية (`adr/0044`). */
export const TIMELINE_SOURCES = ["manual", "schedule"] as const;

const timelineContent = z.object({
  heading: text().default("المراحل"),
  source: z.enum(TIMELINE_SOURCES).default("manual"),
  stages: z
    .array(
      z.object({
        title: text(60),
        /** التاريخ نصٌّ كما يكتبه المُعِدّ: هجريّ أو ميلاديّ أو كلاهما. */
        dates: text(80).default(""),
        note: text(160).default(""),
      }),
    )
    .max(BLOCK_ROWS.timeline)
    .default([]),
});

const prizesContent = z.object({
  heading: text().default("الجوائز"),
  /** جوائزُ مسارٍ بعينه — فارغ = جوائز عامة. تُقرأ في واجهة الحملة تحت بطاقة مساره (`adr/0045`). */
  trackId: z.union([z.uuid(), z.literal("")]).default(""),
  places: z
    .array(z.object({ label: text(40), value: text(24) }))
    .max(BLOCK_ROWS.prizes)
    .default([]),
  note: text(300).default(""),
});

const termsContent = z.object({
  heading: text().default("قبل التسجيل"),
  items: z.array(text(300)).max(BLOCK_ROWS.terms).default([]),
});

const ctaContent = z.object({
  heading: text().default(""),
  text: z.string().trim().min(2, "النص مطلوب"),
  buttonLabel: text(40).default(""),
  buttonHref: text(300).default(""),
});

export const BLOCK_SCHEMAS = {
  header: headerContent,
  hero: heroContent,
  free_text: freeTextContent,
  image: imageContent,
  countdown: countdownContent,
  stats: statsContent,
  timeline: timelineContent,
  tracks: tracksContent,
  prizes: prizesContent,
  terms: termsContent,
  registration: registrationContent,
  faq: faqContent,
  cta: ctaContent,
} as const;

export type BlockContent = {
  [K in BlockType]: z.infer<(typeof BLOCK_SCHEMAS)[K]>;
};

export function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

/**
 * يتحقّق من محتوى عنصر بحسب نوعه.
 * **الفشل قيمة تُعالَج لا استثناء يُلقى**: صفحة معلنة لا تسقط لأن عنصراً فيها
 * محتواه تالف — بل يُتخطّى العنصر ويبقى الباقي.
 */
export function parseBlockContent(
  type: BlockType,
  raw: unknown,
): { ok: true; content: BlockContent[BlockType] } | { ok: false; issues: string[] } {
  const result = BLOCK_SCHEMAS[type].safeParse(raw ?? {});
  if (result.success) return { ok: true, content: result.data };
  return { ok: false, issues: result.error.issues.map((i) => i.message) };
}
