"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { clearRateLimit, withinRateLimit } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/db/server";
import { isSessionMode, MODE_COOKIE, type SessionMode } from "@/lib/auth/mode";
import { signInSchema } from "@/lib/validation/auth";

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
  const { error } = await db.auth.signInWithPassword(parsed.data);

  // رسالة واحدة للبريد الخطأ ولكلمة المرور الخطأ: التفريق بينهما يكشف
  // أي البُرد مسجَّلة عندنا، وهو تسريب لا يخدم أحداً إلا من يعدّ الحسابات.
  if (error) return { error: "بيانات الدخول غير صحيحة." };

  await clearRateLimit("auth.login", parsed.data.email);

  const raw = form.get("mode");
  const mode: SessionMode = isSessionMode(raw) ? raw : "participant";
  (await cookies()).set(MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(safeNext(form.get("next")));
}

