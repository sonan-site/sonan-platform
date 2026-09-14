import { ErrorState } from "@/components/shared/states";
import { auditActionLabel, auditTableLabel } from "@/lib/audit/labels";
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

  // الفاعل باسمه لا بجزء من معرّفه.
  const actorIds = [...new Set((data ?? []).map((r) => r.actor_id).filter((v): v is string => !!v))];
  const { data: people } = actorIds.length
    ? await db.from("profiles").select("user_id, full_name").in("user_id", actorIds)
    : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.user_id, p.full_name]));

  const rows: AuditRow[] = (data ?? []).map((r) => ({
    id: r.id,
    action: auditActionLabel(r.action),
    entityTable: auditTableLabel(r.entity_table),
    actor: r.actor_id ? (nameOf.get(r.actor_id) ?? "مستخدم") : "المنصة",
    at: r.created_at,
  }));

  return <AuditView rows={rows} />;
}
