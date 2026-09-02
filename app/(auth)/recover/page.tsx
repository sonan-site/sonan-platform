"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import styles from "../layout.module.css";
import { requestRecovery } from "./actions";

export default function RecoverPage() {
  const [state, action, pending] = useActionState(requestRecovery, EMPTY_FORM_STATE);

  return (
    <>
      <h1 className={styles.title}>استرجاع كلمة المرور</h1>
      <p className={styles.lede}>أدخل بريدك وسنرسل لك رابط تعيين كلمة مرور جديدة.</p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}
      {state.notice ? <p className={styles.notice}>{state.notice}</p> : null}

      <form action={action}>
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

        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            أرسل الرابط
          </Button>
        </FormActions>
      </form>

      <div className={styles.links}>
        <Link href="/sign-in">العودة لتسجيل الدخول</Link>
      </div>
    </>
  );
}
