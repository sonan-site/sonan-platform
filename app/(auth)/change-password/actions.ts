"use server";

import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { clearTempPassword } from "@/lib/mail";
import { setPasswordSchema } from "@/lib/validation/auth";

/**
 * تعيين الكلمة بدل المؤقتة (`adr/0060`): الكلمة أولاً ثم رفع العلامة — فلا تُرفع العلامة والمؤقتة
 * قائمة. ثم تُغلق جلساته الأخرى: من عرف المؤقتة ودخل بها لا يبقى داخلاً.
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
    return { fieldErrors: { password: "اختر كلمةً غير الكلمة المؤقتة" } };
  }
  if (error?.code === "weak_password") {
    return { fieldErrors: { password: "كلمة المرور ضعيفة — اختر أطول منها" } };
  }
  if (error) return { error: "تعذّر حفظ كلمة المرور. أعد المحاولة." };

  // فشل الرفع لا يُتجاوَز: تبقى العلامة فيُعاد إلى هذه الشاشة، وكلمته الجديدة قائمة.
  const cleared = await clearTempPassword(session.userId);
  if (!cleared.ok) return { error: "حُفظت كلمتك، لكن تعذّر إكمال الخطوة. اكتب كلمةً أخرى ثم احفظ." };

  await db.auth.signOut({ scope: "others" });

  const { data: profile } = await db.from("profiles").select("id").eq("user_id", session.userId).maybeSingle();
  await db.rpc("fn_write_audit", {
    p_action: "temp_password_replaced",
    p_entity_table: "profiles",
    ...(profile ? { p_entity_id: profile.id } : {}),
    p_after: { user_id: session.userId },
  });

  redirect(next);
}
