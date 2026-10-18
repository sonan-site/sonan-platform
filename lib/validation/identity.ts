import { z } from "@/lib/validation/z";
import { isCountryCode, normalizePhone } from "@/lib/profile/phone";

/**
 * هوية المشارك (`adr/0047`) — رقم الهوية أو الإقامة أو الجواز وجوال وليّ الأمر.
 *
 * الرقم يُكتب بلوحة عربية كثيراً، فيُطبَّع لاتينياً قبل الحكم عليه. وكلاهما
 * اختياري هنا: الإلزام عند التسجيل في برنامجٍ يشترطهما، لا عند الحفظ.
 */

/**
 * رقم وثيقةٍ مفتوح بلا نوع (ملحق `adr/0047` · ١٨ أكتوبر): هوية أو إقامة أو جواز أو غيرها —
 * أرقامٌ وأحرف لاتينية كبيرة، من ٥ إلى ٢٠ خانة. توأم `chk_profile_identities_national_id`.
 */
const NATIONAL_ID = /^[A-Z0-9]{5,20}$/;

export const NATIONAL_ID_MESSAGE = "اكتب رقم وثيقتك كما هو فيها: أرقام وأحرف لاتينية، من ٥ إلى ٢٠ خانة";

export function isNationalId(v: string): boolean {
  return NATIONAL_ID.test(v);
}

/** «١٠٢٣…» و«1023 456 789» ← «1023456789»، و«a12-345» ← «A12345». */
export function normalizeNationalId(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

export const identitySchema = z
  .object({
    nationalId: z.string().trim().default(""),
    guardianPhoneCountry: z.string().default("SA"),
    guardianPhone: z.string().trim().default(""),
  })
  .transform((v, ctx) => {
    const nationalId = v.nationalId === "" ? null : normalizeNationalId(v.nationalId);
    if (nationalId !== null && !NATIONAL_ID.test(nationalId)) {
      ctx.addIssue({
        code: "custom",
        path: ["nationalId"],
        message: NATIONAL_ID_MESSAGE,
      });
      return z.NEVER;
    }

    let guardianPhone: string | null = null;
    if (v.guardianPhone !== "") {
      guardianPhone = isCountryCode(v.guardianPhoneCountry)
        ? normalizePhone(v.guardianPhone, v.guardianPhoneCountry)
        : null;
      if (!guardianPhone) {
        ctx.addIssue({ code: "custom", path: ["guardianPhone"], message: "جوال وليّ الأمر غير صحيح" });
        return z.NEVER;
      }
    }

    return { national_id: nationalId, guardian_phone: guardianPhone };
  });

export type IdentityRow = z.output<typeof identitySchema>;

export function identityInput(form: FormData) {
  const get = (key: string) => String(form.get(key) ?? "");
  return {
    nationalId: get("nationalId"),
    guardianPhoneCountry: get("guardianPhoneCountry") || "SA",
    guardianPhone: get("guardianPhone"),
  };
}

/** للإدارة: «1••••••23» — الرقم كاملاً لا يُعرض إلا لحامل `identities.read`. */
export function maskNationalId(id: string): string {
  return `${id.slice(0, 1)}••••••${id.slice(-2)}`;
}
