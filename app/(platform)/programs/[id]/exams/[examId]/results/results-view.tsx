"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { Muted, Step, TabHead } from "@/components/shared/steps";
import type { FormState } from "@/lib/auth/form-state";
import { formatDateTime, formatNumber } from "@/lib/format";
import { approveTrack, publishResults, recordTiebreak, unpublishResults, withdrawTrack } from "./actions";
import styles from "./results.module.css";

export type ResultRow = {
  participantId: string;
  name: string;
  registrationNo: number | null;
  /** فارغ في المعتمد — اللقطة لا تحفظ الجلسة. */
  session: string | null;
  percent: number | null;
  outcome: "passed" | "not_passed" | "absent" | "pending";
  candidate: boolean;
  place: number | null;
  prizeLabel: string | null;
  prizeValue: string | null;
  needsTiebreak: boolean;
  tieSize: number;
};

export type TrackResults = {
  id: string;
  name: string;
  qualified: number;
  scored: number;
  pending: number;
  unassigned: number;
  absent: number;
  ties: number;
  places: number;
  prizesProblem: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  changedPrizes: boolean;
  rows: ResultRow[];
};

const OUTCOME: Record<ResultRow["outcome"], string> = {
  passed: "اجتاز",
  not_passed: "لم يجتز",
  absent: "غاب",
  pending: "بانتظار الدرجة",
};
const pct = (n: number) => `${formatNumber(n)}٪`;

type Reasoned = { kind: "withdraw" | "unpublish"; track: TrackResults };
type Tie = { track: TrackResults; percent: number; ordered: ResultRow[] };

