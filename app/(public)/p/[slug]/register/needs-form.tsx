"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { RegisterSteps } from "@/components/shared/register-steps";
import { Field, Input } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { completeForRegistration } from "./actions";
import styles from "./register.module.css";

export type NeedCode = "saudi_phone" | "grandfather_name" | "national_id" | "guardian_phone";

/**
 * «بياناتك لهذه المسابقة» (رحلة التسجيل ت٦): ما تطلبه المسابقة ولم يُكتب بعد، في صفحة
 * التسجيل نفسها — لا إحالةٌ إلى «حسابي» يضيع بعدها الطالب.
 */
export function NeedsForm({
  programName,
  slug,
  track,
  needs,
}: {
  programName: string;
  slug: string;
  track: string;
  needs: NeedCode[];
}) {
  const [state, action, pending] = useActionState(completeForRegistration, EMPTY_FORM_STATE);
  const err = (k: string) => state.fieldErrors?.[k];
  const has = (c: NeedCode) => needs.includes(c);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{programName}</p>
        <h1 className={styles.title}>التسجيل</h1>
        <p className={styles.lede}>تطلب هذه المسابقة بياناتٍ لم تُكتب في حسابك بعد. اكتبها هنا مرةً واحدة، ثم تختار مسارك.</p>
      </header>

      <RegisterSteps done={1} />

      <ActionForm action={action} state={state} className={styles.form}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="track" value={track} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>بياناتك لهذه المسابقة</h2>

          {has("grandfather_name") ? (
            <Field id="grandfatherName" label="اسم الجد" required hint="المسابقة تطلب الاسم الرباعي" error={err("grandfatherName")}>
              <Input id="grandfatherName" name="grandfatherName" required invalid={Boolean(err("grandfatherName"))} aria-describedby={err("grandfatherName") ? "grandfatherName-error" : undefined} />
            </Field>
          ) : null}

          {has("saudi_phone") ? (
            <Field id="phone" label="جوالك السعودي" required error={err("phone")}>
              <Input id="phone" name="phone" required inputMode="tel" placeholder="05xxxxxxxx" latin invalid={Boolean(err("phone"))} aria-describedby={err("phone") ? "phone-error" : undefined} />
            </Field>
          ) : null}

          {has("national_id") ? (
            <>
            <Field id="nationalId" label="رقم الهوية أو الإقامة" required hint="لا يُغيَّر بعد حفظه — تأكّد منه" error={err("nationalId")}>
              <Input id="nationalId" name="nationalId" required inputMode="numeric" latin autoComplete="off" invalid={Boolean(err("nationalId"))} aria-describedby={err("nationalId") ? "nationalId-error" : undefined} />
            </Field>
            <Field id="nationalIdConfirm" label="أعد كتابة رقم الهوية" required error={err("nationalIdConfirm")}>
              <Input id="nationalIdConfirm" name="nationalIdConfirm" required inputMode="numeric" latin autoComplete="off" invalid={Boolean(err("nationalIdConfirm"))} aria-describedby={err("nationalIdConfirm") ? "nationalIdConfirm-error" : undefined} />
            </Field>
            </>
          ) : null}

          {has("guardian_phone") ? (
            <Field id="guardianPhone" label="جوال وليّ أمرك" required hint="مطلوبٌ لمن دون 18 سنة" error={err("guardianPhone")}>
              <Input id="guardianPhone" name="guardianPhone" required inputMode="tel" placeholder="05xxxxxxxx" latin invalid={Boolean(err("guardianPhone"))} aria-describedby={err("guardianPhone") ? "guardianPhone-error" : undefined} />
            </Field>
          ) : null}
        </section>

        {state.error ? (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        ) : null}

        <button type="submit" className={styles.submit} disabled={pending} aria-busy={pending}>
          {pending ? "يُحفظ…" : "احفظ وتابع إلى مسارك"}
        </button>
      </ActionForm>
    </div>
  );
}
