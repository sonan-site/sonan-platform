"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { ProfileFields, type ProfileValues } from "@/components/shared/profile-fields";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import styles from "../layout.module.css";
import { completeProfile } from "./actions";
import { ActionForm } from "@/components/shared/action-form";

export function CompleteProfileForm({
  email,
  values,
  next,
}: {
  email: string;
  values: ProfileValues;
  next: string;
}) {
  const [state, action, pending] = useActionState(completeProfile, EMPTY_FORM_STATE);

  return (
    <>
      <h1 className={styles.title}>أكمل حسابك</h1>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}

      <ActionForm action={action} state={state}>
        <input type="hidden" name="next" value={next} />

        <Field id="email" label="البريد الإلكتروني">
          <Input id="email" value={email} readOnly latin />
        </Field>

        <ProfileFields values={values} errors={state.fieldErrors} />

        <div className={styles.consent}>
          <label htmlFor="acceptTerms" className={styles.consentLabel}>
            <input
              id="acceptTerms"
              name="acceptTerms"
              type="checkbox"
              required
              aria-invalid={Boolean(state.fieldErrors?.["acceptTerms"]) || undefined}
              aria-describedby={state.fieldErrors?.["acceptTerms"] ? "acceptTerms-error" : undefined}
            />
            <span>
              قرأتُ{" "}
              <Link href="/terms" target="_blank">
                شروط الاستخدام
              </Link>{" "}
              و
              <Link href="/privacy" target="_blank">
                سياسة الخصوصية
              </Link>{" "}
              وأوافق عليهما.
            </span>
          </label>
          {state.fieldErrors?.["acceptTerms"] ? (
            <span id="acceptTerms-error" className={styles.consentError} role="alert">
              {state.fieldErrors["acceptTerms"]}
            </span>
          ) : null}
        </div>

        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            ابدأ
          </Button>
        </FormActions>
      </ActionForm>
    </>
  );
}
