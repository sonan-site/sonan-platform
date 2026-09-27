import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { formatPhone } from "@/lib/profile/phone";
import { authorizeRequest } from "@/lib/permissions/server";
import { PeopleView, type UserRow } from "./people-view";

export default async function UsersPage() {
  // الفحص في **مطلع** الصفحة، قبل أي استعلام.
  const authz = await authorizeRequest({ permission: "users.read" });
  if (!authz.ok) {
    return <ErrorState title="غير مصرَّح" body={authz.message} />;
  }

  const canWrite = (await authorizeRequest({ permission: "users.write" })).ok;

  const db = await createClient();
  // الأدوار مع الأشخاص: «من بقي بلا دور» كان يحتاج شاشةً أخرى ومقابلةً بالاسم.
  const [{ data, error }, rolesResult] = await Promise.all([
    db
      .from("profiles")
      .select("id, user_id, full_name, phone, created_at, deleted_at")
      .order("created_at", { ascending: false }),
    db.from("user_roles").select("user_id, roles!inner(name)").is("deleted_at", null),
  ]);

  if (error) {
    return <ErrorState body="تعذّر جلب المستخدمين. أعد المحاولة." />;
  }

  const rolesOf = new Map<string, string[]>();
  for (const row of rolesResult.data ?? []) {
    const role = row.roles as unknown as { name: string };
    rolesOf.set(row.user_id, [...(rolesOf.get(row.user_id) ?? []), role.name]);
  }

  const rows: UserRow[] = (data ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    fullName: p.full_name,
    phone: p.phone ? formatPhone(p.phone) : "—",
    joinedAt: p.created_at,
    suspended: p.deleted_at !== null,
    roles: rolesOf.get(p.user_id) ?? [],
  }));

  return <PeopleView rows={rows} canWrite={canWrite} />;
}
