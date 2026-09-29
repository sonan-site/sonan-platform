"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, FormActions } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { PageHead } from "@/components/shared/steps";
import { formatNumber } from "@/lib/format";
import { kindLabel, type ProgramKind } from "@/lib/programs/kinds";
import { REGISTRATION_LABEL, type RegistrationState } from "@/lib/programs/registration";
import { moveProgram, setProgramStatus } from "../actions";
import { ProgramsTabs } from "../programs-tabs";

export type PublishRow = {
  id: string;
  name: string;
  slug: string;
  kind: ProgramKind;
  status: "draft" | "published" | "closed";
  sortOrder: number;
  registration: string;
  /** ما يمنع النشر — فارغة تعني جاهزاً (الهجرة ٠٥٠). */
  missing: string[];
  /** يملك العارض الكتابة في هذا البرنامج بعينه. */
  canWrite: boolean;
};

const STATUS_LABEL: Record<PublishRow["status"], string> = {
  draft: "مسوّدة",
  published: "منشور",
  closed: "مغلق",
};

const ROW_ACTIONS = {
  display: "flex",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
  flexWrap: "wrap",
} as const;

const ORDER = { display: "flex", gap: "var(--space-1)", justifyContent: "center" } as const;
const ICON = 16;

function isRegistrationState(value: string): value is RegistrationState {
  return value in REGISTRATION_LABEL;
}

export function PublishView({ rows, canOrder }: { rows: PublishRow[]; canOrder: boolean }) {
  const [busy, startTransition] = useTransition();
  const [hiding, setHiding] = useState<PublishRow | null>(null);

  const published = rows.filter((r) => r.status === "published").length;

  const columns: Column<PublishRow>[] = [
    {
      key: "name",
      header: "البرنامج",
      sortable: true,
      primary: true,
      render: (p) => <Link href={`/programs/${p.id}`}>{p.name}</Link>,
    },
    { key: "kind", header: "النمط", render: (p) => kindLabel(p.kind) },
    {
      key: "slug",
      header: "الرابط",
      /*
       * **والمسوّدة تُعايَن:** سياسة القراءة تفتح صفحتها لمن يقرأ البرنامج، فما
       * كان ينقص إلا رابطاً. وهذا ما أجّلته `ع-١/٢` «كإضافة لا كإعادة بناء».
       */
      render: (p) => (
        <Link href={`/p/${p.slug}`} dir="ltr" title={p.status === "published" ? undefined : "معاينة — الصفحة لا تظهر للزوّار بعد"}>
          /p/{p.slug}
        </Link>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      align: "center",
      render: (p) => (
        <span>
          {STATUS_LABEL[p.status]}
          {p.status === "published" && isRegistrationState(p.registration)
            ? ` · ${REGISTRATION_LABEL[p.registration]}`
            : null}
        </span>
      ),
    },
    {
      key: "order",
      header: "الترتيب",
      align: "center",
      render: (p) => {
        const index = rows.findIndex((r) => r.id === p.id);
        if (!canOrder) return formatNumber(index + 1);
        return (
          <span style={ORDER}>
            <Button
              aria-label="تقديم في الواجهة"
              disabled={index === 0}
              pending={busy}
              onClick={() =>
                startTransition(async () => reportAction(await moveProgram(p.id, "up")))
              }
            >
              <ChevronUp size={ICON} aria-hidden />
            </Button>
            <Button
              aria-label="تأخير في الواجهة"
              disabled={index === rows.length - 1}
              pending={busy}
              onClick={() =>
                startTransition(async () => reportAction(await moveProgram(p.id, "down")))
              }
            >
              <ChevronDown size={ICON} aria-hidden />
            </Button>
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (p) => (
        <span style={ROW_ACTIONS}>
          {/* لا يُعرض ما لا يصحّ: من لا يكتب في هذا البرنامج لا يُعرض له زرّ نشره. */}
          {!p.canWrite ? null : p.status === "published" ? (
            <Button variant="danger" onClick={() => setHiding(p)}>
              إخفاء
            </Button>
          ) : (
            <Button
              variant="primary"
              pending={busy}
              // لا يُعرض ما لا يصحّ: القاعدة ترفض النشر ناقصاً، فالزرّ يعرف قبل أن يُضغط.
              disabled={p.missing.length > 0}
              title={p.missing.length > 0 ? `ينقص: ${p.missing.join(" · ")}` : undefined}
              onClick={() =>
                startTransition(async () =>
                  reportAction(await setProgramStatus(p.id, "published")),
                )
              }
            >
              انشر
            </Button>
          )}
          <Link href={`/programs/${p.id}/page`}>الصفحة</Link>
          <Link href={`/programs/${p.id}/faq`}>أسئلة</Link>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHead
        crumbs={[{ href: "/dashboard", label: "لوحة المتابعة" }]}
        title="نشر البرامج"
        lede={`انشر البرامج في الواجهة العامة، ورتّبها كما تريد أن يراها الزائر، وادخل إلى صفحة كل برنامج وأسئلته. ${formatNumber(published)} منشورة الآن.`}
      />
      <ProgramsTabs />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        total={rows.length}
        page={1}
        searchPlaceholder="ابحث باسم البرنامج…"
        empty={{ title: "لا برامج بعد", body: "أنشئ برنامجاً من تبويب «البرامج»، ثم انشره هنا." }}
      />

      <Modal open={hiding !== null} title="إخفاء البرنامج" onClose={() => setHiding(null)}>
        <p>
          تُخفى صفحة «{hiding?.name}» عن الزوّار ويتوقّف التسجيل — ومن حفظ رابطها يصل إلى صفحة غير
          موجودة. ويبقى المسجَّلون ورحلاتهم كما هي، ولك أن تنشره ثانيةً متى شئت.
        </p>
        <FormActions>
          <Button onClick={() => setHiding(null)}>إلغاء</Button>
          <Button
            variant="danger"
            pending={busy}
            onClick={() => {
              const row = hiding;
              if (!row) return;
              startTransition(async () => {
                reportAction(await setProgramStatus(row.id, "draft"));
                setHiding(null);
              });
            }}
          >
            أخفِه
          </Button>
        </FormActions>
      </Modal>
    </>
  );
}
