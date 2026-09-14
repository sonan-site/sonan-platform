import { z } from "@/lib/validation/z";
import { kindIsScored, PROGRAM_KIND_CODES } from "@/lib/programs/kinds";

/** مخططات البرامج والأقسام والمسارات — الخادم هو الحجّة. */

export const sectionSchema = z.object({
  name: z.string().trim().min(2, "اسم القسم مطلوب"),
  parentId: z.uuid().nullable().default(null),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "الرابط بحروف لاتينية صغيرة وأرقام وشرطات فقط");

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "تاريخ غير صالح");

export const programSchema = z
  .object({
    sectionId: z.uuid("اختر قسماً"),
    name: z.string().trim().min(3, "اسم البرنامج مطلوب"),
    summary: z.string().trim().default(""),
    slug,
    kind: z.enum(PROGRAM_KIND_CODES),
    participantLabel: z.string().trim().min(2, "مسمّى المشارك مطلوب"),
    capacity: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .nullable()
      .refine((v) => v === null || (Number.isInteger(v) && v > 0), "السعة عدد صحيح موجب"),
    registrationOpensAt: optionalDate,
    registrationClosesAt: optionalDate,
    // العتبتان تُقبلان فارغتين هنا، والنمط يحسم إلزامهما أدناه.
    passingPercentage: z.coerce.number().min(0).max(100).nullable().default(null),
    awardPercentage: z.coerce.number().min(0).max(100).nullable().default(null),
  })
  .refine(
    (v) =>
      !v.registrationOpensAt ||
      !v.registrationClosesAt ||
      new Date(v.registrationClosesAt) > new Date(v.registrationOpensAt),
    { message: "تاريخ الإغلاق يجب أن يلي تاريخ الفتح", path: ["registrationClosesAt"] },
  )
  /**
   * العتبتان تتبعان النمط `[BR-KIND-01]`.
   *
   * التطبيع لا الرفض في الاتجاه الواحد: النمط غير التنافسي يُفرَّغ عتبتيه
   * ولو أُرسلتا — فالحقلان مخفيّان في الشاشة، ووصولهما يعني نموذجاً بائتاً
   * لا نيّة. والتنافسي يُلزَم بهما، وذاك خطأ مستخدم يُقال.
   */
  .transform((v) =>
    kindIsScored(v.kind)
      ? v
      : { ...v, passingPercentage: null, awardPercentage: null },
  )
  .superRefine((v, ctx) => {
    if (!kindIsScored(v.kind)) return;
    for (const key of ["passingPercentage", "awardPercentage"] as const) {
      if (v[key] === null) {
        ctx.addIssue({ code: "custom", path: [key], message: "مطلوبة لبرنامج المسابقة" });
      }
    }
  });

export const trackSchema = z.object({
  programId: z.uuid(),
  name: z.string().trim().min(2, "اسم المسار مطلوب"),
  description: z.string().trim().default(""),
  capacity: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .nullable()
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), "السعة عدد صحيح موجب"),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
