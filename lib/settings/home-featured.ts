import { z } from "@/lib/validation/z";

/**
 * واجهة الحملة في الصفحة الرئيسية (`adr/0045`، الهجرة ٠٦٩).
 *
 * المفتاح يحمل رابط البرنامج أو لا شيء. والزائر يقرؤه بـ`fn_home_featured` التي
 * لا تُرجع إلا رابطاً **منشوراً** — فمفتاحٌ على مسوّدة لا يُفرغ الصفحة الرئيسية.
 */

export const HOME_FEATURED_KEY = "home.featured_program";

export const homeFeaturedSchema = z.object({
  slug: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

export type HomeFeatured = z.output<typeof homeFeaturedSchema>;

/** قيمة مخزّنة ← رابطٌ أو لا شيء. التالف لا يُسقط الإعدادات. */
export function parseHomeFeatured(value: unknown): HomeFeatured {
  const parsed = homeFeaturedSchema.safeParse(value);
  return parsed.success ? parsed.data : { slug: null };
}
