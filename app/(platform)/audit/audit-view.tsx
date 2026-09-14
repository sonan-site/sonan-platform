"use client";

import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHead } from "@/components/shared/steps";
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
  { key: "entity", header: "القسم", render: (r) => r.entityTable },
  { key: "actor", header: "الفاعل", render: (r) => r.actor },
  { key: "at", header: "متى", align: "end", sortable: true, render: (r) => formatDateTime(r.at) },
];

export function AuditView({ rows }: { rows: AuditRow[] }) {
  return (
    <>
      <PageHead
        crumbs={[{ href: "/dashboard", label: "لوحة المتابعة" }]}
        title="سجل التدقيق"
        lede="من فعل ماذا ومتى — آخر ٢٠٠ فعل. السجل يُقرأ ولا يُعدَّل ولا يُحذف."
      />
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
