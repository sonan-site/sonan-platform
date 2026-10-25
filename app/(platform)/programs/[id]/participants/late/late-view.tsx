"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Chip, Chips, Muted, TabHead } from "@/components/shared/steps";
import { daysText } from "@/lib/participants/journey";
import { formatDateBoth, formatNumber } from "@/lib/format";

export type LateRow = {
  id: string;
  name: string;
  phone: string | null;
  registrationNo: string | null;
  trackName: string;
  lateDays: number;
  lastDoneAt: string | null;
};

/** المتأخرون للرصد — بلا أزرار تواصل؛ الترتيب من القاعدة تنازلياً بأيام التأخر. */
export function LateView({
  programId,
  rows,
  total,
  perTrack,
}: {
  programId: string;
  rows: LateRow[];
  /** كل المتأخرين قبل البحث. */
  total: number;
  perTrack: { name: string; count: number }[];
}) {
  const columns: Column<LateRow>[] = [
    { key: "name", header: "المشارك", primary: true, render: (r) => r.name },
    {
      key: "phone",
      header: "الجوال",
      render: (r) => (r.phone ? <bdi dir="ltr">{r.phone}</bdi> : "—"),
    },
    { key: "track", header: "المسار", render: (r) => r.trackName },
    { key: "late", header: "التأخر", align: "end", render: (r) => `متأخر ${daysText(r.lateDays)}` },
    {
      key: "last",
      header: "آخر إنجاز",
      render: (r) => (r.lastDoneAt ? formatDateBoth(r.lastDoneAt) : "لم يُنجز بعد"),
    },
    {
      key: "no",
      header: "رقم التسجيل",
      render: (r) => (r.registrationNo ? <span dir="ltr">{r.registrationNo}</span> : "—"),
    },
  ];

  return (
    <>
      <TabHead
        title="المتأخرون"
        lede="من تأخّر يوماً فأكثر عن خطته، الأكثر تأخراً أولاً — للرصد والمتابعة. والتأخر ما استحقّ من أيام الخطة ناقصاً ما أتمّه."
      />
      <Muted>
        <Link href={`/programs/${programId}/participants`}>→ كل المشاركين</Link>
      </Muted>
      <Chips>
        <Chip>المتأخرون: {formatNumber(total)}</Chip>
        {perTrack.map((t) => (
          <Chip key={t.name}>
            {t.name}: {formatNumber(t.count)}
          </Chip>
        ))}
      </Chips>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={rows.length}
        page={1}
        pageSize={500}
        searchPlaceholder="ابحث باسم المشارك…"
        empty={{ title: "لا متأخرين", body: "كل المشاركين في موعدهم أو متقدّمون." }}
      />
    </>
  );
}