export function ResultsView({
  programId,
  examId,
  examName,
  sorted,
  passPercentage,
  awardPercentage,
  thresholdsDiffer,
  canManage,
  canPublish,
  tracks,
}: {
  programId: string;
  examId: string;
  examName: string;
  sorted: boolean;
  passPercentage: number;
  awardPercentage: number | null;
  thresholdsDiffer: boolean;
  canManage: boolean;
  canPublish: boolean;
  tracks: TrackResults[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [reasoned, setReasoned] = useState<Reasoned | null>(null);
  const [reason, setReason] = useState("");
  const [tie, setTie] = useState<Tie | null>(null);
  const [tieReason, setTieReason] = useState("");
  const [tieRaw, setTieRaw] = useState("");

  const run = (work: () => Promise<FormState>) =>
    start(async () => {
      reportAction(await work());
      router.refresh();
    });

  const allApproved = tracks.length > 0 && tracks.every((t) => t.approvedAt !== null);
  const unpublished = tracks.filter((t) => t.approvedAt !== null && t.publishedAt === null).length;
  const anyApproved = tracks.some((t) => t.approvedAt !== null);

  /** الأسهم ترتّب المتعادلين — والأعلى أولاً. */
  const moveTie = (i: number, by: -1 | 1) =>
    setTie((cur) => {
      if (!cur) return cur;
      const next = [...cur.ordered];
      const j = i + by;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...cur, ordered: next };
    });

  return (
    <>
      <TabHead
        title={`نتائج ${examName}`}
        lede={`يجتاز من بلغ ${pct(passPercentage)}، ويُرشَّح للجائزة من بلغ ${awardPercentage === null ? "—" : pct(awardPercentage)}، ويُرتَّب المرشّحون على مراكز جوائز مسارهم كما في صفحة البرنامج. كل تعادلٍ يمسّ المراكز يُحسم بإعادة اختبارٍ تُسجَّل هنا. ثم يُعتمد كل مسار فيُقفل تحكيمه، ويُنشر يوم الحفل.`}
      />

      {thresholdsDiffer ? (
        <p role="status" className={styles.alert}>
          عتبتا الاختبار تختلفان عن عتبتَي البرنامج في بياناته — والحاكم عتبتا الاختبار هنا. وحّدهما ليتّفق المعلَن والممنوح.
        </p>
      ) : null}
      {!sorted ? <Muted>لم يُحسم الفرز بعد — تظهر النتائج بعد الحسم والتحكيم.</Muted> : null}

      <FormActions>
        {canPublish && unpublished > 0 ? (
          <Button variant="primary" disabled={busy || !allApproved} onClick={() => run(() => publishResults(programId, examId, null))}>
            انشر نتائج كل المسارات
          </Button>
        ) : null}
        {anyApproved ? (
          <a className={styles.export} href={`/programs/${programId}/exams/${examId}/results/export`} download>
            صدّر المعتمد (CSV) للتكريم والصرف
          </a>
        ) : null}
      </FormActions>
      {canPublish && unpublished > 0 && !allApproved ? <Muted>النشر معاً يشترط اعتماد كل المسارات — أو انشر المعتمد مساراً مساراً.</Muted> : null}

      {tracks.length === 0 ? <Muted>لا متأهّلين بعد.</Muted> : null}

      {tracks.map((t, i) => {
        const blockers = [
          t.prizesProblem,
          t.unassigned > 0 ? `لم يُسنَد ${formatNumber(t.unassigned)} إلى جلسة` : null,
          t.pending > 0 ? `لم تكتمل درجة ${formatNumber(t.pending)}` : null,
          t.ties > 0 ? `${formatNumber(t.ties)} تعادلٌ يمسّ المراكز بلا حسم` : null,
        ].filter((x): x is string => x !== null);
        const tieGroups = [...new Set(t.rows.filter((r) => r.needsTiebreak && r.percent !== null).map((r) => r.percent!))];
        const columns: Column<ResultRow>[] = [
          { key: "place", header: "المركز", align: "center", render: (r) => (r.place === null ? (r.needsTiebreak ? "تعادل" : "—") : formatNumber(r.place)) },
          { key: "name", header: "المشارك", primary: true, render: (r) => r.name },
          { key: "no", header: "رقم التسجيل", align: "end", render: (r) => (r.registrationNo === null ? "—" : formatNumber(r.registrationNo)) },
          ...(t.approvedAt === null ? [{ key: "session", header: "الجلسة", render: (r: ResultRow) => r.session ?? "لم يُسنَد" }] : []),
          { key: "pct", header: "الدرجة", align: "end", render: (r) => (r.percent === null ? "—" : pct(r.percent)) },
          { key: "outcome", header: "النتيجة", render: (r) => `${OUTCOME[r.outcome]}${r.candidate && r.place === null && !r.needsTiebreak ? " · مرشّح" : ""}` },
          { key: "prize", header: "الجائزة", render: (r) => (r.prizeLabel ? `${r.prizeLabel}: ${r.prizeValue}` : "—") },
        ];
        return (
          <Step
            key={t.id}
            n={i + 1}
            title={t.name}
            why={`${formatNumber(t.places)} ${t.places === 1 ? "مركز" : "مراكز"} جوائز · ${formatNumber(t.qualified)} متأهّلاً · ${formatNumber(t.scored)} بدرجةٍ مكتملة${t.absent > 0 ? ` · ${formatNumber(t.absent)} غائباً` : ""}`}
            done={t.publishedAt !== null}
            state={
              <span>
                {t.publishedAt
                  ? `نُشرت ${formatDateTime(t.publishedAt)}`
                  : t.approvedAt
                    ? `اعتُمدت ${formatDateTime(t.approvedAt)} — لم تُنشر`
                    : blockers.length > 0
                      ? "لم تكتمل شروط الاعتماد"
                      : "جاهزة للاعتماد"}
              </span>
            }
          >
            {t.approvedAt === null && blockers.length > 0 ? (
              <ul className={styles.blockers}>
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            {t.approvedAt !== null && t.changedPrizes ? (
              <p role="status" className={styles.alert}>
                تغيّر عنصر جوائز المسار في الصفحة بعد الاعتماد — الممنوح ما اعتُمد. وحّد الصفحة، أو اسحب الاعتماد وأعده.
              </p>
            ) : null}

            {canManage && t.approvedAt === null
              ? tieGroups.map((p) => (
                  <p key={p} className={styles.tie}>
                    تعادلٌ على {pct(p)} بين {formatNumber(t.rows.filter((r) => r.percent === p && r.candidate).length)} يمسّ المراكز.{" "}
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => setTie({ track: t, percent: p, ordered: t.rows.filter((r) => r.percent === p && r.candidate) })}
                    >
                      سجّل نتيجة إعادة الاختبار
                    </button>
                  </p>
                ))
              : null}

            <DataTable
              columns={columns}
              rows={t.rows}
              rowKey={(r) => r.participantId}
              total={t.rows.length}
              page={1}
              pageSize={Math.max(t.rows.length, 1)}
              empty={{ title: "لا متأهّلين", body: "" }}
            />

            <FormActions>
              {canManage && t.approvedAt === null ? (
                <Button variant="primary" disabled={busy || blockers.length > 0} onClick={() => run(() => approveTrack(programId, examId, t.id))}>
                  اعتمد نتائج المسار
                </Button>
              ) : null}
              {canManage && t.approvedAt !== null && t.publishedAt === null ? (
                <Button disabled={busy} onClick={() => setReasoned({ kind: "withdraw", track: t })}>
                  اسحب الاعتماد
                </Button>
              ) : null}
              {canPublish && t.approvedAt !== null && t.publishedAt === null ? (
                <Button variant="primary" disabled={busy} onClick={() => run(() => publishResults(programId, examId, t.id))}>
                  انشر نتائج المسار
                </Button>
              ) : null}
              {canPublish && t.publishedAt !== null ? (
                <Button variant="danger" disabled={busy} onClick={() => setReasoned({ kind: "unpublish", track: t })}>
                  اسحب النشر
                </Button>
              ) : null}
            </FormActions>
          </Step>
        );
      })}

      <Modal
        open={reasoned !== null}
        title={reasoned?.kind === "withdraw" ? "سحب الاعتماد" : "سحب النشر"}
        onClose={() => setReasoned(null)}
      >
        <p>
          {reasoned?.kind === "withdraw"
            ? `يُفتح تحكيم ${reasoned?.track.name} للتصحيح، ثم يُعتمد ثانية. ويُسجَّل السبب.`
            : `تغيب نتائج ${reasoned?.track.name} عن المشاركين، وتعود حالتهم «متأهل». ويُسجَّل السبب.`}
        </p>
        <Field id="resultsReason" label="السبب" required>
          <Input id="resultsReason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          pending={busy}
          disabled={reason.trim().length < 3}
          onClick={() => {
            const r = reasoned!;
            setReasoned(null);
            setReason("");
            run(() =>
              r.kind === "withdraw"
                ? withdrawTrack(programId, examId, r.track.id, reason)
                : unpublishResults(programId, examId, r.track.id, reason),
            );
          }}
        >
          {reasoned?.kind === "withdraw" ? "اسحب الاعتماد" : "اسحب النشر"}
        </Button>
      </Modal>

      <Modal open={tie !== null} title="جولة حسم التعادل" onClose={() => setTie(null)}>
        <p>
          رتّب المتعادلين على {tie ? pct(tie.percent) : ""} كما خرجت إعادة الاختبار — الأعلى أولاً. الترتيب لا يغيّر درجاتهم، ويبطل
          إن تغيّرت مجموعة المتعادلين بعده.
        </p>
        <ol className={styles.order}>
          {tie?.ordered.map((r, i) => (
            <li key={r.participantId} className={styles.orderRow}>
              <span>{r.name}</span>
              <span className={styles.arrows}>
                <button type="button" className={styles.arrow} aria-label={`ارفع ${r.name}`} disabled={i === 0} onClick={() => moveTie(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.arrow}
                  aria-label={`أنزل ${r.name}`}
                  disabled={i === (tie?.ordered.length ?? 0) - 1}
                  onClick={() => moveTie(i, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
        <Field id="tieReason" label="وصف الجولة" required hint="متى أُعيد الاختبار، وبأي لجنة.">
          <Input id="tieReason" value={tieReason} onChange={(e) => setTieReason(e.target.value)} placeholder="إعادة اختبار ١٢ ديسمبر — اللجنة الأولى" />
        </Field>
        <Field id="tieRaw" label="درجات الإعادة" hint="اختياري — للتوثيق.">
          <Input id="tieRaw" value={tieRaw} onChange={(e) => setTieRaw(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          pending={busy}
          disabled={tieReason.trim().length < 3}
          onClick={() => {
            const t = tie!;
            setTie(null);
            setTieReason("");
            setTieRaw("");
            run(() =>
              recordTiebreak(
                programId,
                examId,
                t.track.id,
                t.percent,
                t.ordered.map((r) => r.participantId),
                tieReason,
                tieRaw,
              ),
            );
          }}
        >
          سجّل الحسم
        </Button>
      </Modal>
    </>
  );
}
