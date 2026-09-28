"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { GoogleButton } from "@/components/shared/google-button";
import { PasswordInput } from "@/components/shared/password-input";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { DEFAULT_LANDING } from "@/lib/auth/safe-next";
import { signIn } from "../sign-in/actions";
import styles from "../layout.module.css";

/**
 * بوابة الإدارة — **بابٌ ثانٍ للحساب نفسه** (`adr/0032`).
 *
 * لا حساب يُنشأ من هنا: عضو الإدارة يُدعى فيصله رابطٌ يضبط به كلمته. والدخول
 * منها يكتب **وضع الإدارة** للجلسة، فيرى شاشات العمل لا رحلة المشارك.
 */
export default function AdminGatePage() {
  return (
    <Suspense fallback={null}>
      <AdminGateForm />
    </Suspense>
  );
}

function AdminGateForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(signIn, EMPTY_FORM_STATE);
  const next = params.get("next") ?? DEFAULT_LANDING;

  return (
    <>
      <h1 className={styles.title}>بوابة الدخول للإدارة</h1>
      <p className={styles.lede}>للعاملين في المنصة. يدخل العضو بالبريد الذي دُعي به.</p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}

      <GoogleButton next={next} mode="staff" />

      <ActionForm action={action} state={state}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value="staff" />

        <Field id="email" label="البريد الإلكتروني" required error={state.fieldErrors?.["email"]}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            latin
            required
            invalid={Boolean(state.fieldErrors?.["email"])}
          />
        </Field>

        <Field id="password" label="كلمة المرور" required error={state.fieldErrors?.["password"]}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            invalid={Boolean(state.fieldErrors?.["password"])}
          />
        </Field>

        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            دخول
          </Button>
        </FormActions>
      </ActionForm>

      <div className={styles.links}>
        <Link href="/recover">نسيت كلمة المرور</Link>
        <Link href="/sign-in">لست من الإدارة؟ ادخل من بوابة المشاركين</Link>
      </div>
    </>
  );
}
