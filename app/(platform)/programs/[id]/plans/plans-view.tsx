"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, FormActions } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { Muted, Step, TabHead } from "@/components/shared/steps";
import { formatNumber } from "@/lib/format";
import { createDefaultPlan, customizeTrackPlan, revertTrackPlan } from "./actions";
import styles from "./plans.module.css";

export type PlanSummary = {
  id: string;
  trackId: string | null;
  name: string;
  dayCount: number;
  lockedThrough: number;
  issues: { trackId: string | null; severity: "error" | "warning"; message: string }[];
};

export type TrackPlanRow = {
  trackId: string;
  trackName: string;
  /** خطته المخصّصة — وبلا مخصّصة يرث الافتراضية. */
  custom: PlanSummary | null;
  planId: string | null;
  dayCount: number;
  errors: number;
  warnings: string[];
};

export function PlansView({
  programId,
  defaultPlan,
  rows,
}: {
  programId: string;
  defaultPlan: PlanSummary | null;
  rows: TrackPlanRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [customizing, setCustomizing] = useState<TrackPlanRow | null>(null);

  const base = `/programs/${programId}/plans`;
  const defaultErrors = defaultPlan?.issues.filter((i) => i.severity === "error").length ?? 0;

  const columns: Column<TrackPlanRow>[] = [
    { key: "track", header: "المسار", primary: true, render: (r) => r.trackName },
    {
      key: "plan",
      header: "خطته",
      render: (r) =>
        r.custom ? (
          <Link href={`${base}/${r.custom.id}`}>مخصّصة — {r.custom.name}</Link>
        ) : defaultPlan ? (
          <span>يرث الافتراضية</span>
        ) : (
          <Muted>بلا خطة</Muted>
        ),
    },
    {
      key: "days",
      header: "الأيام",
      align: "end",
      render: (r) => (r.planId ? formatNumber(r.dayCount) : "—"),
    },
    {
      key: "state",
      header: "الحالة",
      render: (r) =>
        !r.planId || r.dayCount === 0 ? (
          <span className={styles.warn}>بلا أيام</span>
        ) : r.errors > 0 ? (
          <span className={styles.bad}>{formatNumber(r.errors)} ملاحظات تمنع الحفظ</span>
        ) : r.warnings.length > 0 ? (
          <span className={styles.warn} title={r.warnings.join("\n")}>
            {r.warnings[0]}
          </span>
        ) : (
          <span className={styles.ok}>سليمة</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (r) =>
        r.custom ? (
          <Button
            disabled={busy || r.custom.lockedThrough > 0}
            title={r.custom.lockedThrough > 0 ? "أتمّ مشاركون أياماً منها" : undefined}
            onClick={() =>
              startTransition(async () => reportAction(await revertTrackPlan(programId, r.custom!.id)))
            }
          >
            الرجوع للافتراضية
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => setCustomizing(r)}>
            خطة مخصّصة
          </Button>
        ),
    },
  ];

  return (
    <>
      <TabHead
        title="الخطط"
        lede="الخطة أيامٌ مرقّمة بلا تواريخ، في كل يوم قيمةٌ لكل حقل. للبرنامج خطة افتراضية يرثها كل مسار، ولأي مسار خطة مخصّصة تحلّ محلّها فيه."
      />

      <Step
        n={1}
        title="الخطة الافتراضية"
        why="تُبنى مرة ويرثها كل مسار. وتُفحص على نصيب كل مسار يستعملها — فإن اختلفت أحجام الأنصبة احتاج المسار خطة مخصّصة."
        done={Boolean(defaultPlan && defaultPlan.dayCount > 0 && defaultErrors === 0)}
        state={
          !defaultPlan ? (
            <span>لم تُنشأ بعد.</span>
          ) : (
            <span>
              {formatNumber(defaultPlan.dayCount)} يوماً
              {defaultPlan.lockedThrough > 0 ? ` · المقفل 1–${formatNumber(defaultPlan.lockedThrough)}` : ""}
              {defaultErrors > 0 ? ` · ${formatNumber(defaultErrors)} ملاحظات تمنع الحفظ` : ""}
            </span>
          )
        }
      >
        {defaultPlan ? (
          <FormActions>
            <Link className={styles.open} href={`${base}/${defaultPlan.id}`}>
              افتح الخطة الافتراضية
            </Link>
          </FormActions>
        ) : (
          <FormActions>
            <Button
              variant="primary"
              pending={busy}
              onClick={() =>
                startTransition(async () => {
                  const result = await createDefaultPlan(programId);
                  reportAction(result);
                  if (result.planId) router.push(`${base}/${result.planId}`);
                })
              }
            >
              أنشئ الخطة الافتراضية
            </Button>
          </FormActions>
        )}
        {defaultPlan && defaultPlan.issues.length > 0 ? (
          <ul className={styles.issues}>
            {defaultPlan.issues.slice(0, 6).map((issue, i) => (
              <li key={i} className={issue.severity === "error" ? styles.bad : styles.warn}>
                {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </Step>

      <Step
        n={2}
        title="خطة كل مسار"
        why="المسار يرث الافتراضية ما لم تُخصَّص له خطة. والخطة الفعلية لمسارٍ أتمّ أحد مشاركيه يوماً منها لا تتغيّر."
        done={rows.length > 0 && rows.every((r) => r.planId && r.dayCount > 0 && r.errors === 0)}
        state={
          rows.length === 0 ? (
            <span>لا مسارات بعد — أضِفها من تبويب المسارات.</span>
          ) : (
            <span>
              {formatNumber(rows.filter((r) => r.custom).length)} مخصّصة من {formatNumber(rows.length)} مسارات
            </span>
          )
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.trackId}
          total={rows.length}
          page={1}
          empty={{ title: "لا مسارات", body: "أضِف مسارات البرنامج أولاً." }}
        />
      </Step>

      <Modal open={customizing !== null} title="خطة مخصّصة" onClose={() => setCustomizing(null)}>
        <p>
          تحلّ خطةٌ مخصّصة محلّ الافتراضية في «{customizing?.trackName}» وحده. ابدأها بنسخ الافتراضية ثم
          عدّل ما يختلف، أو ابدأها فارغة.
        </p>
        <FormActions>
          <Button
            variant="primary"
            pending={busy}
            disabled={!defaultPlan}
            onClick={() => {
              const target = customizing;
              if (!target) return;
              setCustomizing(null);
              startTransition(async () => {
                const result = await customizeTrackPlan(programId, target.trackId, true);
                reportAction(result);
                if (result.planId) router.push(`${base}/${result.planId}`);
              });
            }}
          >
            انسخ الافتراضية
          </Button>
          <Button
            onClick={() => {
              const target = customizing;
              if (!target) return;
              setCustomizing(null);
              startTransition(async () => {
                const result = await customizeTrackPlan(programId, target.trackId, false);
                reportAction(result);
                if (result.planId) router.push(`${base}/${result.planId}`);
              });
            }}
          >
            ابدأ فارغة
          </Button>
        </FormActions>
      </Modal>
    </>
  );
}
