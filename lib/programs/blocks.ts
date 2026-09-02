import { z } from "zod";

/**
 * أنواع عناصر صفحة البرنامج — **مغلقة** (`adr/0011`).
 *
 * الحرية حرية **تركيب**: الإدارة تُنشئ أي عدد من النُّسخ بأي ترتيب، ويجوز تكرار
 * النوع الواحد. وليست حرية **تعريف**: إضافة نوع جديد تغييرٌ في الكود لا نقرة.
 *
 * ولكل نوع مخطّطه هنا، والقاعدة تحمل قيد `CHECK` على مفاتيحه الإلزامية — فالحارس
 * في الطبقتين: مخطّط يُفرَض في الخادم، وقيد لا يُلتَفّ عليه.
 */

export const BLOCK_TYPES = [
  "header",
  "free_text",
  "image",
  "tracks",
  "faq",
  "registration",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** الصنف بنيوي لا تجميلي: يحدّد **ما يُخزَّن** لا كيف يبدو. */
export const BLOCK_CATEGORY: Record<BlockType, "content" | "data" | "action"> = {
  header: "content",
  free_text: "content",
  image: "content",
  tracks: "data",
  faq: "data",
  registration: "action",
};

export const BLOCK_LABEL: Record<BlockType, string> = {
  header: "ترويسة",
  free_text: "نص حر",
  image: "صورة",
  tracks: "عرض المسارات",
  faq: "الأسئلة الشائعة",
  registration: "زر التسجيل",
};

const headerContent = z.object({
  title: z.string().trim().min(2, "العنوان مطلوب"),
  subtitle: z.string().trim().default(""),
});

const freeTextContent = z.object({
  heading: z.string().trim().default(""),
  text: z.string().trim().min(2, "النص مطلوب"),
});

const imageContent = z.object({
  attachmentId: z.uuid("اختر صورة"),
  alt: z.string().trim().default(""),
});

/** عناصر عرض البيانات والإجراء تخزّن إعداداتها فقط — بياناتها مولَّدة. */
const tracksContent = z.object({
  heading: z.string().trim().default("المسارات"),
  showCapacity: z.boolean().default(false),
});

const faqContent = z.object({
  heading: z.string().trim().default("الأسئلة الشائعة"),
});

const registrationContent = z.object({
  heading: z.string().trim().default(""),
  buttonLabel: z.string().trim().default("سجّل في البرنامج"),
});

export const BLOCK_SCHEMAS = {
  header: headerContent,
  free_text: freeTextContent,
  image: imageContent,
  tracks: tracksContent,
  faq: faqContent,
  registration: registrationContent,
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
