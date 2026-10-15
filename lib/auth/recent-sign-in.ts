/**
 * حداثة الدخول في **هذه الجلسة** — من claim الـ`amr` في رمزها (ب٢ · د-٩ · `adr/0051`).
 *
 * لا من `auth.users.last_sign_in_at`: ذاك يتحدّث بأي دخولٍ من أي جهاز، فتفتح جلسةٌ قديمة على
 * جهازٍ مشترك الباب بدخولٍ من الجوال. والـ`amr` يُكتب عند الدخول ولا يتغيّر بتجديد الرمز.
 */

export const REAUTH_WINDOW_SECONDS = 10 * 60;

type AmrEntry = { method?: unknown; timestamp?: unknown };

/**
 * طرق **الدخول** وحدها. لا `totp` ولا `webauthn` ولا `phone`: عاملٌ ثانٍ يسجّله من وجد الجلسة
 * مفتوحة ويتحقق منه فيُضاف إلى الجلسة نفسها «الآن» — فيتجاوز الحاجز بلا دخول (مراجعة ب٢ ١).
 */
const SIGN_IN_METHODS: ReadonlySet<string> = new Set(["oauth", "password", "otp", "magiclink", "recovery", "invite"]);

/** أحدث دخولٍ في الجلسة بالثواني — من مدخلات الـ`amr` ذات الوقت بطريقة دخول. فارغ = لا يُعرف. */
export function lastSignInAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  const times = amr
    .filter((e): e is AmrEntry => typeof e === "object" && e !== null)
    .filter((e) => typeof e.method === "string" && SIGN_IN_METHODS.has(e.method))
    .map((e) => Number(e.timestamp))
    .filter((t) => Number.isFinite(t) && t > 0);
  return times.length > 0 ? Math.max(...times) : null;
}

/** دخلَ في هذه الجلسة خلال النافذة — والوقت المستقبلي (انحراف الساعة) لا يُعدّ حديثاً بلا حدّ. */
export function signedInRecently(amr: unknown, nowSeconds: number, windowSeconds = REAUTH_WINDOW_SECONDS): boolean {
  const at = lastSignInAt(amr);
  if (at === null) return false;
  const age = nowSeconds - at;
  return age >= -60 && age <= windowSeconds;
}
