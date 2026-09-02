"use client";

import { DataTable, type Column } from "@/components/shared/data-table";
import { formatDateTime } from "@/lib/format";

export type AuditRow = {
  id: string;
  action: string;
  entityTable: string;
  actor: string;
  at: string;
};

const columns: Column<AuditRow>[] = [
  { key: "action", header: "الفعل", sortable: true, primary: true, render: (r) => r.action },
  { key: "entity", header: "على", render: (r) => r.entityTable },
  { key: "actor", header: "الفاعل", render: (r) => r.actor },
  { key: "at", header: "متى", align: "end", sortable: true, render: (r) => formatDateTime(r.at) },
];

export function AuditView({ rows }: { rows: AuditRow[] }) {
  return (
    <>
      <h1>سجل التدقيق</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
        من فعل ماذا على ماذا ومتى. سجل يُقرأ ولا يُعدَّل.
      </p>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={rows.length}
        page={1}
        searchPlaceholder="ابحث بالفعل…"
        empty={{ title: "السجل فارغ", body: "لم يقع فعل مسجَّل بعد." }}
      />
    </>
  );
}
