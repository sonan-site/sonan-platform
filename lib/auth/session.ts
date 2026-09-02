import "server-only";
import { createClient } from "@/lib/db/server";

/**
 * حالة الجلسة الحالية.
 *
 * **الصلاحيات تُقرأ حيّة من القاعدة** في كل طلب لا من داخل الرمز — فتغيير الدور
 * أو إيقاف الحساب ينفذ خلال طلب واحد، لا خلال عمر الرمز (`platform.md §٩`:
 * «ينفذ على الجلسات القائمة خلال دقيقة كحد أقصى»).
 */

export type SessionState =
  | { status: "anonymous" }
  | { status: "suspended"; userId: string }
  | {
      status: "active";
      userId: string;
      email: string;
      /** المفتاح: الرمز · القيمة: مجموعة النطاقات (null فيها = نطاق عام). */
      permissions: Map<string, Set<string | null>>;
    };

export async function getSession(): Promise<SessionState> {
  const db = await createClient();

  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { status: "anonymous" };

  const { data: active } = await db.rpc("fn_is_active");
  if (active !== true) return { status: "suspended", userId: auth.user.id };

  const { data: rows } = await db.rpc("fn_my_permissions");

  const permissions = new Map<string, Set<string | null>>();
  for (const row of rows ?? []) {
    const scopes = permissions.get(row.permission_code) ?? new Set<string | null>();
    scopes.add(row.scope_program_id);
    permissions.set(row.permission_code, scopes);
  }

  return {
    status: "active",
    userId: auth.user.id,
    email: auth.user.email ?? "",
    permissions,
  };
}
