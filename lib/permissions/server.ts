import "server-only";
import type { PermissionCode } from "../../config/permissions";
import { createClient } from "../db/server";
import { authorize, type AuthzChecker, type AuthzInput, type AuthzResult } from "./authorize";

/**
 * يوصل الفاحص النقيّ بالقاعدة.
 * الصلاحية تُقرأ من `fn_has_permission` في القاعدة — لا من نسخة في الذاكرة:
 * ما يُفرض في التطبيق فقط غير مفروض (platform.md 7).
 */
async function makeChecker(): Promise<AuthzChecker> {
  const db = await createClient();

  return {
    currentUserId: async () => {
      const { data } = await db.auth.getUser();
      return data.user?.id ?? null;
    },
    hasPermission: async (code: PermissionCode, programId: string | null) => {
      const { data, error } = await db.rpc("fn_has_permission", {
        p_code: code,
        // الأنواع المولَّدة تصفه اختيارياً لأن له قيمة افتراضية null في القاعدة.
        // تمرير undefined = عدم التمرير = null هناك. لا فرق دلالياً.
        p_program_id: programId ?? undefined,
      });
      // الافتراض الآمن يُفحَص لا يُفترَض: خطأ في الاستدعاء = رفض، لا تجاهل.
      if (error) return false;
      return data === true;
    },
  };
}

/** يُستدعى في **مطلع** كل إجراء خادم، بعد التحقّق بـ Zod وقبل أي عمل. */
export async function authorizeRequest(input: AuthzInput): Promise<AuthzResult> {
  return authorize(input, await makeChecker());
}
