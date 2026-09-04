"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select } from "@/components/shared/form";
import { Messages, PageHead, Step, StepForm } from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { createPlan } from "./actions";

export type TrackPlanRow = {
  trackId: string;
  trackName: string;
  planId: string | null;
  planName: string | null;
  dayCount: number;
};


export function PlansView({
  programId,
  programName,
  rows,
}: {
  programId: string;
  programName: string;
  rows: TrackPlanRow[];
}) {
  const [state, action, pending] = useActionState(createPlan, EMPTY_FORM_STATE);

  const withoutPlan = rows.filter((r) => r.planId === null);

  const columns: Column<TrackPlanRow>[] = [
    { key: "track", header: "المسار", sortable: true, primary: true, render: (r) => r.trackName },
    {
      key: "plan",
      header: "الخطة",
      render: (r) =>
        r.planId ? (
          <Link href={`/programs/${programId}/plans/${r.planId}`}>{r.planName}</Link>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>بلا خطة</span>
        ),
    },
    {
      key: "days",
      header: "عدد الأيام",
      align: "end",
      sortable: true,
      render: (r) => (r.planId ? formatNumber(r.dayCount) : "—"),
    },
  ];

  return (
    <>
      <PageHead
        crumbs={[
          { href: "/programs", label: "البرامج" },
          { href: `/programs/${programId}`, label: programName },
        ]}
        title="خطط المسارات"
        lede="الخطة قائمة أيام مرتّبة لكل مسار. لا تاريخ فيها — كل مشارك يبدأ من يومه الأول أياً كان تاريخ انضمامه. وللمسار خطة واحدة."
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.trackId}
        total={rows.length}
        page={1}
        empty={{
          title: "لا مسارات في هذا البرنامج",
          body: "أضِف مساراً من صفحة البرنامج، ثم ابنِ خطته هنا.",
        }}
      />

      <Step
        n={1}
        title="خطة جديدة"
        why="لكل مسار خطته، لأن نصيبه من المادة يختلف. وتبقى قابلة للتعديل بعد بنائها."
        done={withoutPlan.length === 0 && rows.length > 0}
        state={
          rows.length === 0 ? (
            <span>لا مسارات في هذا البرنامج بعد.</span>
          ) : withoutPlan.length === 0 ? (
            <span>كل مسار له خطة.</span>
          ) : (
            <span>{formatNumber(withoutPlan.length)} مساراً بلا خطة</span>
          )
        }
      >
        {withoutPlan.length === 0 ? null : (
        <StepForm title="أنشئ خطة" action={action}>
          <input type="hidden" name="programId" value={programId} />

          <Field id="trackId" label="المسار" required error={state.fieldErrors?.trackId}>
            <Select id="trackId" name="trackId" required defaultValue="">
              <option value="" disabled>
                اختر مساراً
              </option>
              {withoutPlan.map((r) => (
                <option key={r.trackId} value={r.trackId}>
                  {r.trackName}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="name" label="اسم الخطة" required error={state.fieldErrors?.name}>
            <Input id="name" name="name" required defaultValue="الخطة الأساسية" />
          </Field>

          <FormActions>
            <Button type="submit" pending={pending}>
              إنشاء
            </Button>
          </FormActions>

          <Messages state={state} />
        </StepForm>
        )}
      </Step>
    </>
  );
}
