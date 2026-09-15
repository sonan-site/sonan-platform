import { now } from "@/lib/format";
import { isCountryCode, normalizePhone } from "@/lib/profile/phone";
import { z } from "@/lib/validation/z";

/**
 * بيانات الحساب — **الواحدة** لكل من يُكمل حسابه أو يعدّله.
 *
 * تُطبَّق في المتصفح تحسيناً للتجربة، وفي الخادم حجّةً. والقاعدة تفرض الصيغ
 * نفسها (الهجرة ٠٣٦)، فلا يصلها رقمٌ بغير الصيغة الدولية ولو تجاوز أحدٌ الشاشة.
 */

const NAME = /^[\p{L}][\p{L}\p{M}' -]*$/u;

const namePart = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} حرفان فأكثر`)
    .max(40, `${label} لا يزيد عن ٤٠ حرفاً`)
    .regex(NAME, `${label} بالحروف فقط`);

const optionalNamePart = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine((v) => v === null || (v.length >= 2 && v.length <= 40 && NAME.test(v)), `${label} بالحروف فقط`);

function ageOn(birth: Date, at: Date): number {
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < birth.getUTCMonth() ||
    (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const profileSchema = z
  .object({
    firstName: namePart("الاسم الأول"),
    fatherName: namePart("اسم الأب"),
    grandfatherName: optionalNamePart("اسم الجد"),
    familyName: namePart("اسم العائلة"),
    gender: z.enum(["male", "female"], { message: "اختر الجنس" }),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "اختر تاريخ الميلاد")
      .refine((v) => {
        const age = ageOn(new Date(`${v}T00:00:00Z`), now());
        return age >= 4 && age <= 100;
      }, "تاريخ الميلاد غير منطقي — العمر بين ٤ و١٠٠ سنة"),
    nationality: z.string().refine(isCountryCode, "اختر الجنسية"),
    phoneCountry: z.string().refine(isCountryCode, "اختر مفتاح الدولة"),
    phone: z.string().trim().min(1, "الجوال مطلوب"),
    phoneSecondaryCountry: z.string().default("SA"),
    phoneSecondary: z.string().trim().default(""),
  })
  .transform((v, ctx) => {
    const phone = isCountryCode(v.phoneCountry) ? normalizePhone(v.phone, v.phoneCountry) : null;
    if (!phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "رقم الجوال غير صحيح لهذه الدولة" });
      return z.NEVER;
    }

    let phoneSecondary: string | null = null;
    if (v.phoneSecondary !== "") {
      phoneSecondary = isCountryCode(v.phoneSecondaryCountry)
        ? normalizePhone(v.phoneSecondary, v.phoneSecondaryCountry)
        : null;
      if (!phoneSecondary) {
        ctx.addIssue({ code: "custom", path: ["phoneSecondary"], message: "الرقم الإضافي غير صحيح" });
        return z.NEVER;
      }
      if (phoneSecondary === phone) {
        ctx.addIssue({
          code: "custom",
          path: ["phoneSecondary"],
          message: "الرقم الإضافي هو نفسه الجوال — اتركه فارغاً أو اكتب رقماً آخر",
        });
        return z.NEVER;
      }
    }

    return {
      first_name: v.firstName,
      father_name: v.fatherName,
      grandfather_name: v.grandfatherName,
      family_name: v.familyName,
      gender: v.gender,
      birth_date: v.birthDate,
      nationality: v.nationality,
      phone,
      phone_secondary: phoneSecondary,
    };
  });

export type ProfileRow = z.output<typeof profileSchema>;

/** يقرأ حقول النموذج بأسمائها — مشترك بين الاستكمال و«حسابي». التحقّق عند المستدعي. */
export function profileInput(form: FormData) {
  const get = (key: string) => String(form.get(key) ?? "");
  return {
    firstName: get("firstName"),
    fatherName: get("fatherName"),
    grandfatherName: get("grandfatherName"),
    familyName: get("familyName"),
    gender: get("gender"),
    birthDate: get("birthDate"),
    nationality: get("nationality"),
    phoneCountry: get("phoneCountry"),
    phone: get("phone"),
    phoneSecondaryCountry: get("phoneSecondaryCountry") || "SA",
    phoneSecondary: get("phoneSecondary"),
  };
}
