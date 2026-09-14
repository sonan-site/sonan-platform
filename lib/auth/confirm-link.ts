import { safeNext } from "./safe-next";

/**
 * رابط البريد — الدعوة واستعادة كلمة المرور.
 *
 * **لماذا لا يكفي `/auth/callback?code=`:** الرسالتان تُرسَلان من الخادم بمفتاح
 * الخدمة، فلا يوجد في متصفّح المستخدم «مُحقِّق الرمز» الذي يوجبه تبادل `code`.
 * فكان الرابط يصل ثم يُردّ «غير صالح» دائماً. والحلّ الذي توصي به Supabase
 * للخادم: قالب البريد يضع `token_hash` في الرابط، والخادم يتحقّق منه بـ
 * `verifyOtp` فتُكتب الجلسة في كوكيز المتصفح نفسه.
 *
 * وحدة نقيّة: تقرأ المعاملات وتقرّر، فتُختبَر بلا شبكة.
 */

/** `email` لرابط تأكيد البريد بعد إنشاء الحساب — حين يُفعَّل التأكيد مع SMTP. */
export const CONFIRM_TYPES = ["invite", "recovery", "email"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export type ConfirmLink = { tokenHash: string; type: ConfirmType; next: string };

export function parseConfirmLink(params: URLSearchParams): ConfirmLink | null {
  const tokenHash = params.get("token_hash") ?? "";
  const type = params.get("type") ?? "";
  // الأنواع الثلاثة وحدها: رابطٌ بنوع آخر (تغيير بريد، رابط سحري) لا تصدره المنصة.
  if (!tokenHash || !(CONFIRM_TYPES as readonly string[]).includes(type)) return null;
  return { tokenHash, type: type as ConfirmType, next: safeNext(params.get("next")) };
}
