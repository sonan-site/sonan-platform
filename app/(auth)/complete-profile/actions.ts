"use server";

import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { profileInput, profileSchema } from "@/lib/validation/profile";
import { z } from "@/lib/validation/z";

/**
 * استكمال الحساب — البيانات كلها لكل حساب ناقص (`adr/0025`، الهجرة ٠٣٦).
 *
 * **إدراج أو تحديث:** من دخل بـ Google أول مرة لا ملف له، والحساب القديم له ملفٌ
 * تنقصه الحقول الجديدة. والكتابة بعميل المستخدم نفسه: السياسات تقصرها على صاحب
 * الملف، والحارس يمنعه من تعديل حالته.
 */
/** الموافقة مربّعٌ مؤشَّر — والمتصفح يرسل `on` للمؤشَّر ولا شيء لغيره (`adr/0028`). */
const consentSchema = z.literal("on", { message: "يلزم الموافقة على الشروط وسياسة الخصوصية لإكمال حسابك" });

export async function completeProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse(profileInput(form));
  const consent = consentSchema.safeParse(form.get("acceptTerms"));
  if (!parsed.success || !consent.success) {
    return {
      fieldErrors: {
        ...(parsed.success ? {} : toFieldErrors(parsed.error.issues)),
        ...(consent.success ? {} : { acceptTerms: consent.error.issues[0]!.message }),
      },
    };
  }

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

  // الإقرار: متى وعلى أي نسخة — والنسخة الحالية شرط الاكتمال (الهجرة ٠٤٠).
  const row = { ...parsed.data, terms_accepted_at: nowIso(), terms_version: TERMS_VERSION };

  // `full_name` يُحسب من الأجزاء بمشغّل القاعدة؛ القيمة المرسلة هنا لا تُحفظ.
  const { error } = existing
    ? await db.from("profiles").update(row).eq("id", existing.id)
    : await db.from("profiles").insert({ user_id: session.userId, full_name: "", ...row });

  // 23505 = أُنشئ الملف في طلبٍ سابق (نقرة مزدوجة) — يتابع، والجلسة تحكم بالاكتمال.
  if (error && error.code !== "23505") {
    return { error: "تعذّر حفظ بياناتك. تحقّق منها وأعد المحاولة." };
  }

  redirect(next);
}
