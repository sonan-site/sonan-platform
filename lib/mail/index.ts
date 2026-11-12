import "server-only";
import { TEMP_PASSWORD_KEY } from "@/lib/auth/temp-password";
import { createServiceRoleClient } from "@/lib/db/service-role";

/**
 * قناة البريد — **عقد ضيّق** (`platform.md §٩`).
 *
 * الدعوة والاسترجاع يمرّان من هنا وحدهما. المزوّد اليوم هو بريد Supabase Auth،
 * وتبديله غداً يعني إعادة كتابة هذا الملف **وحده** — لأن ما فوقه لا يعرف عنه شيئاً:
 * لا قوالب ولا مفاتيح ولا أسماء حقول تتسرّب إلى الشاشات ولا إلى الإجراءات.
 *
 * العقد كله يُرجع نتيجة صريحة لا تستثني: الفشل حالة تُعالَج لا استثناء يُلقى.
 */

export type MailResult = { ok: true } | { ok: false; reason: string };

export async function sendInvite(
  email: string,
  redirectTo: string,
  profile: { fullName: string },
): Promise<MailResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    // الاسم للعرض في قائمة المستخدمين حتى يستكمل المدعوّ بياناته بنفسه.
    data: { full_name: profile.fullName },
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

export async function sendRecovery(email: string, redirectTo: string): Promise<MailResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * منع الحساب من الدخول أو رفع المنع — يُستدعى عند الإيقاف والاستعادة.
 *
 * **الحظر لا تسجيل الخروج:** `admin.signOut` يأخذ رمز جلسة لا معرّف مستخدم،
 * فكان الاستدعاء القديم يفشل دائماً بصمت. الحظر يُبطل تجديد الرمز، فلا تعيش
 * الجلسة بعد عمر رمزها. وقبل ذلك تُسقِط القاعدة صلاحياته في الطلب نفسه
 * (الهجرة ٠٢٦).
 */
export async function setSignInBlocked(userId: string, blocked: boolean): Promise<MailResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: blocked ? "876000h" : "none",
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * كلمة مرور مؤقتة (adr/0060): تُعيَّن مع علامة «يجب التغيير» وأجلها في طلبٍ واحد — فلا تقوم كلمةٌ
 * بلا علامة. و`app_metadata` يُدمَج عند الخدمة لا يُستبدَل، فتبقى مفاتيحها (`providers`) كما هي.
 */
export async function setTempPassword(userId: string, password: string, expiresAt: string): Promise<MailResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    app_metadata: { [TEMP_PASSWORD_KEY]: expiresAt },
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/** رفع العلامة بعد أن يعيّن صاحب الحساب كلمته — والقيمة الفارغة تمحو المفتاح عند الخدمة. */
export async function clearTempPassword(userId: string): Promise<MailResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { [TEMP_PASSWORD_KEY]: null },
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}
