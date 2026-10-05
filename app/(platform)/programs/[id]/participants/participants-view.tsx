"use client";

import { Plus } from "lucide-react";
import { reportAction } from "@/components/shared/action-notice";
import { useActionState, useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Modal } from "@/components/shared/modal";
import { ScreenActions } from "@/components/shared/screen-actions";
import { Messages, TabHead, Step, StepForm } from "@/components/shared/steps";
import {
  PARTICIPANT_STATUS_LABEL,
  statusesOf,
  type ProgramKind,
} from "@/lib/programs/kinds";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth, formatNumber, formatPercent } from "@/lib/format";
import { daysText } from "@/lib/participants/journey";
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
  /** أيام خطة مساره. صفر = لا خطة بعد. */
  dayCount: number;
  /** أيام الخطة التي أتمّها في مساره الحالي. */
  doneDays: number;
  /** أيام البرنامج التي انقضى وقت رصدها — موعده. */
  dueDays: number;
  /** أيامٌ حُكم عليه فيها بالتعثّر (`adr/0041`)، ومنها ما عُوِّض. */
  stumbledDays: number;
  compensatedDays: number;
  /** أيامه في مساراتٍ قبل الحالي — لا تُمحى بنقله. */
  priorDoneDays: number;
  /** يتبع الخطة الآن — لمن انتهت رحلته لا موعد. */
  followsPlan: boolean;
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
  /** أيام سجلّه كلها — تبقى بعد النقل. */
  recordDays: number;
  /** المسار المطلوب سبق له فيه: يُكمل من حيث توقّف. */
  returning: boolean;
  /** `null` = لا تُعرف (لا صلاحية لقراءة الخطط والمادة). */
  targetHasPlan: boolean | null;
  targetHasContent: boolean | null;
};

const REQUEST_LABEL: Record<ChangeRow["status"], string> = {
  pending: "معلَّق",
  approved: "مقبول",
  rejected: "مرفوض",
};


export function ParticipantsView({
  programId,
  kind,
  participants,
  requests,
  tracks,
  canWrite,
}: {
  programId: string;
  kind: ProgramKind;
  participants: ParticipantRow[];
  requests: ChangeRow[];
  tracks: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(requestTrackChange, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  // الطلب الذي فُتحت نافذة قبوله.
  const [confirming, setConfirming] = useState<ChangeRow | null>(null);

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
      header: "يوم الخطة",
      align: "end",
      sortable: true,
      render: (p) =>
        withPrior(
          p.dayCount === 0 ? "لا خطة" : `أتمّ ${formatNumber(p.doneDays)} من ${formatNumber(p.dayCount)}`,
          p.priorDoneDays,
        ),
    },
    {
      key: "pace",
      header: "الموعد",
      align: "center",
      render: (p) => paceText(p),
    },
    {
      key: "stumbled",
      header: "التعثّر",
      align: "end",
      // المعوَّض يبقى تعثّراً لا يُمحى — ويُذكر ليُرى من عاد إلى موعده.
      render: (p) =>
        p.stumbledDays === 0
          ? "—"
          : `${formatNumber(p.stumbledDays)}${p.compensatedDays > 0 ? ` (عُوِّض ${formatNumber(p.compensatedDays)})` : ""}`,
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
                  <Button variant="primary" pending={busy} onClick={() => setConfirming(r)}>
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

  const canRequest = canWrite && participants.length > 0 && tracks.length > 1;
  // طلب النقل حدثٌ نادر لا عملُ الشاشة الأول — فمطويٌّ حتى يُطلب (`ق-٢٤`).
  const [requesting, setRequesting] = useState(false);

  return (
    <>
      {canRequest ? (
        <ScreenActions>
          <Button aria-expanded={requesting} onClick={() => setRequesting(!requesting)}>
            <Plus size={16} aria-hidden />
            سجّل طلب نقل
          </Button>
        </ScreenActions>
      ) : null}

      <TabHead title="المشاركون" lede="من سجّل في البرنامج، ومساره، وكم يوماً أرسل من خطته، وكم منها أتمّه كاملاً. ومنها تُبتّ طلبات تغيير المسار." />

      <Modal
        open={confirming !== null}
        title="قبول تغيير المسار"
        onClose={() => setConfirming(null)}
      >
        {confirming ? (
          <>
            <p>
              <strong>{confirming.participantName}</strong>: {confirming.fromTrack} ← {confirming.toTrack}
            </p>
            <p>
              {confirming.returning
                ? `سبق له في «${confirming.toTrack}»، فيُكمل فيه من حيث توقّف.`
                : `مادة «${confirming.toTrack}» تبدأ له من يومها الأول.`}{" "}
              {confirming.recordDays > 0
                ? `وسجلّه باقٍ ظاهر: ${formatNumber(confirming.recordDays)} يوماً.`
                : null}
            </p>
            {confirming.targetHasPlan === false ? (
              <p>تنبيه: لا خطة لهذا المسار بعد، فلا واجب يظهر له حتى تُبنى.</p>
            ) : confirming.targetHasContent === false ? (
              <p>تنبيه: لا مادة محدَّدة لهذا المسار بعد، فلا يُرسل واجباً حتى تُحدَّد.</p>
            ) : null}
            <FormActions>
              <Button onClick={() => setConfirming(null)}>إلغاء</Button>
              <Button
                variant="primary"
                pending={busy}
                onClick={() => {
                  const request = confirming;
                  startTransition(async () => {
                    reportAction(await decideTrackChange(request.id, programId, "approved"));
                    setConfirming(null);
                  });
                }}
              >
                انقله
              </Button>
            </FormActions>
          </>
        ) : null}
      </Modal>

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
        {canRequest && requesting ? (
          <StepForm title="سجّل طلباً" action={action} state={state}>
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

            <Field id="reason" label="السبب" required error={state.fieldErrors?.["reason"]} span="full">
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

/** موعده: أيام البرنامج التي انقضى وقتها مقابل ما أتمّه — «في موعده» · «متأخر ٣ أيام». */
function paceText(p: ParticipantRow): string {
  if (!p.followsPlan || p.dayCount === 0 || p.doneDays >= p.dayCount) return "—";
  const lag = p.dueDays - p.doneDays;
  if (lag > 0) return `متأخر ${daysText(lag)}`;
  if (lag < 0) return `متقدّم ${daysText(-lag)}`;
  return "في موعده";
}

/** الرقم الحالي، ومعه ما جاء من مسارٍ سابق إن وُجد. */
function withPrior(current: string, prior: number): string {
  return prior > 0 ? `${current} · +${formatNumber(prior)} سابقاً` : current;
}
