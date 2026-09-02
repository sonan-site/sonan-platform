import "server-only";
import { createServiceRoleClient } from "@/lib/db/service-role";

/**
 * قناة البريد — **عقد ضيّق** (`platform.md §٩`).
 *
 * الدعوة والاسترجاع يمرّان من هنا وحدهما. المزوّد اليوم هو بريد Supabase Auth،
 * وتبديله غداً يعني إعادة كتابة هذا الملف **وحده** — لأن ما فوقه لا يعرف عنه شيئاً:
 * لا قوالب ولا مفاتيح ولا أسماء حقول تتسرّب إلى الشاشات ولا إلى الإجراءات.
 *
 * العقد ثلاث دوال، وكلها تُرجع نتيجة صريحة لا تستثني: الفشل حالة تُعالَج لا استثناء يُلقى.
 */

export type MailResult = { ok: true } | { ok: false; reason: string };

export async function sendInvite(email: string, redirectTo: string): Promise<MailResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

export async function sendRecovery(email: string, redirectTo: string): Promise<MailResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * إبطال جلسات مستخدم — يُستدعى عند الإيقاف وتغيير الدور.
 * ليس بريداً، لكنه من نفس عقد إدارة الحساب: كلاهما يمرّ بامتياز الخادم وحده.
 */
export async function revokeSessions(userId: string): Promise<MailResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.signOut(userId, "global");
  return error ? { ok: false, reason: error.message } : { ok: true };
}
