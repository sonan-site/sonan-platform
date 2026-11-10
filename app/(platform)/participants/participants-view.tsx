"use client";

import { useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type ActiveFilter, type Column } from "@/components/shared/data-table";
import { FilterLinks, type FilterLink } from "@/components/shared/filter-links";
import { Button, FormActions } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { PageHead } from "@/components/shared/steps";
import { programsText } from "@/lib/accounts/accounts-csv";
import { ACCOUNT_DUPLICATE_LABEL } from "@/lib/accounts/list-query";
import { binNotice } from "@/lib/accounts/bin";
import { formatDateBoth, formatNumber } from "@/lib/format";
import { deleteAccount, restoreUser, suspendUser } from "../team/actions";
import styles from "./participants.module.css";

export type AccountRow = {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  joinedAt: string;
  suspended: boolean;
  /** موعد المحو — غير فارغ يعني أنه في سلّة المحذوفات لا موقوفاً (`adr/0034`). */
  purgeAfter: string | null;
  /** أسماء برامجه الظاهرة لمن يقرأ. */
  programs: string[];
  /** له مشاركة · لا مشاركة له · `null` لا نعرف (من لا يرى المشاركات كلها). */
  hasProgram: boolean | null;
  /** نظراؤه بالميلاد مع الاسم أو الجوال — «مكرّر محتمل» (الدفعة ٣). */
  sameIdentity: string[];
  /** نظراؤه بالجوال نفسه بميلادٍ آخر — «جوال مشترك»، وأغلبه إخوة. */
  samePhone: string[];
};

/** ما يُعرض من النظراء — جوالٌ سجّل به معلّمٌ حلقته لا يملأ الصفّ بأسمائهم. */
const PEERS_SHOWN = 3;

/**
 * علامة تكرارٍ تحت الاسم، ونظراؤه مكتوبون فيها لا في تلميحٍ وحده — فتُقرأ على الجوال أيضاً. وكل نظيرٍ
 * بما يميّزه (آخر جواله · يوم إنشائه · حاله)، فيُعرف أيّ الحسابين يُحسم.
 */
function DuplicateMark({ label, peers, strong }: { label: string; peers: string[]; strong: boolean }) {
  if (peers.length === 0) return null;
  const rest = peers.length - PEERS_SHOWN;
  return (
    <span className={strong ? styles.dupStrong : styles.dup}>
      {label}: {peers.slice(0, PEERS_SHOWN).join("؛ ")}
      {rest > 0 ? ` — و${formatNumber(rest)} غيرهم` : null}
    </span>
  );
}

/** صفٌّ في السلّة لا يُوقَف ولا يُحذف ثانيةً — يُستعاد أو يُمحى من شاشتها. */
const ROW_ACTIONS = {
  display: "flex",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
} as const;

export function ParticipantsView({
  rows,
  total,
  page,
  withProgram,
  programLinks,
  statusLinks,
  duplicateLinks,
  searchModeLinks,
  byDocument,
  documentNotFound,
  activeFilters,
  exportHref,
  canWrite,
}: {
  /** الصفحة المعروضة وحدها — البحث والتصفية والفرز والتقسيم في القاعدة. */
  rows: AccountRow[];
  /** كل ما يطابق البحث والتصفية عبر الصفحات. */
  total: number;
  page: number;
  /** من سجّل في برنامجٍ عبر كل الحسابات — `null` إن تعذّر عدّه. */
  withProgram: number | null;
  programLinks: FilterLink[];
  statusLinks: FilterLink[];
  duplicateLinks: FilterLink[];
  /** وضعا البحث (الاسم والجوال · رقم الوثيقة) — لحامل `identities.read` وحده، وإلا فارغة. */
  searchModeLinks: FilterLink[];
  /** وضع الوثيقة: الخانة تطلب الرقم كاملاً، والتطابق تامّ. */
  byDocument: boolean;
  /** بُحث برقم وثيقةٍ فلم يوجد حساب. */
  documentNotFound: boolean;
  activeFilters: ActiveFilter[];
  /** رابط ملف ما تعرضه القائمة بكل صفحاته — `null` لمن لا يملك التصدير. */
  exportHref: string | null;
  canWrite: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [suspending, setSuspending] = useState<AccountRow | null>(null);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);

  const columns: Column<AccountRow>[] = [
    {
      key: "fullName",
      header: "الاسم",
      sortable: true,
      primary: true,
      render: (r) => (
        <span className={styles.name}>
          {r.fullName}
          <DuplicateMark label={ACCOUNT_DUPLICATE_LABEL.identity} peers={r.sameIdentity} strong />
          <DuplicateMark label={ACCOUNT_DUPLICATE_LABEL.phone} peers={r.samePhone} strong={false} />
        </span>
      ),
    },
    { key: "phone", header: "الجوال", render: (r) => <span dir="ltr">{r.phone}</span> },
    {
      key: "programs",
      header: "البرامج",
      // من أنشأ حساباً ولم يسجّل يُقال صراحةً — فيُعرف من تعثّر عند الباب.
      // وبرنامجٌ لا يظهر اسمه لمن يقرأ يُقال «—» لا «بلا برنامج».
      render: (r) => programsText(r.programs, r.hasProgram),
    },
    { key: "joinedAt", header: "منذ", sortable: true, render: (r) => formatDateBoth(r.joinedAt) },
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
        lede={
          withProgram === null
            ? "كل من أنشأ حساباً، وبرامجه التي سجّل فيها."
            : `كل من أنشأ حساباً، وبرامجه التي سجّل فيها. ${formatNumber(withProgram)} منهم في برنامج على الأقل.`
        }
      />

      <FilterLinks label="البرنامج" links={programLinks} />
      <FilterLinks label="الحالة" links={statusLinks} />
      <FilterLinks label="التكرار" links={duplicateLinks} />
      <FilterLinks label="البحث" links={searchModeLinks} />
      {byDocument ? (
        <p className={styles.export}>
          {documentNotFound
            ? "لا حساب بهذا الرقم."
            : "يُبحث برقم الوثيقة كاملاً لا بجزئه، ويُسجَّل كل بحثٍ هنا في سجلّ التدقيق دون الرقم."}
        </p>
      ) : null}
      {exportHref && total > 0 ? (
        <p className={styles.export}>
          <a href={exportHref} download>
            صدّر الحسابات المطابقة ({formatNumber(total)}) — ملف Excel ‏(CSV)
          </a>{" "}
          · يُسجَّل التصدير في سجلّ التدقيق.
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={total}
        page={page}
        filters={activeFilters}
        searchPlaceholder={byDocument ? "اكتب رقم الوثيقة كاملاً…" : "ابحث بالاسم أو الجوال…"}
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
