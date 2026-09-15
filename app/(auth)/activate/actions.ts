"use server";

import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { DEFAULT_LANDING } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/db/server";
import { setPasswordSchema } from "@/lib/validation/auth";

/**
 * تعيين كلمة المرور — للمدعوّ أول مرة، ولمن استرجع كلمته.
 * لا حدّ معدل هنا: الوصول لهذه الشاشة يشترط جلسة صالحة من الرابط أصلاً.
 */
export async function setPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = setPasswordSchema.safeParse({
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "انتهت صلاحية الرابط. اطلب رابطاً جديداً." };

  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "تعذّر حفظ كلمة المرور. حاول مرة أخرى." };

  // ملف المستخدم يُنشأ عند أول تفعيل إن لم يكن موجوداً.
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  // يُنشئه مشغّل القاعدة عند الدعوة (الهجرة ٠٣١)، وهذا احتياطٌ لمن سبقه.
  // وفشله لا يُتجاوَز: حسابٌ بلا ملف يُعامَل موقوفاً فلا يدخل شيئاً.
  if (!profile) {
    const { error: profileError } = await db.from("profiles").insert({
      user_id: auth.user.id,
      full_name: String(auth.user.user_metadata?.["full_name"] ?? auth.user.email ?? ""),
      // الجوال وبقية البيانات تُكتب في «أكمل حسابك» بعد هذه الصفحة مباشرة.
      phone: null,
    });
    if (profileError) {
      return { error: "حُفظت كلمة المرور، لكن تعذّر إكمال حسابك. تواصل مع إدارة المنصة." };
    }
  }

  redirect(DEFAULT_LANDING);
}

