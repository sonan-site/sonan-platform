"use client";

import { DataTable, type Column } from "@/components/shared/data-table";
import type { FilterLink } from "@/components/shared/filter-links";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHead } from "@/components/shared/steps";
import { formatDateTime } from "@/lib/format";

export type AuditRow = {
  id: string;
  action: string;
  entityTable: string;
  /** ما لا يقوله اسم الفعل — بأي تصفيةٍ صُدِّرت الحسابات، وما تغيّر في بيانات حساب. */
  detail: string;
  actor: string;
  at: string;
};

const columns: Column<AuditRow>[] = [
  { key: "action", header: "الفعل", sortable: true, primary: true, render: (r) => r.action },
  { key: "entity", header: "القسم", render: (r) => r.entityTable },
  { key: "detail", header: "التفاصيل", render: (r) => r.detail },
  { key: "actor", header: "الفاعل", render: (r) => r.actor },
  { key: "at", header: "متى", align: "end", sortable: true, render: (r) => formatDateTime(r.at) },
];

export function AuditView({ rows, kindLinks, dataOnly }: { rows: AuditRow[]; kindLinks: FilterLink[]; dataOnly: boolean }) {
  return (
    <>
      <PageHead
        crumbs={[{ href: "/dashboard", label: "لوحة المتابعة" }]}
        title="سجل التدقيق"
        lede={
          dataOnly
            ? "ما تغيّر في بيانات الحسابات بعد استكمالها — بيد أصحابها أو بيد الإدارة. آخر 200، وتعديلات الشخص الواحد خلال عشر دقائق سطرٌ واحد."
            : "من فعل ماذا ومتى — آخر 200 فعل. السجل يُقرأ ولا يُحذف، ولا يُعدَّل إلا طمسَ اسمِ من مُحي حسابه وقيمِ بياناته."
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={rows.length}
        page={1}
        searchPlaceholder="ابحث بالفعل…"
        controls={<FilterSelect label="النوع" param="kind" links={kindLinks} />}
        empty={
          dataOnly
            ? { title: "لا تعديلات بيانات بعد", body: "لم تتغيّر بيانات حسابٍ بعد استكمالها." }
            : { title: "السجل فارغ", body: "لم يقع فعل مسجَّل بعد." }
        }
      />
    </>
  );
}
