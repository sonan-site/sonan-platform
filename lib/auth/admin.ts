import "server-only";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { TEMP_PASSWORD_KEY, TEMP_PASSWORD_VOIDED_KEY } from "./temp-password";

/**
 * كتابة خدمة المصادقة بمفتاح الخدمة لكلمة المرور المؤقتة (adr/0060) — هنا لا في قناة البريد.
 * و`app_metadata` يُدمَج عند الخدمة لا يُستبدَل، والقيمة الفارغة تمحو مفتاحها.
 */

export type AdminResult = { ok: true } | { ok: false; reason: string };

/** الكلمة مع علامتها وأجلها في طلبٍ واحد — فلا تقوم كلمةٌ بلا علامة. وإبطالٌ سابق يُمحى. */
export async function setTempPassword(userId: string, password: string, expiresAt: string): Promise<AdminResult> {
  const { error } = await createServiceRoleClient().auth.admin.updateUserById(userId, {
    password,
    app_metadata: { [TEMP_PASSWORD_KEY]: expiresAt, [TEMP_PASSWORD_VOIDED_KEY]: null },
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/** رفع العلامة بعد أن يعيّن صاحب الحساب كلمته. */
export async function clearTempPassword(userId: string): Promise<AdminResult> {
  const { error } = await createServiceRoleClient().auth.admin.updateUserById(userId, {
    app_metadata: { [TEMP_PASSWORD_KEY]: null, [TEMP_PASSWORD_VOIDED_KEY]: null },
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}
