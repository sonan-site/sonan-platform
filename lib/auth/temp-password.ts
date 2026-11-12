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
 * **ومن دخل بـ Google** أثبت نفسه بغيرها، فيعيّن كلمته أياً كان الأجل.
 * والعلامة التالفة منتهية: الافتراض الآمن يُفحَص لا يُفترَض.
 */
export function tempPasswordState(appMetadata: unknown, amr: unknown, nowMs: number): TempPasswordState {
  const raw = (appMetadata as Record<string, unknown> | null | undefined)?.[TEMP_PASSWORD_KEY];
  if (raw === undefined || raw === null) return "none";
  const expires = typeof raw === "string" ? Date.parse(raw) : NaN;
  if (!Number.isFinite(expires)) return "expired";

  const entries = Array.isArray(amr) ? (amr as { method?: unknown }[]) : [];
  if (entries.some((e) => typeof e === "object" && e !== null && e.method === "oauth")) return "pending";

  const at = lastSignInAt(amr);
  return (at === null ? nowMs : at * 1000) <= expires ? "pending" : "expired";
}
