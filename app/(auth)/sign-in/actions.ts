"use server";

import { redirect } from "next/navigation";
import { DEFAULT_LANDING, safeNext } from "@/lib/auth/safe-next";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { clearRateLimit, withinRateLimit } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/db/server";
import { isSessionMode, type SessionMode } from "@/lib/auth/mode";
import { writeMode } from "@/lib/auth/mode-cookie";
import { signInSchema } from "@/lib/validation/auth";
import { now } from "@/lib/format";
import { tempPasswordState } from "@/lib/auth/temp-password";

/**
 * الدخول — من البوابتين كلتيهما.
 *
 * **الباب يكتب وضع الجلسة** (`adr/0032`): الداخل من بوابة الإدارة يرى شاشات
 * العمل، والداخل من بوابة المشاركين يرى رحلته. والحساب واحد في الحالتين.
 */
export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  // ١ · التحقّق أولاً — لا عمل قبله.
  const parsed = signInSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  // ٢ · حدّ المعدل قبل محاولة المصادقة، لا بعدها.
  if (!(await withinRateLimit("auth.login", parsed.data.email))) {
    return { error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." };
  }

  const db = await createClient();
  const { data: signedIn, error } = await db.auth.signInWithPassword(parsed.data);

  // رسالة واحدة للبريد الخطأ ولكلمة المرور الخطأ: التفريق بينهما يكشف
  // أي البُرد مسجَّلة عندنا، وهو تسريب لا يخدم أحداً إلا من يعدّ الحسابات.
  if (error) return { error: "بيانات الدخول غير صحيحة." };

  await clearRateLimit("auth.login", parsed.data.email);

  // كلمةٌ مؤقتة انقضى أجلها: خدمة المصادقة تقبلها، فتُردّ هنا — والجلسة لا تبقى (`adr/0060`).
  const temp = tempPasswordState(signedIn.user?.app_metadata, null, now().getTime());
  if (temp === "expired") {
    await db.auth.signOut({ scope: "local" });
    return { error: "انتهت صلاحية كلمة المرور المؤقتة. اطلب كلمةً جديدة من مشرفك." };
  }

  const raw = form.get("mode");
  const mode: SessionMode = isSessionMode(raw) ? raw : "participant";
  await writeMode(mode);

  // الطالب بلا وجهةٍ مقصودة إلى بابه مباشرة، لا إلى لوحةٍ تحوّله (`adr/0049` · المراجعة ٣).
  const next = safeNext(form.get("next"));
  const landing = next === DEFAULT_LANDING && mode === "participant" ? "/journey" : next;
  // والسارية: يعيّن كلمته قبل وجهته.
  if (temp === "pending") redirect(`/change-password?next=${encodeURIComponent(landing)}`);
  redirect(landing);
}

