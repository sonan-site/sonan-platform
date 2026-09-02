import "server-only";
import type { PermissionCode } from "@/config/permissions";
import { isPermissionCode } from "@/config/permissions";
import { getSession } from "@/lib/auth/session";

/**
 * صلاحيات المستخدم الحالي — **لترشيح التنقّل وحده**.
 *
 * ليست بديلاً عن الفحص: الإخفاء تجربة استخدام، والمنع في القاعدة عبر RLS وفي
 * الخادم عبر الفاحص رباعي الطبقات. `platform.md §٧`: «إخفاء المدخل ليس حماية».
 */
export async function grantedPermissions(): Promise<ReadonlySet<PermissionCode>> {
  const session = await getSession();
  if (session.status !== "active") return new Set<PermissionCode>();

  const codes = new Set<PermissionCode>();
  for (const code of session.permissions.keys()) {
    if (isPermissionCode(code)) codes.add(code);
  }
  return codes;
}
