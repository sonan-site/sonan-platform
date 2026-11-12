"use server";

import { setTempPassword } from "@/lib/auth/admin";
import { withinRateLimit } from "@/lib/auth/rate-limit";
import { getSession } from "@/lib/auth/session";
import { generateTempPassword, TEMP_PASSWORD_HOURS } from "@/lib/auth/temp-password";
import { userMessage } from "@/lib/db/messages";
import { createClient } from "@/lib/db/server";
import { now } from "@/lib/format";
import { z } from "@/lib/validation/z";

/**
 * إصدار كلمة مرور مؤقتة (adr/0060). **الإذن في القاعدة** (`fn_temp_password_issue`): `users.password`
 * في نطاق الطالب، وحساب الفريق لمدير المنصة وحده — ونطاق الطالب برامجه، فلا يُحكم عليه هنا بلا مشاركاته.
 * والترتيب: الحدّ ← الإذن والسجلّ ← التعيين. فلا تُعيَّن كلمةٌ لم يُؤذن بها ولم تُسجَّل.
 *
 * **الكلمة تُعاد مرّة** إلى شاشة المُصدِر ولا تُحفظ في شيء — لا في السجلّ ولا في القاعدة.
 */
export type IssueResult = { ok: true; password: string; expiresAt: string } | { ok: false; error: string };

export async function issueTempPassword(userId: string): Promise<IssueResult> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "حساب غير معروف." };

  const session = await getSession();
  if (session.status !== "active") return { ok: false, error: "انتهت جلستك. سجّل الدخول من جديد." };

  if (!(await withinRateLimit("auth.temp_password", session.userId))) {
    return { ok: false, error: "أصدرتَ كلماتٍ كثيرة في ساعة. انتظر قليلاً ثم أعد المحاولة." };
  }

  const expiresAt = new Date(now().getTime() + TEMP_PASSWORD_HOURS * 3_600_000).toISOString();
  const db = await createClient();
  const { data: profileId, error } = await db.rpc("fn_temp_password_issue", {
    p_user_id: userId,
    p_expires_at: expiresAt,
  });
  if (error) return { ok: false, error: userMessage(error, "تعذّر إصدار الكلمة. أعد المحاولة.") };

  const password = generateTempPassword();
  const set = await setTempPassword(userId, password, expiresAt);
  if (!set.ok) {
    // الإذن سُجِّل قبل التعيين — فيُسجَّل فشله معه، فلا يُقرأ السجلّ إصداراً لم يقع.
    await db.rpc("fn_write_audit", {
      p_action: "temp_password_failed",
      p_entity_table: "profiles",
      p_entity_id: profileId,
      p_after: { user_id: userId },
    });
    return { ok: false, error: "تعذّر تعيين الكلمة. أعد المحاولة." };
  }

  return { ok: true, password, expiresAt };
}
