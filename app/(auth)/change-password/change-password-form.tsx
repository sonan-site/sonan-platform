"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Button, Field, FormActions } from "@/components/shared/form";
import { PasswordInput } from "@/components/shared/password-input";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation/auth";
import styles from "../layout.module.css";
import { changeTempPassword } from "./actions";

export function ChangePasswordForm({ email, next }: { email: string; next: string }) {
  const [state, action, pending] = useActionState(changeTempPassword, EMPTY_FORM_STATE);

  return (
    <>
      <h1 className={styles.title}>اكتب كلمة مرورك الجديدة</h1>
      <p className={styles.lede}>
        دخلتَ بكلمة مؤقتة أرسلها لك المشرف. اختر الآن كلمةً تعرفها وحدك لحسابك{" "}
        <span dir="ltr">{email}</span>، وبها تدخل بعد اليوم.
      </p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}

      <ActionForm action={action} state={state}>
        <input type="hidden" name="next" value={next} />
        <Field
          id="password"
          label="كلمة المرور الجديدة"
          required
          hint={`${MIN_PASSWORD_LENGTH} محارف على الأقل، وغير الكلمة المؤقتة`}
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
            حفظ ومتابعة
          </Button>
        </FormActions>
      </ActionForm>
    </>
  );
}
