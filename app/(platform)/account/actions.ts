"use server";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { withinRateLimit } from "@/lib/auth/rate-limit";
import { getSession } from "@/lib/auth/session";
import { userMessage } from "@/lib/db/messages";
import { createClient } from "@/lib/db/server";
import { env } from "@/lib/env.server";
import { setSignInBlocked } from "@/lib/mail";
import { setPasswordSchema } from "@/lib/validation/auth";
import { profileInput, profileSchema } from "@/lib/validation/profile";

/**
 * «حسابي» — ما يفعله المستخدم بحسابه هو.
 *
 * كل إجراء هنا على **المستدعي وحده**: لا معرّف مستخدمٍ يصل من النموذج، والهويّة
 * من الجلسة، والسياسات تقصر التعديل على صاحب الملف.
 */

/** بياناتي — بالقواعد نفسها التي يُستكمل بها الحساب (`lib/validation/profile.ts`). */
export async function updateMyProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse(profileInput(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const session = await getSession();
  if (session.status !== "active") return { error: "انتهت جلستك. سجّل الدخول من جديد." };

  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .update(parsed.data)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: userMessage(error, "تعذّر حفظ بياناتك.") };

  revalidatePath("/account");
  return { notice: "حُفظت بياناتك." };
}

/**
 * تغيير كلمة المرور — أو إضافتها لمن دخل بـ Google وحده.
 *
 * **الحالية تُطلب ممّن له كلمة مرور:** جلسةٌ مفتوحة على جهازٍ مشترك لا تكفي
 * لتغييرها. وتُتحقَّق بعميلٍ مستقلّ بلا كوكيز، فلا يمسّ جلسة المستخدم الحالية.
 */
export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = setPasswordSchema.safeParse({
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const session = await getSession();
  if (session.status !== "active") return { error: "انتهت جلستك. سجّل الدخول من جديد." };

  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "انتهت جلستك. سجّل الدخول من جديد." };

  const hasPassword = (auth.user.identities ?? []).some((i) => i.provider === "email");
  if (hasPassword) {
    const current = String(form.get("current") ?? "");
    if (!current) return { fieldErrors: { current: "اكتب كلمة المرور الحالية" } };

    if (!(await withinRateLimit("auth.login", session.email))) {
      return { error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." };
    }

    const verifier = createStatelessClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const check = await verifier.auth.signInWithPassword({ email: session.email, password: current });
    if (check.error) return { fieldErrors: { current: "كلمة المرور الحالية غير صحيحة" } };
    // جلسة التحقّق لا حاجة لها — تُغلق وحدها، وتبقى جلسة المستخدم.
    await verifier.auth.signOut({ scope: "local" });
  }

  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error: /different|same/i.test(error.message)
        ? "كلمة المرور الجديدة هي نفسها الحالية."
        : "تعذّر حفظ كلمة المرور. أعد المحاولة.",
    };
  }

  return { notice: hasPassword ? "تغيّرت كلمة المرور." : "أُضيفت كلمة المرور. تستطيع الدخول بها أو بـ Google." };
}

const CLOSE_PHRASE = "أغلق حسابي";

/**
 * إغلاق الحساب — القاعدة تُخرجه من مشاركاته وتُوقف ملفه في معاملة واحدة
 * (الهجرة ٠٣٤)، ثم يُمنع دخوله ويُخرَج من جلسته.
 */
export async function closeMyAccount(_prev: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("confirm") ?? "").trim() !== CLOSE_PHRASE) {
    return { fieldErrors: { confirm: `اكتب «${CLOSE_PHRASE}» كما هي للتأكيد` } };
  }

  const session = await getSession();
  if (session.status !== "active") return { error: "انتهت جلستك. سجّل الدخول من جديد." };

  const db = await createClient();
  const { error } = await db.rpc("fn_close_my_account");
  if (error) return { error: userMessage(error, "تعذّر إغلاق الحساب. أعد المحاولة.") };

  // الملف موقوف فلا يملك شيئاً؛ والمنع يمنع الجلسة من التجدّد، والخروج يُنهي الحالية.
  await setSignInBlocked(session.userId, true);
  await db.auth.signOut();

  redirect("/sign-in?error=account-closed");
}
