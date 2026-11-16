"use client";

import { DataTable, type Column } from "@/components/shared/data-table";
import { formatNumber } from "@/lib/format";
import type { Point } from "./charts";

/**
 * جدول أرقام الإحصاءات — مكوّن متصفح، لأن أعمدة `DataTable` دوالّ لا تعبر من الخادم (بلاغ ١٦ نوفمبر:
 * كانت الصفحة تسقط). يستلم صفوف الصفحة الحالية محسوبةً، والصفحات من الرابط.
 */

const COLUMNS: Column<Point>[] = [
  { key: "period", header: "الفترة", primary: true, render: (p) => p.label },
  { key: "active", header: "النشطون", align: "end", render: (p) => formatNumber(p.active) },
  { key: "signedIn", header: "الداخلون", align: "end", render: (p) => formatNumber(p.signedIn) },
];

export function StatsTable({ rows, total, page }: { rows: Point[]; total: number; page: number }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(p) => p.start}
      total={total}
      page={page}
      searchable={false}
      empty={{ title: "لا فترات", body: "لا فترات في هذا المدى." }}
    />
  );
}
