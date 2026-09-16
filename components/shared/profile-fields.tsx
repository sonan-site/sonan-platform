"use client";

import { useState } from "react";
import { DEFAULT_COUNTRY, formatPhone, normalizePhone, splitPhone } from "@/lib/profile/phone";
import { CountrySelect } from "./country-select";
import { DateField } from "./date-field";
import { Field, Input, Select } from "./form";
import styles from "./profile-fields.module.css";

/**
 * حقول بيانات الحساب — **الواحدة** لصفحة «أكمل حسابك» و«حسابي».
 *
 * أسماء الحقول تطابق ما يقرؤه `profileFromForm` في `lib/validation/profile.ts`،
 * فالنموذجان يُرسلان الشكل نفسه ويُتحقَّق منهما بالقواعد نفسها.
 */

export type ProfileValues = {
  firstName: string;
  fatherName: string;
  grandfatherName: string;
  familyName: string;
  gender: "male" | "female" | "";
  birthDate: string;
  nationality: string;
  phone: string | null;
  phoneSecondary: string | null;
};

export function ProfileFields({
  values,
  errors,
}: {
  values: ProfileValues;
  errors?: Record<string, string>;
}) {
  return (
    <>
      <div className={styles.pair}>
        <Field id="firstName" label="الاسم الأول" required error={errors?.["firstName"]}>
          <Input id="firstName" name="firstName" defaultValue={values.firstName} autoComplete="given-name" required />
        </Field>
        <Field id="fatherName" label="اسم الأب" required error={errors?.["fatherName"]}>
          <Input id="fatherName" name="fatherName" defaultValue={values.fatherName} required />
        </Field>
      </div>
      <div className={styles.pair}>
        <Field id="grandfatherName" label="اسم الجد" hint="اختياري" error={errors?.["grandfatherName"]}>
          <Input id="grandfatherName" name="grandfatherName" defaultValue={values.grandfatherName} />
        </Field>
        <Field id="familyName" label="اسم العائلة" required error={errors?.["familyName"]}>
          <Input
            id="familyName"
            name="familyName"
            defaultValue={values.familyName}
            autoComplete="family-name"
            required
          />
        </Field>
      </div>

      <div className={styles.pair}>
        <Field id="gender" label="الجنس" required error={errors?.["gender"]}>
          <Select id="gender" name="gender" defaultValue={values.gender} required>
            <option value="" disabled>
              اختر
            </option>
            <option value="male">ذكر</option>
            <option value="female">أنثى</option>
          </Select>
        </Field>
        <Field id="birthDate" label="تاريخ الميلاد" required error={errors?.["birthDate"]}>
          <DateField
            id="birthDate"
            name="birthDate"
            defaultValue={values.birthDate}
            invalid={Boolean(errors?.["birthDate"])}
          />
        </Field>
      </div>

      <NationalityField value={values.nationality} error={errors?.["nationality"]} />

      <PhoneField
        id="phone"
        label="الجوال"
        required
        value={values.phone}
        error={errors?.["phone"]}
        countryName="phoneCountry"
      />
      <PhoneField
        id="phoneSecondary"
        label="رقم إضافي"
        hint="اختياري — رقم آخر لك"
        value={values.phoneSecondary}
        error={errors?.["phoneSecondary"]}
        countryName="phoneSecondaryCountry"
      />
    </>
  );
}

/** الجنسية — بالاسم كاملاً، من قائمة الدول نفسها. */
function NationalityField({ value, error }: { value: string; error?: string }) {
  const [country, setCountry] = useState(value || DEFAULT_COUNTRY);

  return (
    <Field id="nationality" label="الجنسية" required error={error}>
      <CountrySelect
        name="nationality"
        label="الجنسية"
        mode="name"
        value={country}
        onChange={setCountry}
        invalid={Boolean(error)}
      />
    </Field>
  );
}

/**
 * مفتاح الدولة ورقمها. **التصحيح يُعرض لا يُخفى:** عند مغادرة الخانة يظهر ما
 * سيُحفظ فعلاً، فمن كتب `0501234567` يرى `+966 50 123 4567` قبل أن يحفظ.
 */
function PhoneField({
  id,
  label,
  hint,
  required,
  value,
  error,
  countryName,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  value: string | null;
  error?: string;
  countryName: string;
}) {
  const initial = splitPhone(value);
  const [country, setCountry] = useState(initial.country);
  const [preview, setPreview] = useState<string | null>(null);

  const check = (raw: string, code: typeof country) => {
    if (!raw.trim()) return setPreview(null);
    const normalized = normalizePhone(raw, code);
    setPreview(normalized ? `سيُحفظ: ${formatPhone(normalized)}` : "الرقم غير مكتمل لهذه الدولة");
  };

  return (
    <Field id={id} label={label} required={required} hint={hint} error={error}>
      <div className={styles.phone}>
        <Input
          id={id}
          name={id}
          type="tel"
          inputMode="tel"
          autoComplete={required ? "tel" : "off"}
          defaultValue={initial.national}
          placeholder="5xxxxxxxx"
          latin
          required={required}
          invalid={Boolean(error)}
          onBlur={(e) => check(e.currentTarget.value, country)}
        />
        <CountrySelect
          name={countryName}
          label={`مفتاح دولة ${label}`}
          value={country}
          onChange={(code) => setCountry(code as typeof country)}
        />
      </div>
      {preview ? <span className={styles.preview}>{preview}</span> : null}
    </Field>
  );
}
