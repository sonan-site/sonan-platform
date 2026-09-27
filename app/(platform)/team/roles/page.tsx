import { ErrorState } from "@/components/shared/states";
import { PERMISSIONS, type PermissionCode } from "@/config/permissions";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { RolesView, type RoleRow } from "./roles-view";

/** تبويب الأدوار — تعريف الدور وصلاحياته (`adr/0031`). */
export default async function RolesPage() {
  const authz = await authorizeRequest({ permission: "roles.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (await authorizeRequest({ permission: "roles.write" })).ok;

  const db = await createClient();
  const [rolesResult, permsResult, assignmentsResult] = await Promise.all([
    db.from("roles").select("id, name, is_system").is("deleted_at", null).order("created_at"),
    db.from("role_permissions").select("role_id, permission_code").is("deleted_at", null),
    db.from("user_roles").select("role_id").is("deleted_at", null),
  ]);

  if (rolesResult.error) return <ErrorState body="تعذّر جلب الأدوار." />;

  const granted = new Map<string, PermissionCode[]>();
  for (const row of permsResult.data ?? []) {
    if (!(row.permission_code in PERMISSIONS)) continue;
    const list = granted.get(row.role_id) ?? [];
    list.push(row.permission_code as PermissionCode);
    granted.set(row.role_id, list);
  }

  const assignedCount = new Map<string, number>();
  for (const row of assignmentsResult.data ?? []) {
    assignedCount.set(row.role_id, (assignedCount.get(row.role_id) ?? 0) + 1);
  }

  const roles: RoleRow[] = (rolesResult.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    isSystem: r.is_system,
    permissions: granted.get(r.id) ?? [],
    assigned: assignedCount.get(r.id) ?? 0,
  }));

  return <RolesView roles={roles} canWrite={canWrite} />;
}
