import "server-only";
import type { PermissionCode } from "@/config/permissions";
import { isPermissionCode } from "@/config/permissions";
import type { Viewer } from "@/config/navigation";
import { getSession } from "@/lib/auth/session";

/**
 * صلاحيات المستخدم الحالي — **لترشيح التنقّل وحده**.
 *
 * ليست بديلاً عن الفحص: الإخفاء تجربة استخدام، والمنع في القاعدة عبر RLS وفي
 * الخادم عبر الفاحص رباعي الطبقات. `platform.md §٧`: «إخفاء المدخل ليس حماية».
 */
export async function currentViewer(): Promise<Viewer> {
  const session = await getSession();
  if (session.status !== "active") return { granted: new Set<PermissionCode>(), isParticipant: false };

  const codes = new Set<PermissionCode>();
  for (const code of session.permissions.keys()) {
    if (isPermissionCode(code)) codes.add(code);
  }
  return { granted: codes, isParticipant: session.isParticipant };
}
