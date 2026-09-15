"use server";

import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { completeProfileSchema } from "@/lib/validation/auth";

/**
 * استكمال الحساب — الاسم والجوال لمن دخل بـ Google (`adr/0025`).
 *
 * يُدرج الملف بعميل المستخدم نفسه: سياسة `profiles_insert_self` تقصره على
 * صاحبه، فلا يُكمل أحدٌ ملف غيره.
 */
export async function completeProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = completeProfileSchema.safeParse({
    fullName: form.get("fullName"),
    phone: form.get("phone"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const next = safeNext(form.get("next"));
  const session = await getSession();
  if (session.status === "anonymous") return { error: "انتهت جلستك. سجّل الدخول من جديد." };
  if (session.status !== "incomplete") redirect(next);

  const db = await createClient();
  // لا تدقيق هنا: إنشاء الملف بالبريد (مشغّل القاعدة) لا يُدقَّق كذلك، والسجل
  // للأفعال الإدارية. ومن لا صلاحية له لا يكتب فيه أصلاً (الهجرة ٠٢٦).
  const { error } = await db
    .from("profiles")
    .insert({ user_id: session.userId, full_name: parsed.data.fullName, phone: parsed.data.phone });

  // 23505 = أُنشئ الملف في طلبٍ سابق (نقرة مزدوجة) — الحساب مكتمل، فيتابع.
  if (error && error.code !== "23505") {
    return { error: "تعذّر حفظ بياناتك. أعد المحاولة." };
  }

  redirect(next);
}
