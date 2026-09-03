"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DEFAULT_LANDING } from "@/lib/auth/safe-next";
import { Suspense, useActionState } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import styles from "../layout.module.css";
import { signIn } from "./actions";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(signIn, EMPTY_FORM_STATE);

  return (
    <>
      <h1 className={styles.title}>تسجيل الدخول</h1>
      <p className={styles.lede}>ادخل ببريدك وكلمة مرورك.</p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}

      <form action={action}>
        <input type="hidden" name="next" value={params.get("next") ?? DEFAULT_LANDING} />

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
          <Input
            id="password"
            name="password"
            type="password"
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
      </form>

      <div className={styles.links}>
        <Link href="/recover">نسيت كلمة المرور</Link>
      </div>
    </>
  );
}
