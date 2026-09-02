"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth, formatNumber, formatPercent } from "@/lib/format";
import {
  decideTrackChange,
  requestTrackChange,
  setParticipantStatus,
} from "../participant-actions";

export type ParticipantRow = {
  id: string;
  name: string;
  trackName: string;
  status: string;
  joinedAt: string;
  baseline: number | null;
  /** أيام أُرسلت — متابعة تشغيلية لا إحصاء. */
  submittedDays: number;
  /** أيام العمل في خطة مساره. صفر = لا خطة بعد. */
  workDays: number;
};

export type ChangeRow = {
  id: string;
  participantName: string;
  fromTrack: string;
  toTrack: string;
  direction: "up" | "down";
  reason: string;
  baseline: number;
  status: "pending" | "approved" | "rejected";
};

export const STATUS_LABEL: Record<string, string> = {
  registered: "مسجَّل",
  memorizing: "حافظ",
  qualified: "مؤهَّل",
  not_qualified: "غير مؤهَّل",
  passed: "مجتاز",
  not_passed: "لم يجتز",
};

const REQUEST_LABEL: Record<ChangeRow["status"], string> = {
  pending: "معلَّق",
  approved: "مقبول",
  rejected: "مرفوض",
};

const PANEL = { maxInlineSize: "34rem", marginBlockEnd: "var(--space-8)" } as const;
const H2 = { fontSize: "var(--text-lg)", marginBlockStart: "var(--space-10)" } as const;
const ERR = { color: "var(--color-danger)" } as const;
const OK = { color: "var(--color-success)" } as const;
const NOTE = { fontSize: "var(--text-sm)", color: "var(--color-text-muted)" } as const;

export function ParticipantsView({
  programId,
  programName,
  participants,
  requests,
  tracks,
  canWrite,
}: {
  programId: string;
  programName: string;
  participants: ParticipantRow[];
  requests: ChangeRow[];
  tracks: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(requestTrackChange, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const columns: Column<ParticipantRow>[] = [
    { key: "name", header: "المشارك", sortable: true, primary: true, render: (p) => p.name },
    { key: "track", header: "المسار", sortable: true, render: (p) => p.trackName },
    {
      key: "progress",
      header: "الإرسال",
      align: "end",
      sortable: true,
      render: (p) =>
        p.workDays === 0
          ? "لا خطة"
          : `${formatNumber(p.submittedDays)} من ${formatNumber(p.workDays)}`,
    },
    {
      key: "status",
      header: "الحالة",
      align: "center",
      render: (p) =>
        canWrite ? (
          <Select
            aria-label="حالة المشارك"
            value={p.status}
            onChange={(e) =>
              startTransition(async () => {
                await setParticipantStatus(
                  p.id,
                  programId,
                  e.target.value as ParticipantRow["status"] as never,
                );
              })
            }
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        ) : (
          (STATUS_LABEL[p.status] ?? p.status)
        ),
    },
    {
      key: "baseline",
      header: "نقطة الانطلاق",
      align: "end",
      render: (p) => (p.baseline === null ? "—" : formatPercent(p.baseline / 100)),
    },
    { key: "joined", header: "منذ", render: (p) => formatDateBoth(p.joinedAt) },
  ];

  const requestColumns: Column<ChangeRow>[] = [
    {
      key: "participant",
      header: "المشارك",
      sortable: true,
      primary: true,
      render: (r) => r.participantName,
    },
    {
      key: "move",
      header: "التحويل",
      render: (r) => `${r.fromTrack} ← ${r.toTrack}`,
    },
    {
      key: "direction",
      header: "الاتجاه",
      align: "center",
      render: (r) => (r.direction === "up" ? "صعود" : "نزول"),
    },
    { key: "reason", header: "السبب", render: (r) => r.reason },
    {
      key: "baseline",
      header: "نقطة الانطلاق",
      align: "end",
      render: (r) => formatPercent(r.baseline / 100),
    },
    {
      key: "status",
      header: "الحالة",
      align: "center",
      render: (r) => REQUEST_LABEL[r.status],
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "end" as const,
            render: (r: ChangeRow) =>
              r.status === "pending" ? (
                <span style={{ display: "flex", gap: "var(--space-2)" }}>
                  <Button
                    variant="primary"
                    pending={busy}
                    onClick={() =>
                      startTransition(
                        async () => void (await decideTrackChange(r.id, programId, "approved")),
                      )
                    }
                  >
                    قبول
                  </Button>
                  <Button
                    pending={busy}
                    onClick={() =>
                      startTransition(
                        async () => void (await decideTrackChange(r.id, programId, "rejected")),
                      )
                    }
                  >
                    رفض
                  </Button>
                </span>
              ) : (
                "—"
              ),
          },
        ]
      : []),
  ];

  return (
    <>
      <p style={{ fontSize: "var(--text-sm)" }}>
        <Link href={`/programs/${programId}`}>{programName}</Link>
      </p>
      <h1>المشاركون</h1>

      <DataTable
        columns={columns}
        rows={participants}
        rowKey={(p) => p.id}
        total={participants.length}
        page={1}
        searchPlaceholder="ابحث باسم المشارك…"
        empty={{ title: "لا مشاركون بعد", body: "لم يسجّل أحد في هذا البرنامج." }}
      />

      <h2 style={H2}>طلبات تغيير المسار</h2>
      <p style={NOTE}>
        قرار إداري بتقدير بشري: لا تبديل ذاتي، ولا معادلة آلية للنسبة. وبعد القبول
        تصير النسبة نقطة انطلاق فقط، ثم يُحسب المشارك بالآلية العادية.
      </p>

      {canWrite && participants.length > 0 && tracks.length > 1 ? (
        <section style={PANEL}>
          {state.error ? <p style={ERR}>{state.error}</p> : null}
          {state.notice ? <p style={OK}>{state.notice}</p> : null}

          <form action={action}>
            <input type="hidden" name="programId" value={programId} />

            <Field id="participantId" label="المشارك" required>
              <Select id="participantId" name="participantId" required defaultValue="">
                <option value="" disabled>
                  اختر مشاركاً
                </option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.trackName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="toTrackId" label="المسار الجديد" required error={state.fieldErrors?.["toTrackId"]}>
              <Select id="toTrackId" name="toTrackId" required defaultValue="">
                <option value="" disabled>
                  اختر مساراً
                </option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="reason" label="السبب" required error={state.fieldErrors?.["reason"]}>
              <Textarea id="reason" name="reason" rows={2} required />
            </Field>

            <Field
              id="baselinePercentage"
              label="نقطة الانطلاق"
              required
              hint="نسبة تقديرية من ٠ إلى ١٠٠ — تُدخلها الإدارة، ولا تُحسب آلياً"
              error={state.fieldErrors?.["baselinePercentage"]}
            >
              <Input id="baselinePercentage" name="baselinePercentage" numeric latin required />
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                إنشاء الطلب
              </Button>
            </FormActions>
          </form>
        </section>
      ) : null}

      <DataTable
        columns={requestColumns}
        rows={requests}
        rowKey={(r) => r.id}
        total={requests.length}
        page={1}
        searchPlaceholder="ابحث باسم المشارك…"
        empty={{ title: "لا طلبات", body: "لم يُنشأ طلب تغيير مسار بعد." }}
      />
    </>
  );
}
