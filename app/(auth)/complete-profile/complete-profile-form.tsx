"use client";

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
      <p className={styles.lede}>
        تُطلب مرة واحدة: اسمك كما في هويّتك، وجوالك لتتواصل معك إدارة البرنامج، وبيانات تبني عليها
        البرامج شروطها.
      </p>

      {state.error ? <p className={styles.alert}>{state.error}</p> : null}

      <ActionForm action={action} state={state}>
        <input type="hidden" name="next" value={next} />

        <Field id="email" label="البريد الإلكتروني">
          <Input id="email" value={email} readOnly latin />
        </Field>

        <ProfileFields values={values} errors={state.fieldErrors} />

        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            احفظ وتابع
          </Button>
        </FormActions>
      </ActionForm>
    </>
  );
}
