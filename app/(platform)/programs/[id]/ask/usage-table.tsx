"use client";

import { DataTable, type Column } from "@/components/shared/data-table";
import { formatNumber } from "@/lib/format";

/**
 * عدّاد المساعد (خطة ١٧ نوفمبر) — كم سؤالاً وصله، بنتائجها: اليوم وآخر ٧ أيام ومنذ البدء.
 * مكوّن متصفح لأن أعمدة `DataTable` دوالّ لا تعبر من الخادم.
 */

export type UsageRow = { outcome: string; today: number; last7: number; total: number };

const OUTCOME_LABEL: Record<string, string> = {
  answer: "أجاب",
  student_affairs: "أحال إلى شؤون الطلاب",
  voices: "مشكلة تقنية في المنصة",
  off_topic: "خارج موضوع المسابقة",
  blocked: "ردّه الفحص الآلي",
  limited: "رُدّ بحدّ الأسئلة",
  error: "تعذّر الرد",
  total: "المجموع",
};

const COLUMNS: Column<UsageRow>[] = [
  {
    key: "outcome",
    header: "النتيجة",
    primary: true,
    render: (r) => (r.outcome === "total" ? <strong>{OUTCOME_LABEL.total}</strong> : (OUTCOME_LABEL[r.outcome] ?? r.outcome)),
  },
  { key: "today", header: "اليوم", align: "end", render: (r) => formatNumber(r.today) },
  { key: "last7", header: "آخر 7 أيام", align: "end", render: (r) => formatNumber(r.last7) },
  { key: "total", header: "منذ البدء", align: "end", render: (r) => formatNumber(r.total) },
];

export function UsageTable({ rows }: { rows: UsageRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.outcome}
      total={rows.length}
      page={1}
      searchable={false}
      empty={{ title: "لا أسئلة بعد", body: "يبدأ العدّ مع أول سؤال." }}
    />
  );
}
