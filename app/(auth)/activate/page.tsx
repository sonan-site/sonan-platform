"use client";

import { useActionState } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation/auth";
import styles from "../layout.module.css";
import { setPassword } from "./actions";

export default function ActivatePage() {
  const [state, action, pending] = useActionState(setPassword, EMPTY_FORM_STATE);

  return (
    <>
      <h1 className={styles.title}>تعيين كلمة المرور</h1>
      <p className={styles.lede}>اختر كلمة مرور جديدة لحسابك.</p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}

      <form action={action}>
        <Field
          id="password"
          label="كلمة المرور"
          required
          hint={`${MIN_PASSWORD_LENGTH} محارف على الأقل`}
          error={state.fieldErrors?.["password"]}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            invalid={Boolean(state.fieldErrors?.["password"])}
          />
        </Field>

        <Field id="confirm" label="تأكيد كلمة المرور" required error={state.fieldErrors?.["confirm"]}>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            invalid={Boolean(state.fieldErrors?.["confirm"])}
          />
        </Field>

        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            حفظ ودخول
          </Button>
        </FormActions>
      </form>
    </>
  );
}
