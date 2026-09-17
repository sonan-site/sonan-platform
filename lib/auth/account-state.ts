/**
 * حالة الحساب من ملفه — وحدة نقيّة.
 *
 * **ثلاث لا اثنتان** (`adr/0025`): الحساب بلا ملفٍ، أو بملفٍ تنقصه بياناته، ليس
 * «موقوفاً» بل **ناقصاً** — يُستكمل مرة ثم يدخل. وخلطهما كان يعرض على صاحبه صفحة
 * إيقاف لم يستحقّها.
 *
 * **المكتمل** نظيرُ `fn_profile_is_complete` في القاعدة (الهجرة ٠٣٦)، واختبار
 * التكافؤ في `lib/auth/profile-details.db-test.ts` يُبقيهما متطابقين.
 */

import { TERMS_VERSION } from "@/lib/legal/terms";

export type AccountState = "active" | "suspended" | "incomplete";

export type ProfileCompleteness = {
  deleted_at: string | null;
  first_name: string | null;
  father_name: string | null;
  family_name: string | null;
  gender: string | null;
  birth_date: string | null;
  nationality: string | null;
  phone: string | null;
  /** نسخة الشروط التي وافق عليها — الاكتمال يشترط الحالية (الهجرة ٠٤٠). */
  terms_version: string | null;
};

/** الأعمدة التي تقرؤها الجلسة لتحكم بالاكتمال. */
export const COMPLETENESS_COLUMNS =
  "deleted_at, first_name, father_name, family_name, gender, birth_date, nationality, phone, terms_version";

const E164 = /^\+[1-9][0-9]{7,14}$/;

export function isProfileComplete(p: ProfileCompleteness): boolean {
  return Boolean(
    p.first_name &&
      p.father_name &&
      p.family_name &&
      p.gender &&
      p.birth_date &&
      p.nationality &&
      p.phone &&
      E164.test(p.phone) &&
      p.terms_version === TERMS_VERSION,
  );
}

export function accountState(profile: ProfileCompleteness | null): AccountState {
  if (!profile) return "incomplete";
  if (profile.deleted_at !== null) return "suspended";
  return isProfileComplete(profile) ? "active" : "incomplete";
}

/** الاسم الذي يقترحه مزوّد الدخول — Google يرسل `given_name` و`family_name` و`full_name`. */
export function suggestedName(metadata: Record<string, unknown> | undefined): {
  first: string;
  family: string;
} {
  const text = (key: string) => {
    const value = metadata?.[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const full = text("full_name") || text("name");
  return {
    first: text("given_name") || full.split(/\s+/)[0] || "",
    family: text("family_name") || (full.includes(" ") ? full.split(/\s+/).slice(-1)[0]! : ""),
  };
}
