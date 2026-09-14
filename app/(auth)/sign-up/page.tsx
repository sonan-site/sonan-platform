"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/db/browser";
import { signUpSchema } from "@/lib/validation/auth";
import styles from "../layout.module.css";

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}

/**
 * الزائر يُنشئ حسابه بنفسه.
 *
 * **من المتصفح لا من الخادم:** حدّ Supabase لإنشاء الحسابات يُحسب لكل عنوان.
 * لو مرّ الطلب بالخادم لحُسب كل الزوّار على عنوانه، فيُرفض الثلاثون الأوائل
 * يوم الإعلان. والاسم والجوال يُحملان مع الحساب، ومشغّل القاعدة يُنشئ منهما
 * الملف ويفرض صيغتهما (الهجرة ٠٣١) — فالتحقّق هنا تحسين تجربة لا حجّة.
 */
function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    const parsed = signUpSchema.safeParse({
      fullName: form.get("fullName"),
      phone: form.get("phone"),
      email: form.get("email"),
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
    if (!parsed.success) {
      setState({ fieldErrors: toFieldErrors(parsed.error.issues) });
      return;
    }

    startTransition(async () => {
      const { data, error } = await createClient().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { data: { full_name: parsed.data.fullName, phone: parsed.data.phone } },
      });

      if (error) {
        // رسالة واحدة للبريد المسجَّل وغيره: التفريق يكشف من له حساب عندنا.
        setState({
          error:
            error.status === 429
              ? "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة."
              : "تعذّر إنشاء الحساب. تحقّق من بياناتك أو ادخل إن كان لك حساب.",
        });
        return;
      }

      // حين يُفعَّل تأكيد البريد لا تُفتح جلسة حتى يُضغط الرابط.
      if (!data.session) {
        setState({ notice: "أرسلنا رابط التأكيد إلى بريدك. افتحه لإكمال حسابك." });
        return;
      }

      router.replace(next);
      router.refresh();
    });
  }

  return (
    <>
      <h1 className={styles.title}>إنشاء حساب</h1>
      <p className={styles.lede}>حسابٌ واحد تسجّل به في برامج الجمعية وتتابع رحلتك.</p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}
      {state.notice ? <p className={styles.notice}>{state.notice}</p> : null}

      <form action={submit}>
        <Field id="fullName" label="الاسم الكامل" required error={state.fieldErrors?.["fullName"]}>
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </Field>

        <Field id="phone" label="الجوال" required hint="05xxxxxxxx" error={state.fieldErrors?.["phone"]}>
          <Input id="phone" name="phone" autoComplete="tel" latin numeric required />
        </Field>

        <Field id="email" label="البريد الإلكتروني" required error={state.fieldErrors?.["email"]}>
          <Input id="email" name="email" type="email" autoComplete="email" latin required />
        </Field>

        <Field id="password" label="كلمة المرور" required hint="٨ أحرف فأكثر" error={state.fieldErrors?.["password"]}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>

        <Field id="confirm" label="تأكيد كلمة المرور" required error={state.fieldErrors?.["confirm"]}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>

        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            أنشئ الحساب
          </Button>
        </FormActions>
      </form>

      <div className={styles.links}>
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>لديك حساب؟ ادخل</Link>
      </div>
    </>
  );
}
