"use client";

import { useActionState } from "react";
import { Button, Field, FormActions, Input, Select } from "@/components/shared/form";
import { Messages, Muted, StepForm } from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { saveEligibility } from "./eligibility-actions";

export type Eligibility = {
  minAge: number | null;
  allowedGender: "male" | "female" | null;
  requireSaudiPhone: boolean;
  requireIdentity: boolean;
  registrationPrefix: string | null;
};

/**
 * شروط التسجيل (`adr/0047`): تُفرض في القاعدة عند التسجيل، وتُعرض للمسجِّل
 * موانعَ قبل النموذج. كلّها اختيارية — الفارغ بلا شرط.
 */
export function EligibilityForm({ programId, values }: { programId: string; values: Eligibility }) {
  const [state, action, pending] = useActionState(saveEligibility, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <details style={{ marginBlockEnd: "var(--space-8)" }}>
      <summary style={{ cursor: "pointer", fontWeight: "var(--weight-medium)" }}>شروط التسجيل ورقمه</summary>
      <StepForm title="شروط التسجيل" action={action} state={state}>
        <input type="hidden" name="programId" value={programId} />
        <Muted>يُرفض التسجيل المخالف في القاعدة، ويرى المسجِّل سببه قبل أن يملأ النموذج.</Muted>
        <Field id="minAge" label="أدنى عمر" hint="بالسنوات الكاملة يوم التسجيل — فارغ بلا حدّ" error={errors.minAge}>
          <Input
            id="minAge"
            name="minAge"
            inputMode="numeric"
            latin
            defaultValue={values.minAge ?? ""}
            invalid={Boolean(errors.minAge)}
          />
        </Field>
        <Field id="allowedGender" label="الجنس" error={errors.allowedGender}>
          <Select id="allowedGender" name="allowedGender" defaultValue={values.allowedGender ?? ""}>
            <option value="">الجميع</option>
            <option value="male">الذكور</option>
            <option value="female">الإناث</option>
          </Select>
        </Field>
        <Field id="requireSaudiPhone" label="جوالٌ سعودي" hint="يبدأ بـ05">
          <input
            id="requireSaudiPhone"
            name="requireSaudiPhone"
            type="checkbox"
            defaultChecked={values.requireSaudiPhone}
          />
        </Field>
        <Field
          id="requireIdentity"
          label="الهوية"
          hint="رقم الهوية أو الإقامة والاسم الرباعي، وجوال وليّ الأمر لمن دون 18"
        >
          <input id="requireIdentity" name="requireIdentity" type="checkbox" defaultChecked={values.requireIdentity} />
        </Field>
        <Field
          id="registrationPrefix"
          label="بادئة رقم التسجيل"
          hint="مثل SN-1448 — فيصير الرقم SN-1448-0001. فارغ = لا رقم يُعرض"
          error={errors.registrationPrefix}
        >
          <Input
            id="registrationPrefix"
            name="registrationPrefix"
            latin
            maxLength={20}
            defaultValue={values.registrationPrefix ?? ""}
            invalid={Boolean(errors.registrationPrefix)}
          />
        </Field>
        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            احفظ الشروط
          </Button>
        </FormActions>
        <Messages state={state} />
      </StepForm>
    </details>
  );
}
