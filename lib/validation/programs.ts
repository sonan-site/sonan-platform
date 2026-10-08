import { z } from "@/lib/validation/z";
import { kindIsScored, PROGRAM_KIND_CODES } from "@/lib/programs/kinds";
import { riyadhDayEnd, riyadhDayStart } from "@/lib/format";

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

/**
 * نافذة التسجيل تُدخَل أياماً: الفتح أول يومه والإغلاق آخر يومه، بتوقيت الرياض.
 * والقيمة التي تحمل وقتاً تمرّ كما هي.
 */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const windowEdge = (edge: "start" | "end") =>
  optionalDate.transform((v) =>
    v === null || !DAY_ONLY.test(v) ? v : edge === "start" ? riyadhDayStart(v) : riyadhDayEnd(v),
  );

export const programSchema = z
  .object({
    sectionId: z.uuid("اختر قسماً"),
    name: z.string().trim().min(3, "اسم البرنامج مطلوب"),
    summary: z.string().trim().default(""),
    slug,
    kind: z.enum(PROGRAM_KIND_CODES),
    participantLabel: z.string().trim().min(2, "مسمّى المشارك مطلوب"),
    // جهة تواصل إدارة البرنامج — تظهر للمشارك حين يعترضه ما لا يحلّه بنفسه.
    contact: z.string().trim().max(200, "جهة التواصل لا تزيد عن 200 حرف").default(""),
    capacity: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .nullable()
      .refine((v) => v === null || (Number.isInteger(v) && v > 0), "السعة عدد صحيح موجب"),
    registrationOpensAt: windowEdge("start"),
    registrationClosesAt: windowEdge("end"),
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
  // ولا `sortOrder` هنا: الترتيب يُحسب عند الإنشاء ويُغيَّر بالسهمين، ولا يُكتب
  // رقماً بيد — وهي الخانة التي أنتجت مساريْن برقمٍ واحد.
});

/** موعدٌ في مواعيد البرنامج (`adr/0044`) — يومٌ أو مدى أيام، بصيغة الإدخال. */
const day = z.string().trim().regex(DAY_ONLY, "اختر اليوم من التقويم");

export const scheduleEntrySchema = z
  .object({
    programId: z.uuid(),
    title: z.string().trim().min(2, "عنوان الموعد مطلوب").max(60, "العنوان لا يزيد عن 60 حرفاً"),
    startsOn: day,
    endsOn: z
      .union([day, z.literal("")])
      .transform((v) => (v === "" ? null : v)),
    note: z.string().trim().max(160, "الملاحظة لا تزيد عن 160 حرفاً").default(""),
  })
  .refine((v) => v.endsOn === null || v.endsOn >= v.startsOn, {
    message: "النهاية لا تسبق البداية",
    path: ["endsOn"],
  });

/** تعديل موعدٍ قائم — الحقول نفسها ومعرّفه. */
export const scheduleEntryUpdateSchema = scheduleEntrySchema.and(z.object({ entryId: z.uuid() }));

/**
 * نافذة التسجيل وحدها — تُعدَّل من مواعيد البرنامج أيضاً (موعد التسجيل
 * مشتقٌّ منها)، بحدَّي يوم الرياض كنموذج البرنامج.
 */
export const registrationWindowSchema = z
  .object({
    programId: z.uuid(),
    registrationOpensAt: windowEdge("start"),
    registrationClosesAt: windowEdge("end"),
  })
  .refine(
    (v) =>
      !v.registrationOpensAt ||
      !v.registrationClosesAt ||
      new Date(v.registrationClosesAt) > new Date(v.registrationOpensAt),
    { message: "تاريخ الإغلاق يجب أن يلي تاريخ الفتح", path: ["registrationClosesAt"] },
  );

/** أهلية البرنامج ورقم التسجيل (`adr/0047`) — كلّها اختيارية، والفارغ بلا شرط. */
export const eligibilitySchema = z.object({
  programId: z.uuid(),
  minAge: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .nullable()
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 100), "العمر عددٌ صحيح بين 1 و100"),
  allowedGender: z
    .enum(["", "male", "female"])
    .transform((v) => (v === "" ? null : v)),
  requireSaudiPhone: z.boolean(),
  requireIdentity: z.boolean(),
  registrationPrefix: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine((v) => v === null || /^[A-Za-z0-9-]{1,20}$/.test(v), "حروفٌ لاتينية وأرقام وشرطات، حتى 20"),
});
