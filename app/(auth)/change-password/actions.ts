"use server";

import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { finishTempPassword } from "@/lib/auth/temp-password-server";
import { setPasswordSchema } from "@/lib/validation/auth";

/**
 * تعيين الكلمة بدل المؤقتة (`adr/0060`): الكلمة أولاً ثم الختام (`finishTempPassword`) — فلا تُرفع
 * العلامة والمؤقتة قائمة.
 */
export async function changeTempPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = setPasswordSchema.safeParse({
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const next = safeNext(form.get("next"));
  const session = await getSession();
  if (session.status === "anonymous") return { error: "انتهت جلستك. سجّل الدخول من جديد." };
  if (session.status !== "password_change") redirect(next);
  if (session.expired) return { error: "انتهت صلاحية الكلمة المؤقتة. اطلب كلمةً جديدة من مشرفك." };

  const db = await createClient();
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error?.code === "same_password") {
    return { fieldErrors: { password: "هذه كلمتك الحالية — اختر غيرها" } };
  }
  if (error?.code === "weak_password") {
    return { fieldErrors: { password: "كلمة المرور ضعيفة — اختر أطول منها" } };
  }
  if (error) return { error: "تعذّر حفظ كلمة المرور. أعد المحاولة." };

  // فشل الرفع لا يُتجاوَز: تبقى العلامة فيُعاد إلى هذه الشاشة، وكلمته الجديدة قائمة.
  if (!(await finishTempPassword(db, session.userId))) {
    return { error: "حُفظت كلمتك، لكن تعذّر إكمال الخطوة. اكتب كلمةً أخرى ثم احفظ." };
  }

  redirect(next);
}
