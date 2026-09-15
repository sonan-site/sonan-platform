"use client";

import { useState } from "react";
import { COUNTRIES, DEFAULT_COUNTRY, formatPhone, normalizePhone, splitPhone } from "@/lib/profile/phone";
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
          <Input id="birthDate" name="birthDate" type="date" defaultValue={values.birthDate} latin required />
        </Field>
      </div>

      <Field id="nationality" label="الجنسية" required error={errors?.["nationality"]}>
        <Select id="nationality" name="nationality" defaultValue={values.nationality || DEFAULT_COUNTRY} required>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

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
        <Select
          aria-label={`مفتاح دولة ${label}`}
          name={countryName}
          value={country}
          onChange={(e) => setCountry(e.target.value as typeof country)}
          className={styles.dial}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.dial} {c.name}
            </option>
          ))}
        </Select>
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
          onBlur={(e) => check(e.currentTarget.value, country)}
        />
      </div>
      {preview ? <span className={styles.preview}>{preview}</span> : null}
    </Field>
  );
}
