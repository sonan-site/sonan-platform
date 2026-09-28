"use client";

import { useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, FormActions } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { PageHead } from "@/components/shared/steps";
import { formatDateBoth, formatNumber } from "@/lib/format";
import { restoreUser, suspendUser } from "../team/actions";

export type AccountRow = {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  joinedAt: string;
  suspended: boolean;
  /** برامجه — الفارغة تعني حساباً لم يسجّل في شيء بعد. */
  programs: string[];
};

export function ParticipantsView({ rows, canWrite }: { rows: AccountRow[]; canWrite: boolean }) {
  const [busy, startTransition] = useTransition();
  const [suspending, setSuspending] = useState<AccountRow | null>(null);

  const withProgram = rows.filter((r) => r.programs.length > 0).length;

  const columns: Column<AccountRow>[] = [
    { key: "fullName", header: "الاسم", sortable: true, primary: true, render: (r) => r.fullName },
    { key: "phone", header: "الجوال", render: (r) => <span dir="ltr">{r.phone}</span> },
    {
      key: "programs",
      header: "البرامج",
      // من أنشأ حساباً ولم يسجّل يُقال صراحةً — فيُعرف من تعثّر عند الباب.
      render: (r) => (r.programs.length > 0 ? r.programs.join(" · ") : "بلا برنامج"),
    },
    { key: "joinedAt", header: "منذ", render: (r) => formatDateBoth(r.joinedAt) },
    {
      key: "status",
      header: "الحالة",
      align: "center",
      render: (r) => (r.suspended ? "موقوف" : "نشط"),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "end" as const,
            render: (r: AccountRow) => (
              <Button
                pending={busy}
                onClick={() =>
                  r.suspended
                    ? startTransition(async () => reportAction(await restoreUser(r.userId)))
                    : setSuspending(r)
                }
              >
                {r.suspended ? "إعادة تفعيل" : "إيقاف"}
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHead
        crumbs={[{ href: "/dashboard", label: "لوحة المتابعة" }]}
        title="المشاركون في المنصة"
        lede={`كل من أنشأ حساباً، وبرامجه التي سجّل فيها. ${formatNumber(withProgram)} منهم في برنامج على الأقل.`}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={rows.length}
        page={1}
        searchPlaceholder="ابحث بالاسم…"
        empty={{ title: "لا حسابات بعد", body: "لم يُنشئ أحد حساباً في المنصة." }}
      />

      <Modal open={suspending !== null} title="إيقاف الحساب" onClose={() => setSuspending(null)}>
        <p>
          يُوقَف «{suspending?.fullName}»: تنقطع جلسته ولا يدخل بعدها، ويبقى سجلّه ومشاركاته كما
          هي. وتستطيع إعادة تفعيله متى شئت.
        </p>
        <FormActions>
          <Button onClick={() => setSuspending(null)}>إلغاء</Button>
          <Button
            variant="danger"
            pending={busy}
            onClick={() => {
              const row = suspending;
              if (!row) return;
              startTransition(async () => {
                reportAction(await suspendUser(row.userId));
                setSuspending(null);
              });
            }}
          >
            أوقِفه
          </Button>
        </FormActions>
      </Modal>
    </>
  );
}
