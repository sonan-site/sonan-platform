"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select } from "@/components/shared/form";
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

const PANEL = { maxInlineSize: "34rem", marginBlockEnd: "var(--space-8)" } as const;
const H2 = { fontSize: "var(--text-lg)", marginBlockStart: "var(--space-10)" } as const;
const ERR = { color: "var(--color-danger)" } as const;
const OK = { color: "var(--color-success)" } as const;
const NOTE = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  marginBlockEnd: "var(--space-4)",
  maxInlineSize: "68ch",
} as const;

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
      <p style={{ fontSize: "var(--text-sm)", display: "flex", gap: "var(--space-4)" }}>
        <Link href="/programs">البرامج</Link>
        <Link href={`/programs/${programId}`}>{programName}</Link>
      </p>
      <h1>خطط المسارات</h1>
      <p style={NOTE}>
        الخطة قائمة أيام مرتّبة لكل مسار — لا تاريخ فيها، ورقم اليوم يُقاس من انضمام المشارك.
        وللمسار خطة واحدة.
      </p>

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

      <h2 style={H2}>خطة جديدة</h2>
      {withoutPlan.length === 0 ? (
        <p style={NOTE}>كل مسار في هذا البرنامج له خطة.</p>
      ) : (
        <form action={action} style={PANEL}>
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

          {state.error ? <p style={ERR}>{state.error}</p> : null}
          {state.notice ? <p style={OK}>{state.notice}</p> : null}
        </form>
      )}
    </>
  );
}
