import { z } from "@/lib/validation/z";

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

/**
 * الدعوة: البريد، والاسم للعرض في قائمة المستخدمين حتى يستكمل المدعوّ بياناته.
 * البيانات الكاملة (الاسم الرباعي، الجوال، …) يكتبها صاحبها في «أكمل حسابك».
 */
export const inviteSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(3, "الاسم مطلوب"),
});

/**
 * إنشاء الزائر حسابه بنفسه: البريد وكلمة المرور وحدهما. البيانات الشخصية تُطلب
 * بعده مباشرة في «أكمل حسابك» — النموذج الواحد لكل الحسابات.
 */
export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "الكلمتان غير متطابقتين",
    path: ["confirm"],
  });

export const assignRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
  scopeProgramId: z.uuid().nullable().default(null),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
