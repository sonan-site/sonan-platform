import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { RolesView, type AssignmentRow, type RoleRow } from "./roles-view";

export default async function RolesPage() {
  const authz = await authorizeRequest({ permission: "roles.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canAssign = (await authorizeRequest({ permission: "roles.assign" })).ok;
  const db = await createClient();

  const [rolesResult, permsResult, assignResult, peopleResult, programsResult] = await Promise.all([
    db.from("roles").select("id, name, is_system").is("deleted_at", null).order("name"),
    db.from("role_permissions").select("role_id, permission_code").is("deleted_at", null),
    db
      .from("user_roles")
      .select("id, user_id, role_id, scope_program_id")
      .is("deleted_at", null),
    db.from("profiles").select("user_id, full_name").is("deleted_at", null).order("full_name"),
    // النطاق: دورٌ محصور ببرنامج واحد — فمنسّق برنامج لا يرى غيره.
    db.from("programs").select("id, name").is("deleted_at", null).order("name"),
  ]);

  if (rolesResult.error || permsResult.error || assignResult.error || peopleResult.error) {
    return <ErrorState body="تعذّر جلب الأدوار." />;
  }

  const codesByRole = new Map<string, string[]>();
  for (const p of permsResult.data ?? []) {
    codesByRole.set(p.role_id, [...(codesByRole.get(p.role_id) ?? []), p.permission_code]);
  }

  const roles: RoleRow[] = (rolesResult.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    isSystem: r.is_system,
    codes: (codesByRole.get(r.id) ?? []).sort(),
  }));

  const nameByUser = new Map((peopleResult.data ?? []).map((p) => [p.user_id, p.full_name]));
  const nameByRole = new Map(roles.map((r) => [r.id, r.name]));
  const programs = programsResult.data ?? [];
  const programName = new Map(programs.map((p) => [p.id, p.name]));

  const assignments: AssignmentRow[] = (assignResult.data ?? []).map((a) => ({
    id: a.id,
    userId: a.user_id,
    userName: nameByUser.get(a.user_id) ?? "—",
    roleName: nameByRole.get(a.role_id) ?? "—",
    scope: a.scope_program_id ? (programName.get(a.scope_program_id) ?? "برنامج محذوف") : "المنصة كلها",
  }));

  const people = (peopleResult.data ?? []).map((p) => ({
    userId: p.user_id,
    name: p.full_name,
  }));

  return (
    <RolesView
      roles={roles}
      assignments={assignments}
      people={people}
      programs={programs}
      canAssign={canAssign}
    />
  );
}
