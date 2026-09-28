"use client";

import { useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, FormActions } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { PageHead } from "@/components/shared/steps";
import { binNotice } from "@/lib/accounts/bin";
import { formatDateBoth, formatNumber } from "@/lib/format";
import { deleteAccount, restoreUser, suspendUser } from "../team/actions";

export type AccountRow = {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  joinedAt: string;
  suspended: boolean;
  /** موعد المحو — غير فارغ يعني أنه في سلّة المحذوفات لا موقوفاً (`adr/0034`). */
  purgeAfter: string | null;
  /** برامجه — الفارغة تعني حساباً لم يسجّل في شيء بعد. */
  programs: string[];
};

/** صفٌّ في السلّة لا يُوقَف ولا يُحذف ثانيةً — يُستعاد أو يُمحى من شاشتها. */
const ROW_ACTIONS = {
  display: "flex",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
} as const;

export function ParticipantsView({ rows, canWrite }: { rows: AccountRow[]; canWrite: boolean }) {
  const [busy, startTransition] = useTransition();
  const [suspending, setSuspending] = useState<AccountRow | null>(null);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);

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
      render: (r) => (r.purgeAfter ? binNotice(r.purgeAfter) : r.suspended ? "موقوف" : "نشط"),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "end" as const,
            render: (r: AccountRow) => (
              <span style={ROW_ACTIONS}>
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
                {r.purgeAfter ? null : (
                  <Button variant="danger" pending={busy} onClick={() => setDeleting(r)}>
                    حذف
                  </Button>
                )}
              </span>
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

      <Modal open={deleting !== null} title="حذف الحساب" onClose={() => setDeleting(null)}>
        <p>
          يُحذف «{deleting?.fullName}» إلى سلّة المحذوفات: يخرج من برامجه فيتحرّر مقعده، ولا يدخل
          بعدها. ويبقى في السلّة مدّةً تستعيده فيها، ثم يُمحى محواً لا رجعة فيه — وسجلّ ما فعله
          يبقى باسمٍ مطموس.
        </p>
        <FormActions>
          <Button onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button
            variant="danger"
            pending={busy}
            onClick={() => {
              const row = deleting;
              if (!row) return;
              startTransition(async () => {
                reportAction(await deleteAccount(row.userId));
                setDeleting(null);
              });
            }}
          >
            احذفه
          </Button>
        </FormActions>
      </Modal>
    </>
  );
}
