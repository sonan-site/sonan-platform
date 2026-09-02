import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { UsersView, type UserRow } from "./users-view";

export default async function UsersPage() {
  // الفحص في **مطلع** الصفحة، قبل أي استعلام.
  const authz = await authorizeRequest({ permission: "users.read" });
  if (!authz.ok) {
    return <ErrorState title="غير مصرَّح" body={authz.message} />;
  }

  const canWrite = (await authorizeRequest({ permission: "users.write" })).ok;

  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, user_id, full_name, phone, created_at, deleted_at")
    .order("created_at", { ascending: false });

  if (error) {
    return <ErrorState body="تعذّر جلب المستخدمين. أعد المحاولة." />;
  }

  const rows: UserRow[] = (data ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    fullName: p.full_name,
    phone: p.phone,
    joinedAt: p.created_at,
    suspended: p.deleted_at !== null,
  }));

  return <UsersView rows={rows} canWrite={canWrite} />;
}
