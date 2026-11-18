import { now } from "@/lib/format";
import { isCountryCode, normalizePhone } from "@/lib/profile/phone";
import { z } from "@/lib/validation/z";

/**
 * بيانات الحساب — **الواحدة** لكل من يُكمل حسابه أو يعدّله.
 *
 * تُطبَّق في المتصفح تحسيناً للتجربة، وفي الخادم حجّةً. والقاعدة تفرض الصيغ
 * نفسها (الهجرة ٠٣٦)، فلا يصلها رقمٌ بغير الصيغة الدولية ولو تجاوز أحدٌ الشاشة.
 */

/**
 * جزء الاسم بالحروف العربية (adr/0062): حرفٌ عربيٌّ أولاً وآخراً، وبينهما حروفٌ عربية وتشكيلٌ ومسافةٌ
 * وشَرطة. والحروف العربية تشمل الممتدّة (ی ک ہ پ ٱ…) لمن يكتب بلوحة أردية أو فارسية — بلا الألف
 * الخنجرية (U+0670) فهي تشكيلٌ لا يبدأ به جزء.
 * نظيره `private.is_arabic_name` في القاعدة (الهجرة 20261118100000)، والتكافؤ في `arabic-name.db-test`.
 */
const LETTER = "\\u0621-\\u063A\\u0641-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5";
const MARK = "\\u064B-\\u065F\\u0670";
export const ARABIC_NAME = new RegExp(`^[${LETTER}](?:[${LETTER}${MARK} -]*[${LETTER}${MARK}])?$`);

export type NameParts = { firstName: string; fatherName: string; grandfatherName: string; familyName: string };

/** الجزء الغائب: فراغٌ أو مسافاتٌ عادية — كـ`btrim` في `private.name_part_ok`. */
const BLANK = /^ *$/;

/** أجزاء الاسم كلها بالعربية — من بقي اسمه بغيرها تظهر له نافذة التحديث. الغائب ليس شأنها. */
export function isArabicName(p: {
  first_name: string | null;
  father_name: string | null;
  grandfather_name: string | null;
  family_name: string | null;
}): boolean {
  return [p.first_name, p.father_name, p.grandfather_name, p.family_name].every(
    (part) => part === null || BLANK.test(part) || ARABIC_NAME.test(part),
  );
}

/**
 * تنظيف ما لا يُرى قبل الفحص: علامات الاتجاه والوصل (من النسخ من المحادثات ولوحة الفارسية)،
 * وأشكال العرض العربية إلى حروفها (`NFKC`)، والمسافات المتتابعة إلى واحدة.
 */
export function cleanNamePart(v: string): string {
  return v
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u061C\u2066-\u2069\u202A-\u202E\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** جزء اسم: الواحد لكل نموذج — الاستكمال و«حسابي» وتعديل الإدارة والنافذة والتسجيل في برنامج. */
export const namePart = (label: string) =>
  z
    .string()
    .transform(cleanNamePart)
    .pipe(
      z
        .string()
        .min(2, `${label} حرفان فأكثر`)
        .max(40, `${label} لا يزيد عن 40 حرفاً`)
        .regex(ARABIC_NAME, `${label} بالحروف العربية كما يُنطق`),
    );

/** أجزاء الاسم وحدها — لنافذة تحديث الاسم (adr/0062). */
export const nameSchema = z
  .object({
    firstName: namePart("الاسم الأول"),
    fatherName: namePart("اسم الأب"),
    grandfatherName: namePart("اسم الجد"),
    familyName: namePart("اسم العائلة"),
  })
  .transform((v) => ({
    first_name: v.firstName,
    father_name: v.fatherName,
    grandfather_name: v.grandfatherName,
    family_name: v.familyName,
  }));

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
    grandfatherName: namePart("اسم الجد"),
    familyName: namePart("اسم العائلة"),
    gender: z.enum(["male", "female"], { message: "اختر الجنس" }),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "اختر تاريخ الميلاد")
      .refine((v) => {
        const age = ageOn(new Date(`${v}T00:00:00Z`), now());
        return age >= 4 && age <= 100;
      }, "تاريخ الميلاد غير منطقي — العمر بين 4 و100 سنة"),
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
