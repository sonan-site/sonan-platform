"use server";

import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { profileInput, profileSchema } from "@/lib/validation/profile";

/**
 * استكمال الحساب — البيانات كلها لكل حساب ناقص (`adr/0025`، الهجرة ٠٣٦).
 *
 * **إدراج أو تحديث:** من دخل بـ Google أول مرة لا ملف له، والحساب القديم له ملفٌ
 * تنقصه الحقول الجديدة. والكتابة بعميل المستخدم نفسه: السياسات تقصرها على صاحب
 * الملف، والحارس يمنعه من تعديل حالته.
 */
export async function completeProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse(profileInput(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const next = safeNext(form.get("next"));
  const session = await getSession();
  if (session.status === "anonymous") return { error: "انتهت جلستك. سجّل الدخول من جديد." };
  if (session.status !== "incomplete") redirect(next);

  const db = await createClient();
  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .maybeSingle();

  // `full_name` يُحسب من الأجزاء بمشغّل القاعدة؛ القيمة المرسلة هنا لا تُحفظ.
  const { error } = existing
    ? await db.from("profiles").update(parsed.data).eq("id", existing.id)
    : await db.from("profiles").insert({ user_id: session.userId, full_name: "", ...parsed.data });

  // 23505 = أُنشئ الملف في طلبٍ سابق (نقرة مزدوجة) — يتابع، والجلسة تحكم بالاكتمال.
  if (error && error.code !== "23505") {
    return { error: "تعذّر حفظ بياناتك. تحقّق منها وأعد المحاولة." };
  }

  redirect(next);
}
