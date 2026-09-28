import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { TrashView, type BinRow } from "./trash-view";

/** سلّة المحذوفات — من حُذف حسابه ولم يُمحَ بعد (`adr/0034`). */
export default async function TrashPage() {
  const authz = await authorizeRequest({ permission: "users.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (await authorizeRequest({ permission: "users.write" })).ok;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_deleted_accounts");
  if (error) return <ErrorState body="تعذّر جلب سلّة المحذوفات. أعد المحاولة." />;

  const rows: BinRow[] = (data ?? []).map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    deletedAt: r.deleted_at,
    purgeAfter: r.purge_after,
    isStaff: r.is_staff,
  }));

  return <TrashView rows={rows} canWrite={canWrite} />;
}
