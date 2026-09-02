import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { AuditView, type AuditRow } from "./audit-view";

export default async function AuditPage() {
  const authz = await authorizeRequest({ permission: "audit.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const { data, error } = await db
    .from("audit_log")
    .select("id, action, entity_table, actor_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return <ErrorState body="تعذّر جلب السجل." />;

  const rows: AuditRow[] = (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    entityTable: r.entity_table,
    actor: r.actor_id ? r.actor_id.slice(0, 8) : "النظام",
    at: r.created_at,
  }));

  return <AuditView rows={rows} />;
}
