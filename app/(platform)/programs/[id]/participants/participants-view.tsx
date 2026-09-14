"use client";

import { reportAction } from "@/components/shared/action-notice";
import { useActionState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Messages, PageHead, Step, StepForm } from "@/components/shared/steps";
import {
  PARTICIPANT_STATUS_LABEL,
  statusesOf,
  type ProgramKind,
} from "@/lib/programs/kinds";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth, formatNumber, formatPercent } from "@/lib/format";
import {
  assignTrack,
  decideTrackChange,
  requestTrackChange,
  setParticipantStatus,
} from "../participant-actions";

export type ParticipantRow = {
  id: string;
  name: string;
  trackName: string;
  hasTrack: boolean;
  status: string;
  joinedAt: string;
  baseline: number | null;
  /** أيام أُرسلت — متابعة تشغيلية لا إحصاء. */
  submittedDays: number;
  /** ما أُتمّت واجباته كلها من المُرسَل. */
  completeDays: number;
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

const REQUEST_LABEL: Record<ChangeRow["status"], string> = {
  pending: "معلَّق",
  approved: "مقبول",
  rejected: "مرفوض",
};


export function ParticipantsView({
  programId,
  programName,
  kind,
  participants,
  requests,
  tracks,
  canWrite,
}: {
  programId: string;
  programName: string;
  kind: ProgramKind;
  participants: ParticipantRow[];
  requests: ChangeRow[];
  tracks: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(requestTrackChange, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const columns: Column<ParticipantRow>[] = [
    { key: "name", header: "المشارك", sortable: true, primary: true, render: (p) => p.name },
    {
      key: "track",
      header: "المسار",
      sortable: true,
      render: (p) =>
        // المسار يُسنَد لمن لا مسار له وحده. تغيير مسارٍ قائم يمرّ بطلب تغيير المسار.
        p.hasTrack || !canWrite || tracks.length === 0 ? (
          p.trackName
        ) : (
          <Select
            aria-label={`إسناد مسار لـ ${p.name}`}
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const trackId = e.target.value;
              if (!trackId) return;
              startTransition(async () => reportAction(await assignTrack(p.id, trackId, programId)));
            }}
          >
            <option value="" disabled>
              أسنِد مساراً
            </option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        ),
    },
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
      key: "complete",
      header: "المكتمل",
      align: "end",
      // المُرسَل فارغاً أو ناقصاً لا يُحسب هنا — فيظهر من يُرسل ولا يحفظ.
      render: (p) =>
        p.submittedDays === 0 ? "—" : `${formatNumber(p.completeDays)} من ${formatNumber(p.submittedDays)}`,
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
              startTransition(async () => reportAction(await setParticipantStatus(
                  p.id,
                  programId,
                  e.target.value as ParticipantRow["status"] as never,
                )))
            }
          >
            {/* الحالات المسموحة تتبع نمط البرنامج — والقاعدة ترفض ما عداها. */}
            {statusesOf(kind).map((value) => (
              <option key={value} value={value}>
                {PARTICIPANT_STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        ) : (
          PARTICIPANT_STATUS_LABEL[p.status as keyof typeof PARTICIPANT_STATUS_LABEL] ?? "—"
        ),
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
      header: "تقدير المستوى",
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
                  {/* القبول معطَّل حتى يُحسم أثر النقلة على تقدّم المشارك (م-٤). */}
                  <Button
                    variant="primary"
                    disabled
                    title="غير متاح حتى يُقرَّر ما يحدث لتقدّم المشارك عند نقله"
                  >
                    قبول
                  </Button>
                  <Button
                    pending={busy}
                    onClick={() =>
                      startTransition(
                        async () => reportAction(await decideTrackChange(r.id, programId, "rejected")),
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
      <PageHead
        crumbs={[
          { href: "/programs", label: "البرامج" },
          { href: `/programs/${programId}`, label: programName },
        ]}
        title="المشاركون"
        lede="من سجّل في البرنامج، ومساره، وكم يوماً أرسل من خطته، وكم منها أتمّه كاملاً. ومنها تُبتّ طلبات تغيير المسار."
      />

      <DataTable
        columns={columns}
        rows={participants}
        rowKey={(p) => p.id}
        total={participants.length}
        page={1}
        searchPlaceholder="ابحث باسم المشارك…"
        empty={{ title: "لا مشاركون بعد", body: "لم يسجّل أحد في هذا البرنامج." }}
      />

      <Step
        n={1}
        title="طلبات تغيير المسار"
        why="يسجّل المُعِدّ طلب نقل المشارك إلى مسار آخر مع سببه. ولا يبدّل المشارك مساره بنفسه."
        done={requests.length === 0}
        state={
          requests.length === 0 ? (
            <span>لا طلبات معلَّقة.</span>
          ) : (
            <span>{formatNumber(requests.length)} طلباً</span>
          )
        }
      >
        {canWrite && participants.length > 0 && tracks.length > 1 ? (
          <StepForm title="سجّل طلباً" action={action}>
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
              label="تقدير مستواه (٪)"
              required
              hint="من ٠ إلى ١٠٠ بحسب تقديرك"
              error={state.fieldErrors?.["baselinePercentage"]}
            >
              <Input id="baselinePercentage" name="baselinePercentage" numeric latin required />
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                أنشئ الطلب
              </Button>
            </FormActions>
            <Messages state={state} />
          </StepForm>
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
      </Step>
    </>
  );
}
