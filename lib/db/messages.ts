/**
 * رسالة خطأ القاعدة للمستخدم.
 *
 * حرّاس القاعدة يرفضون برسائل كتبناها بلغة المُعِدّ («هذا الواجب مستعمَل في
 * شكل يوم»)، فتُعرض كما هي. أما رسائل Postgres نفسه فإنجليزية تقنية
 * («violates check constraint…»)، فتُستبدل برسالة الإجراء العامة.
 *
 * والفارق يُقرأ من النصّ لا من الرمز وحده: `23514` يصدر عن حرّاسنا وعن قيود
 * الجداول معاً.
 */

const ARABIC = /[؀-ۿ]/;

export function userMessage(
  error: { code?: string; message: string } | null,
  fallback: string,
  duplicate?: string,
): string {
  if (!error) return fallback;
  if (error.code === "23505" && duplicate) return duplicate;
  if ((error.code === "23514" || error.code === "42501") && ARABIC.test(error.message)) {
    return error.message.endsWith(".") ? error.message : `${error.message}.`;
  }
  return fallback;
}
