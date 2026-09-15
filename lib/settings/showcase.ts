import { z } from "@/lib/validation/z";

/**
 * شرائح واجهة الدخول — نصف الشاشة التعريفي (الهجرة ٠٣٨).
 *
 * تُقرأ للزائر بـ`fn_auth_showcase`، وتُعدَّل من «الإعدادات». والقراءة **لا تفشل
 * الشاشة**: قيمةٌ تالفة أو قاعدةٌ لا تجيب تعني «لا شرائح»، فيبقى الدخول متاحاً.
 */

export const SHOWCASE_KEY = "auth.showcase";
export const MAX_SLIDES = 5;

export const slideSchema = z.object({
  title: z.string().trim().min(2, "العنوان حرفان فأكثر").max(60, "العنوان لا يزيد عن ٦٠ حرفاً"),
  body: z.string().trim().max(200, "النصّ لا يزيد عن ٢٠٠ حرف"),
});

export const showcaseSchema = z.object({
  slides: z.array(slideSchema).max(MAX_SLIDES, `الحدّ ${MAX_SLIDES} شرائح`),
});

export type Slide = z.output<typeof slideSchema>;
export type Showcase = z.output<typeof showcaseSchema>;

/** قيمة مخزّنة ← شرائح صالحة، أو لا شيء. */
export function parseShowcase(value: unknown): Showcase {
  const parsed = showcaseSchema.safeParse(value);
  return parsed.success ? parsed.data : { slides: [] };
}

/**
 * نموذج الإعدادات يُرسل خانات مرقّمة (`title-0`، `body-0` …). الشريحة الفارغة
 * كلها تُسقَط: من يريد ثلاث شرائح يترك الباقي فارغاً.
 */
export function showcaseInput(form: FormData): { slides: { title: string; body: string }[] } {
  const slides: { title: string; body: string }[] = [];
  for (let i = 0; i < MAX_SLIDES; i++) {
    const title = String(form.get(`title-${i}`) ?? "").trim();
    const body = String(form.get(`body-${i}`) ?? "").trim();
    if (title || body) slides.push({ title, body });
  }
  return { slides };
}
