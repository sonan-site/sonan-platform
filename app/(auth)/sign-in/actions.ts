"use server";

import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { withinRateLimit } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/db/server";
import { signInSchema } from "@/lib/validation/auth";

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

  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") ? next : "/");
}

