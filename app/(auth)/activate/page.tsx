"use client";

import { useActionState } from "react";
import { Button, Field, FormActions } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation/auth";
import styles from "../layout.module.css";
import { setPassword } from "./actions";
import { ActionForm } from "@/components/shared/action-form";
import { PasswordInput } from "@/components/shared/password-input";

export default function ActivatePage() {
  const [state, action, pending] = useActionState(setPassword, EMPTY_FORM_STATE);

  return (
    <>
      <h1 className={styles.title}>تعيين كلمة المرور</h1>
      <p className={styles.lede}>اختر كلمة مرور جديدة لحسابك.</p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}

      <ActionForm action={action} state={state}>
        <Field
          id="password"
          label="كلمة المرور"
          required
          hint={`${MIN_PASSWORD_LENGTH} محارف على الأقل`}
          error={state.fieldErrors?.["password"]}
        >
          <PasswordInput
            id="password"
            name="password"
           
            autoComplete="new-password"
            required
            invalid={Boolean(state.fieldErrors?.["password"])}
          />
        </Field>

        <Field id="confirm" label="تأكيد كلمة المرور" required error={state.fieldErrors?.["confirm"]}>
          <PasswordInput
            id="confirm"
            name="confirm"
           
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
      </ActionForm>
    </>
  );
}
