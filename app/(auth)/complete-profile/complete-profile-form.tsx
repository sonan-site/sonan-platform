"use client";

import { useActionState } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import styles from "../layout.module.css";
import { completeProfile } from "./actions";

export function CompleteProfileForm({
  email,
  suggestedName,
  next,
}: {
  email: string;
  suggestedName: string;
  next: string;
}) {
  const [state, action, pending] = useActionState(completeProfile, EMPTY_FORM_STATE);

  return (
    <>
      <h1 className={styles.title}>أكمل حسابك</h1>
      <p className={styles.lede}>
        خطوة واحدة: اسمك كما تريد أن يظهر، وجوالك لتتواصل معك إدارة البرنامج.
      </p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}

      <form action={action}>
        <input type="hidden" name="next" value={next} />

        <Field id="email" label="البريد الإلكتروني">
          <Input id="email" value={email} readOnly latin />
        </Field>

        <Field id="fullName" label="الاسم الكامل" required error={state.fieldErrors?.["fullName"]}>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            defaultValue={suggestedName}
            required
            invalid={Boolean(state.fieldErrors?.["fullName"])}
          />
        </Field>

        <Field id="phone" label="الجوال" required hint="05xxxxxxxx" error={state.fieldErrors?.["phone"]}>
          <Input
            id="phone"
            name="phone"
            autoComplete="tel"
            latin
            numeric
            required
            invalid={Boolean(state.fieldErrors?.["phone"])}
          />
        </Field>

        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            احفظ وتابع
          </Button>
        </FormActions>
      </form>
    </>
  );
}
