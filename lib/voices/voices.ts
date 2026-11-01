import { z } from "@/lib/validation/z";

/**
 * «صوتك» (adr/0054) — الأنواع والأحوال ونصوصها وتحقّق الإرسال والرد، في موضعٍ واحد للطالب والإدارة.
 * والقاعدة تعيد الفحص كله (`fn_submit_voice` · `fn_reply_voice`) — هذا ليرى المرسِل خطأه قبل الإرسال.
 */

export const VOICE_KINDS = ["inquiry", "note", "suggestion", "technical", "complaint"] as const;
export type VoiceKind = (typeof VOICE_KINDS)[number];

/** بترتيب نموذج الراعي. */
export const VOICE_KIND_LABEL: Record<VoiceKind, string> = {
  inquiry: "استفسار",
  note: "ملاحظة",
  suggestion: "اقتراح",
  technical: "مشكلة تقنية",
  complaint: "شكوى",
};

export const VOICE_STATUSES = ["new", "in_progress", "closed"] as const;
export type VoiceStatus = (typeof VOICE_STATUSES)[number];

/** للطالب: ما يعنيه — «وصلت» لا «جديدة». */
export const VOICE_STATUS_STUDENT: Record<VoiceStatus, string> = {
  new: "وصلت",
  in_progress: "قيد المعالجة",
  closed: "مغلقة",
};

/** للإدارة. */
export const VOICE_STATUS_STAFF: Record<VoiceStatus, string> = {
  new: "جديدة",
  in_progress: "قيد المعالجة",
  closed: "مغلقة",
};

export const isVoiceKind = (v: unknown): v is VoiceKind => typeof v === "string" && (VOICE_KINDS as readonly string[]).includes(v);
export const isVoiceStatus = (v: unknown): v is VoiceStatus =>
  typeof v === "string" && (VOICE_STATUSES as readonly string[]).includes(v);

/** طولٌ بنقاط الترميز كـ`char_length` في القاعدة — لا بوحدات UTF-16 فيُحسب الرمز التعبيري حرفين. */
const chars = (min: number, max: number, short: string, long: string) =>
  z
    .string()
    .trim()
    .refine((s) => [...s].length >= min, short)
    .refine((s) => [...s].length <= max, long);

export const submitVoiceSchema = z.object({
  kind: z.enum(VOICE_KINDS, "اختر نوع الرسالة"),
  title: chars(3, 120, "العنوان ٣ أحرف فأكثر", "العنوان ١٢٠ حرفاً على الأكثر"),
  body: chars(10, 2000, "اكتب التفاصيل في ١٠ أحرف فأكثر", "التفاصيل ٢٠٠٠ حرف على الأكثر"),
  path: z.string().max(500).optional().default(""),
  ua: z.string().max(500).optional().default(""),
  viewport: z.string().max(40).optional().default(""),
});

export const replyVoiceSchema = z.object({
  id: z.uuid(),
  reply: chars(2, 1000, "اكتب الرد", "الرد ١٠٠٠ حرف على الأكثر"),
  close: z.boolean(),
});
