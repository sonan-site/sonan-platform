import "server-only";
import type { PermissionCode } from "../../config/permissions";
import { getSession } from "../auth/session";
import { authorize, type AuthzChecker, type AuthzInput, type AuthzResult } from "./authorize";

/**
 * يوصل الفاحص النقيّ بالقاعدة.
 *
 * الصلاحيات من `fn_my_permissions` عبر الجلسة — **حيّة من القاعدة** لا من نسخة
 * في الرمز: ما يُفرض في التطبيق فقط غير مفروض (platform.md 7). والجلسة تُحسب
 * مرّة للطلب، فثلاثة فحوص في صفحة واحدة لا تدفع ثلاث رحلات.
 *
 * والحكم مطابق لـ`fn_has_permission` حرفاً: النطاق العام يسري على كل برنامج،
 * والمحصور ببرنامج يسري عليه وحده. والموقوف لا يملك شيئاً.
 */
function makeChecker(): AuthzChecker {
  return {
    currentUserId: async () => {
      const session = await getSession();
      return session.status === "active" ? session.userId : null;
    },
    hasPermission: async (code: PermissionCode, programId: string | null) => {
      const session = await getSession();
      if (session.status !== "active") return false;
      const scopes = session.permissions.get(code);
      if (!scopes) return false;
      return scopes.has(null) || (programId !== null && scopes.has(programId));
    },
  };
}

/** يُستدعى في **مطلع** كل إجراء خادم، بعد التحقّق بـ Zod وقبل أي عمل. */
export async function authorizeRequest(input: AuthzInput): Promise<AuthzResult> {
  return authorize(input, makeChecker());
}
