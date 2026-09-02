import type { PermissionCode } from "../../config/permissions";

/**
 * الفاحص رباعي الطبقات.
 *
 * `platform.md §٧`: «الفحص رباعي الطبقات مرتّباً: مصادقة ← صلاحية ← نطاق ← حالة
 * — **ولا تُدمج طبقتان في شرط**».
 *
 * لماذا لا تُدمج: شرط واحد يجمع الأربعة يخفي **أيّها** رفض. فالمستخدم يرى
 * «ممنوع» بلا سبب، والمطوّر يشخّص بالتخمين، والتدقيق يسجّل رفضاً بلا علّة.
 * هنا كل طبقة تُقيَّم وحدها وتعيد اسمها عند الرفض.
 *
 * هذه الوحدة **نقيّة**: لا تعرف Supabase ولا الشبكة. تستقبل فاحصاً وتُنفّذ
 * الترتيب — فتُختبَر بلا قاعدة، والقاعدة تُختبَر في القاعدة.
 */

export const AUTHZ_STAGES = ["auth", "permission", "scope", "state"] as const;
export type AuthzStage = (typeof AUTHZ_STAGES)[number];

export type AuthzResult =
  | { ok: true; userId: string }
  | { ok: false; stage: AuthzStage; message: string };

/** ما تحتاجه الطبقات من العالم الخارجي. يُمرَّر حقيقياً في الإنتاج، ومزيَّفاً في الاختبار. */
export type AuthzChecker = {
  /** المستخدم الحالي، أو null إن لم يكن مصادَقاً عليه. */
  currentUserId: () => Promise<string | null>;
  /** هل يملك المستدعي هذا الرمز في هذا النطاق؟ */
  hasPermission: (code: PermissionCode, programId: string | null) => Promise<boolean>;
};

export type AuthzInput = {
  permission: PermissionCode;
  /** النطاق المطلوب التصريح فيه. null = نطاق عام على المنصة. */
  programId?: string | null;
  /**
   * نطاق المورد الفعلي محلّ الفعل، إن كان الفعل يقع على مورد بعينه.
   * الطبقة الثالثة تتحقّق أنه يطابق النطاق المصرَّح به — فلا يُستخدم تصريحٌ
   * في برنامج للوصول إلى صفٍّ في برنامج آخر.
   */
  resourceProgramId?: string | null;
  /** الطبقة الرابعة: هل حالة المورد تسمح بالفعل؟ (مغلق · مؤرشف · منتهٍ) */
  state?: () => boolean | Promise<boolean>;
  stateMessage?: string;
};

export async function authorize(
  input: AuthzInput,
  checker: AuthzChecker,
): Promise<AuthzResult> {
  const programId = input.programId ?? null;

  // ── ١ · مصادقة ──
  const userId = await checker.currentUserId();
  if (!userId) {
    return { ok: false, stage: "auth", message: "لا جلسة مصادَق عليها" };
  }

  // ── ٢ · صلاحية ──
  const permitted = await checker.hasPermission(input.permission, programId);
  if (!permitted) {
    return {
      ok: false,
      stage: "permission",
      message: `لا تملك صلاحية ${input.permission}`,
    };
  }

  // ── ٣ · نطاق ──
  // تُفحَص فقط حين يقع الفعل على مورد بعينه. وغياب البيانات **رفضٌ** لا تساهل.
  if (input.resourceProgramId !== undefined) {
    if (input.resourceProgramId === null) {
      return { ok: false, stage: "scope", message: "المورد بلا نطاق معروف" };
    }
    if (programId !== null && input.resourceProgramId !== programId) {
      return { ok: false, stage: "scope", message: "المورد خارج النطاق المصرَّح به" };
    }
  }

  // ── ٤ · حالة ──
  if (input.state) {
    const allowed = await input.state();
    if (!allowed) {
      return {
        ok: false,
        stage: "state",
        message: input.stateMessage ?? "حالة المورد لا تسمح بهذا الفعل",
      };
    }
  }

  return { ok: true, userId };
}
