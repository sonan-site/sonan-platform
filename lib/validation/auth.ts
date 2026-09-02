import { z } from "zod";

/**
 * مخططات التحقّق — **يُستهلَك في الخادم إلزاماً**.
 * `platform.md §٤`: «الخادم هو الحجّة، والواجهة تحسين تجربة».
 */

/**
 * ثمانية محارف حدّاً أدنى. Supabase يقبل ستة، ونشدّد:
 * المنصة تحمل بيانات مشاركين، وستة محارف رقم لا كلمة سرّ.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const emailSchema = z
  .email({ message: "بريد إلكتروني غير صالح" })
  .transform((value) => value.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `كلمة المرور ${MIN_PASSWORD_LENGTH} محارف على الأقل`);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const recoverySchema = z.object({ email: emailSchema });

export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "الكلمتان غير متطابقتين",
    path: ["confirm"],
  });

export const inviteSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(3, "الاسم مطلوب"),
  /** يُخزَّن بصيغة موحّدة. الإدخال لاتيني (§١١.١). */
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+9665|05)\d{8}$/, "رقم جوال سعودي غير صالح (05xxxxxxxx)")
    .transform((v) => (v.startsWith("05") ? `+966${v.slice(1)}` : v)),
});

export const assignRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
  scopeProgramId: z.uuid().nullable().default(null),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
