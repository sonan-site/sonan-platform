"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { GoogleButton } from "@/components/shared/google-button";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/db/browser";
import { signUpSchema } from "@/lib/validation/auth";
import styles from "../layout.module.css";
import { ActionForm } from "@/components/shared/action-form";

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
 * يوم الإعلان. والبيانات الشخصية لا تُطلب هنا: الجلسة تجد الحساب ناقصاً فتحوّله
 * إلى «أكمل حسابك» — النموذج الواحد لكل الحسابات (الهجرة ٠٣٦).
 */
function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    const parsed = signUpSchema.safeParse({
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
      <p className={styles.lede}>
        حسابٌ واحد تسجّل به في برامج الجمعية وتتابع رحلتك. بعده خطوة واحدة لبياناتك.
      </p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}
      {state.notice ? <p className={styles.notice}>{state.notice}</p> : null}

      <GoogleButton next={next} />

      <ActionForm action={submit} state={state}>
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
      </ActionForm>

      <div className={styles.links}>
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>لديك حساب؟ ادخل</Link>
      </div>
    </>
  );
}
