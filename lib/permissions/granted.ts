import "server-only";
import type { PermissionCode } from "@/config/permissions";

/**
 * صلاحيات المستخدم الحالي — لترشيح التنقّل وحده.
 *
 * **ليست بديلاً عن الفحص.** الإخفاء تجربة استخدام؛ والمنع في القاعدة عبر RLS
 * وفي الخادم عبر الفاحص رباعي الطبقات. `platform.md §٧`: «إخفاء المدخل ليس حماية».
 *
 * تُرجع الآن مجموعة فارغة: **لا مصادقة مبنيّة بعد** (الحزمة السادسة).
 * والفراغ هنا هو الافتراض الآمن — لا يظهر إلا ما لا يشترط صلاحية.
 */
export async function grantedPermissions(): Promise<ReadonlySet<PermissionCode>> {
  return new Set<PermissionCode>();
}
