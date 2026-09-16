"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/shared/modal";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { GoogleButton } from "@/components/shared/google-button";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/db/browser";
import { signUpSchema } from "@/lib/validation/auth";
import styles from "../layout.module.css";
import { ActionForm } from "@/components/shared/action-form";
import { PasswordInput } from "@/components/shared/password-input";

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
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [waitedLong, setWaitedLong] = useState(false);
  const [pending, startTransition] = useTransition();

  /**
   * **مخرجٌ لمن لن تصله رسالة:** البريد المسجَّل سلفاً يُردّ عليه ردّاً مموّهاً
   * كالجديد تماماً (لئلا تكشف الصفحة من له حساب)، فلا تُرسَل له رسالة. فبعد
   * مهلة يظهر له طريق الدخول والاسترجاع — دون أن يُقال له إن البريد مسجَّل.
   */
  useEffect(() => {
    if (!awaitingEmail) return;
    const timer = window.setTimeout(() => setWaitedLong(true), 15000);
    return () => window.clearTimeout(timer);
  }, [awaitingEmail]);

  /**
   * **الانتظار لا يقف:** رابط التأكيد يُفتح في تبويب آخر، وجلسته تُكتب في
   * الكوكيز نفسها. فتسأل هذه الصفحة عن الجلسة كل خمس ثوانٍ، وحين تجدها تنتقل
   * وحدها — فلا يبقى المسجِّل أمام شاشةٍ لا تتغيّر.
   */
  useEffect(() => {
    if (!awaitingEmail) return;
    const db = createClient();
    const timer = window.setInterval(async () => {
      const { data } = await db.auth.getSession();
      if (data.session) {
        window.clearInterval(timer);
        router.replace(next);
        router.refresh();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [awaitingEmail, next, router]);

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
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
        },
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
        setAwaitingEmail(true);
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

      <Modal open={awaitingEmail} title="أُنشئ حسابك">
        <p className={styles.modalText}>
          أرسلنا رسالة إلى بريدك فيها رابط التأكيد. افتح الرسالة واضغط الرابط، وتنتقل هذه الصفحة
          وحدها إلى حسابك. وإن لم تجد الرسالة فانظر في «غير المرغوب فيه».
        </p>
        {waitedLong ? (
          <p className={styles.modalText}>
            لم تصلك رسالة؟ قد يكون لك حساب بهذا البريد.{" "}
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>ادخل</Link> أو{" "}
            <Link href="/recover">استرجع كلمة المرور</Link>.
          </p>
        ) : null}
      </Modal>

      <GoogleButton next={next} />

      <ActionForm action={submit} state={state}>
        <Field id="email" label="البريد الإلكتروني" required error={state.fieldErrors?.["email"]}>
          <Input id="email" name="email" type="email" autoComplete="email" latin required />
        </Field>

        <Field id="password" label="كلمة المرور" required hint="٨ أحرف فأكثر" error={state.fieldErrors?.["password"]}>
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
        </Field>

        <Field id="confirm" label="تأكيد كلمة المرور" required error={state.fieldErrors?.["confirm"]}>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
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
