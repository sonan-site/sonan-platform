/**
 * وجهة ما بعد الدخول.
 *
 * **الافتراضي `/dashboard` لا `/`.** من سجّل دخوله يريد المنصة لا واجهة
 * الزائر، وإرجاعه إليها يجعله يبحث عن مدخله بعد أن دخل.
 *
 * **و`//` ليست مساراً داخلياً.** `//evil.example` يبدأ بشرطة، والمتصفّح
 * يقرؤها عنواناً بروتوكولاً نسبياً فيخرج بالمستخدم من الموقع — تحويلٌ مفتوح
 * يُستعمَل في التصيّد. فالمقبول شرطةٌ واحدة لا يتلوها شرطة ولا شرطة معكوسة.
 *
 * في وحدة مستقلّة لا في ملف الأفعال: قاعدة أمنية بلا اختبار دَين، وملف
 * `"use server"` لا يُصدَّر منه إلا الأفعال فلا يُختبَر ما فيه.
 */
export const DEFAULT_LANDING = "/dashboard";

export function safeNext(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  // المتصفّح يحذف المحارف الخفية قبل قراءة العنوان، فـ`/\t/evil` تصير `//evil`.
  if ([...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) {
    return DEFAULT_LANDING;
  }
  if (!value.startsWith("/")) return DEFAULT_LANDING;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_LANDING;
  return value;
}
