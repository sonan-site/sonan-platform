import { randomInt } from "node:crypto";
import { lastSignInAt } from "./recent-sign-in";

/**
 * كلمة المرور المؤقتة (adr/0060) — يُصدرها مشرفٌ لمن لا يصل حسابه، فيدخل بها ويُجبَر على كلمةٍ جديدة.
 *
 * **العلامة في `app_metadata`** لا في جدولٍ عام: لا يكتبها إلا مفتاح الخدمة، فلا يرفعها صاحب الحساب
 * عن نفسه، وتصل مع المستخدم في الرحلة التي تدفعها الجلسة أصلاً — بلا نداءٍ زائد في كل طلب.
 */

export const TEMP_PASSWORD_HOURS = 48;

/** مفتاح العلامة: وجوده = «يجب التغيير»، وقيمته آخر لحظةٍ يُقبل فيها الدخول بالكلمة. */
export const TEMP_PASSWORD_KEY = "temp_password_expires_at";

/** أبطل المجدوِلُ الكلمة بعد أجلها (`fn_temp_password_void_expired`) — يُمحى مع العلامة. */
export const TEMP_PASSWORD_VOIDED_KEY = "temp_password_voided";

/**
 * طرق دخولٍ تُثبت صاحب الحساب بغير الكلمة المؤقتة: Google، ورابط الاسترجاع أو الدعوة إلى بريده، والرمز.
 * فمن دخل بإحداها يعيّن كلمته أياً كان الأجل (مراجعة ١: كان المسترجِع بعد الأجل يُقفَل خارج حسابه).
 */
const PROVING_METHODS: ReadonlySet<string> = new Set(["oauth", "recovery", "invite", "otp", "magiclink"]);

// بلا المتشابهات (l/1 · o/0 · i) — تُملى في واتساب وتُكتب في جوال.
const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

/** خمسة أحرف ثم أربعة أرقام (`kmrtp-4829`) — لاتينية صغيرة، فلا لبس في حالة الحرف. */
export function generateTempPassword(): string {
  const pick = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
  return `${pick(LETTERS, 5)}-${pick(DIGITS, 4)}`;
}

export type TempPasswordState = "none" | "pending" | "expired";

/**
 * حال الكلمة المؤقتة في **هذه الجلسة**.
 *
 * **الأجل بلحظة الدخول لا بالآن:** خدمة المصادقة تقبل الكلمة المنتهية — لا أجل عندها — فالحاجز هنا.
 * من دخل قبل انقضائها يُتمّ تعيين كلمته ولو تأخّر، ومن دخل بها بعده لا يُعيّن شيئاً.
 * **ومن أثبت نفسه بغيرها** (`PROVING_METHODS`) يعيّن كلمته أياً كان الأجل.
 * والعلامة التالفة منتهية: الافتراض الآمن يُفحَص لا يُفترَض.
 */
export function tempPasswordState(appMetadata: unknown, amr: unknown, nowMs: number): TempPasswordState {
  const raw = (appMetadata as Record<string, unknown> | null | undefined)?.[TEMP_PASSWORD_KEY];
  if (raw === undefined || raw === null) return "none";
  const expires = typeof raw === "string" ? Date.parse(raw) : NaN;
  if (!Number.isFinite(expires)) return "expired";

  const entries = Array.isArray(amr) ? (amr as { method?: unknown }[]) : [];
  const proven = entries.some(
    (e) => typeof e === "object" && e !== null && typeof e.method === "string" && PROVING_METHODS.has(e.method),
  );
  if (proven) return "pending";

  const at = lastSignInAt(amr);
  return (at === null ? nowMs : at * 1000) <= expires ? "pending" : "expired";
}
