import { z } from "zod";

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
    kind: z.enum(["competition", "weekly_followup", "remote_memorization"]),
    participantLabel: z.string().trim().min(2, "مسمّى المشارك مطلوب"),
    capacity: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .nullable()
      .refine((v) => v === null || (Number.isInteger(v) && v > 0), "السعة عدد صحيح موجب"),
    registrationOpensAt: optionalDate,
    registrationClosesAt: optionalDate,
    passingPercentage: z.coerce.number().min(0).max(100).default(80),
    awardPercentage: z.coerce.number().min(0).max(100).default(90),
  })
  .refine(
    (v) =>
      !v.registrationOpensAt ||
      !v.registrationClosesAt ||
      new Date(v.registrationClosesAt) > new Date(v.registrationOpensAt),
    { message: "تاريخ الإغلاق يجب أن يلي تاريخ الفتح", path: ["registrationClosesAt"] },
  );

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
