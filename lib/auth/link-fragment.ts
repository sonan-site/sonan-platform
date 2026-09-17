/**
 * قراءة ما يضعه Supabase **بعد `#`** في رابط الاسترجاع والدعوة.
 *
 * **لماذا بعد `#`:** الرسالة تُرسَل من الخادم، فرابطها بالتدفّق الضمني: يتحقّق
 * Supabase من الرمز ثم يعيد المستخدم إلى المنصة **والجلسة في جزء العنوان بعد
 * `#`** (`#access_token=…&refresh_token=…`)، أو الخطأ كذلك (`#error_code=otp_expired`).
 * وهذا الجزء لا يصل الخادم أصلاً — فمسار `/auth/callback` كان يرى رابطاً بلا
 * رمز ويردّ «الرابط غير صالح» لكل من فتح رسالة استرجاع أو دعوة.
 *
 * وتعديل قالب الرسالة إلى رابطٍ يصل الخادم (`/auth/confirm`) غير متاح في الخطة
 * المجانية ببريد Supabase الافتراضي — فتُقرأ الجلسة هنا في المتصفح.
 */

export type LinkFragment =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error"; expired: boolean }
  | { kind: "none" };

export function parseLinkFragment(hash: string): LinkFragment {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  const errorCode = params.get("error_code") ?? params.get("error");
  if (errorCode) return { kind: "error", expired: errorCode === "otp_expired" };

  const accessToken = params.get("access_token") ?? "";
  const refreshToken = params.get("refresh_token") ?? "";
  if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken };

  return { kind: "none" };
}
