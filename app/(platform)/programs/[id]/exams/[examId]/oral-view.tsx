"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { Card, Cards, ChipButton, Chips, Messages, Muted, Step, StepForm, TabHead } from "@/components/shared/steps";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { formatDateTime, formatNumber, now } from "@/lib/format";
import {
  applySorting,
  archiveSession,
  createSession,
  distribute,
  moveParticipant,
  reopenEvaluation,
  setJudge,
} from "./actions";
import styles from "./oral.module.css";

export type EligibilityRow = {
  participantId: string;
  name: string;
  registrationNo: number | null;
  trackId: string | null;
  status: string;
  percent: number;
  prerequisitePassed: boolean;
  eligible: boolean;
};

export type EvaluationRow = {
  participantId: string;
  judgeId: string;
  judgeName: string;
  evaluated: number;
  total: number;
  approved: boolean;
  retroactive: boolean;
};

export type SessionCard = {
  id: string;
  name: string;
  scheduledAt: string;
  location: string;
  status: "scheduled" | "in_progress" | "closed";
  judges: string[];
  participants: { id: string; name: string; order: number }[];
  evaluations: EvaluationRow[];
};

export type ScoreRow = {
  participantId: string;
  name: string;
  registrationNo: number | null;
  trackId: string | null;
  session: string;
  judges: number;
  approved: number;
  percent: number | null;
};

type Person = { id: string; name: string };
type Track = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  registered: "مسجَّل",
  memorizing: "في الحفظ",
  qualified: "متأهل",
  not_qualified: "غير متأهل",
};
const SESSION_STATUS = { scheduled: "لم تبدأ", in_progress: "جارية", closed: "أُقفلت" } as const;
const pct = (n: number) => `${formatNumber(n)}٪`;

export function OralView({
  programId,
  examId,
  examName,
  entryPercentage,
  judgeCount,
  eligibilityAt,
  tracks,
  eligibility,
  sessions,
  candidates,
  scores,
}: {
  programId: string;
  examId: string;
  examName: string;
  entryPercentage: number | null;
  judgeCount: number;
  /** لحظة احتساب الإنجاز — الحسم قبلها ممنوع. */
  eligibilityAt: string | null;
  tracks: Track[];
  eligibility: EligibilityRow[];
  sessions: SessionCard[];
  candidates: Person[];
  scores: ScoreRow[];
}) {
  const trackName = (id: string | null) => tracks.find((t) => t.id === id)?.name ?? "—";
  return (
    <>
      <TabHead
        title={examName}
        lede="الفرز مرّةً من الشرطين، ثم الجلسات بلجانها، ثم المتابعة حتى تعتمد اللجان كلها فتظهر الدرجات."
      />
      <SortingStep
        programId={programId}
        examId={examId}
        entryPercentage={entryPercentage}
        eligibilityAt={eligibilityAt}
        rows={eligibility}
        trackName={trackName}
      />
      <SessionsStep
        programId={programId}
        examId={examId}
        judgeCount={judgeCount}
        sessions={sessions}
        candidates={candidates}
      />
      <ScoresStep scores={scores} trackName={trackName} />
    </>
  );
}

// ══ ١ · الفرز ══

function SortingStep({
  programId,
  examId,
  entryPercentage,
  eligibilityAt,
  rows,
  trackName,
}: {
  programId: string;
  examId: string;
  entryPercentage: number | null;
  eligibilityAt: string | null;
  rows: EligibilityRow[];
  trackName: (id: string | null) => string;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const decided = (r: EligibilityRow) => overrides[r.participantId] ?? r.eligible;
  const qualified = rows.filter(decided).length;
  const settled = rows.some((r) => r.status === "qualified" || r.status === "not_qualified");

  const columns: Column<EligibilityRow>[] = [
    { key: "name", header: "المشارك", primary: true, render: (r) => r.name },
    { key: "no", header: "رقم التسجيل", align: "end", render: (r) => (r.registrationNo === null ? "—" : formatNumber(r.registrationNo)) },
    { key: "track", header: "المسار", render: (r) => trackName(r.trackId) },
    { key: "pct", header: "الإنجاز", align: "end", render: (r) => pct(r.percent) },
    { key: "pre", header: "المرحلي", render: (r) => (r.prerequisitePassed ? "اجتاز" : "لم يجتز") },
    { key: "status", header: "الحالة الآن", render: (r) => STATUS_LABEL[r.status] ?? r.status },
    {
      key: "decision",
      header: "القرار",
      render: (r) => (
        <Select
          aria-label={`قرار ${r.name}`}
          value={r.participantId in overrides ? (overrides[r.participantId] ? "yes" : "no") : "auto"}
          onChange={(e) => {
            const v = e.target.value;
            setOverrides((all) => {
              const next = { ...all };
              if (v === "auto") delete next[r.participantId];
              else next[r.participantId] = v === "yes";
              return next;
            });
          }}
        >
          <option value="auto">{r.eligible ? "يتأهل (بالشرطين)" : "لا يتأهل (بالشرطين)"}</option>
          <option value="yes">يتأهل — استثناء</option>
          <option value="no">لا يتأهل — استثناء</option>
        </Select>
      ),
    },
  ];

  return (
    <Step
      n={1}
      title="الفرز"
      why={`يتأهل من أتمّ ${entryPercentage === null ? "خطته" : pct(entryPercentage)} من خطته واجتاز الاختبار الشرط. والاستثناء الإداري يغلب الحساب ويُسجَّل.`}
      done={settled}
      state={
        <span>
          {settled ? "حُسم الفرز — ولك أن تعيد حسمه." : "لم يُحسم بعد."} · {formatNumber(qualified)} من{" "}
          {formatNumber(rows.length)} يتأهلون بالقرار الحالي
        </span>
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.participantId}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        empty={{ title: "لا مشاركين", body: "" }}
      />
      {eligibilityAt === null ? (
        <Muted>حدّد في إعدادات الاختبار يوم احتساب الإنجاز — ولا يُحسم الفرز قبله. وما فوق معاينةٌ بإنجاز اليوم.</Muted>
      ) : new Date(eligibilityAt) > now() ? (
        <Muted>
          يُحسم الفرز بعد {formatDateTime(eligibilityAt)}. وما فوق معاينةٌ بإنجاز اليوم — الحسم يُنهي رحلة من لا يتأهل.
        </Muted>
      ) : (
        <FormActions>
          <Button variant="primary" disabled={rows.length === 0} onClick={() => setConfirming(true)}>
            احسم الفرز
          </Button>
        </FormActions>
      )}
      <Modal open={confirming} title="حسم الفرز" onClose={() => setConfirming(false)}>
        <p>
          يتأهل {formatNumber(qualified)}، ولا يتأهل {formatNumber(rows.length - qualified)}
          {Object.keys(overrides).length > 0 ? `، منهم ${formatNumber(Object.keys(overrides).length)} باستثناء` : ""}. تتغيّر
          حالاتهم الآن ويُسجَّل القرار.
        </p>
        <Button
          variant="primary"
          pending={pending}
          onClick={() =>
            start(async () => {
              reportAction(await applySorting(programId, examId, overrides));
              setConfirming(false);
              setOverrides({});
              router.refresh();
            })
          }
        >
          احسم
        </Button>
      </Modal>
    </Step>
  );
}

// ══ ٢ · الجلسات ══

function SessionsStep({
  programId,
  examId,
  judgeCount,
  sessions,
  candidates,
}: {
  programId: string;
  examId: string;
  judgeCount: number;
  sessions: SessionCard[];
  candidates: Person[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createSession, EMPTY_FORM_STATE);
  const [busy, start] = useTransition();
  const [reopening, setReopening] = useState<{ session: string; row: EvaluationRow } | null>(null);
  const [reason, setReason] = useState("");

  const run = (work: () => Promise<FormState>) =>
    start(async () => {
      reportAction(await work());
      router.refresh();
    });

  const assigned = sessions.reduce((n, s) => n + s.participants.length, 0);
  const judgeName = (id: string) => candidates.find((c) => c.id === id)?.name ?? "محكّم";

  return (
    <Step
      n={2}
      title="الجلسات"
      why={`لكل جلسة لجنتها (${formatNumber(judgeCount)} محكّمين) ومشاركوها بأسئلتهم. المحكّم يقيّم من جواله، والورقة الورقية تُدخل هنا باسم محكّمها.`}
      done={sessions.length > 0 && assigned > 0}
      state={
        <span>
          {formatNumber(sessions.length)} جلسات · {formatNumber(assigned)} مُسنَدون
        </span>
      }
    >
      <FormActions>
        <Button disabled={busy || sessions.length === 0} onClick={() => run(() => distribute(programId, examId))}>
          وزّع المتأهلين غير المُسنَدين
        </Button>
      </FormActions>

      {sessions.length === 0 ? <Muted>أنشئ الجلسات أولاً، ثم وزّع المتأهلين عليها.</Muted> : null}

      <Cards>
        {sessions.map((s) => {
          const others = sessions.filter((x) => x.id !== s.id);
          const free = candidates.filter((c) => !s.judges.includes(c.id));
          return (
            <Card
              key={s.id}
              name={s.name}
              meta={`${formatDateTime(s.scheduledAt)}${s.location ? ` · ${s.location}` : ""} · ${SESSION_STATUS[s.status]}`}
            >
              <p className={styles.label}>اللجنة {s.judges.length < judgeCount ? `— ناقصة (${formatNumber(s.judges.length)} من ${formatNumber(judgeCount)})` : ""}</p>
              <Chips>
                {s.judges.map((j) => (
                  <ChipButton
                    key={j}
                    label={`رفع ${judgeName(j)} من اللجنة`}
                    disabled={busy}
                    onClick={() => run(() => setJudge(programId, examId, s.id, j, false))}
                  >
                    {judgeName(j)} ×
                  </ChipButton>
                ))}
              </Chips>
              {free.length > 0 ? (
                <Select
                  aria-label={`أضف محكّماً إلى ${s.name}`}
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && run(() => setJudge(programId, examId, s.id, e.target.value, true))}
                >
                  <option value="">أضف محكّماً…</option>
                  {free.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              ) : candidates.length === 0 ? (
                <Muted>لا أحد يحمل صلاحية التحكيم — امنحها من «الإدارة» بدورٍ فيه «التحكيم في الجلسات المسندة».</Muted>
              ) : null}

              <p className={styles.label}>المشاركون ({formatNumber(s.participants.length)})</p>
              {s.participants.length === 0 ? <Muted>لا مشاركين بعد.</Muted> : null}
              <ol className={styles.people}>
                {s.participants.map((p) => {
                  const evs = s.evaluations.filter((e) => e.participantId === p.id);
                  return (
                    <li key={p.id} className={styles.person}>
                      <span className={styles.personName}>{p.name}</span>
                      <span className={styles.evals}>
                        {evs.map((e) => (
                          <span key={e.judgeId} className={e.approved ? styles.ok : styles.pending}>
                            {e.judgeName}: {e.approved ? "اعتمد" : `${formatNumber(e.evaluated)}/${formatNumber(e.total)}`}
                            {e.retroactive ? " (ورقي)" : ""}{" "}
                            {e.approved ? (
                              <button type="button" className={styles.link} onClick={() => setReopening({ session: s.id, row: e })}>
                                أعد فتحه
                              </button>
                            ) : (
                              <Link
                                className={styles.link}
                                href={`/programs/${programId}/exams/${examId}/sheet?session=${s.id}&participant=${p.id}&judge=${e.judgeId}`}
                              >
                                أدخل ورقته
                              </Link>
                            )}
                          </span>
                        ))}
                      </span>
                      {others.length > 0 && evs.every((e) => e.evaluated === 0) ? (
                        <Select
                          aria-label={`انقل ${p.name}`}
                          value=""
                          disabled={busy}
                          onChange={(e) => e.target.value && run(() => moveParticipant(programId, examId, e.target.value, p.id))}
                        >
                          <option value="">انقل إلى…</option>
                          {others.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {s.participants.length === 0 ? (
                <Button variant="danger" disabled={busy} onClick={() => run(() => archiveSession(programId, examId, s.id))}>
                  احذف الجلسة
                </Button>
              ) : null}
            </Card>
          );
        })}
      </Cards>

      <StepForm title="أنشئ جلسة" action={action} state={state}>
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="examId" value={examId} />
        <Field id="sName" label="اسم الجلسة" required error={state.fieldErrors?.name}>
          <Input id="sName" name="name" required placeholder="اللجنة الأولى — الأحد" />
        </Field>
        <Field id="sDay" label="اليوم" required error={state.fieldErrors?.day}>
          <Input id="sDay" name="day" type="date" required />
        </Field>
        <Field id="sTime" label="الوقت" required hint="بتوقيت الرياض." error={state.fieldErrors?.time}>
          <Input id="sTime" name="time" type="time" required defaultValue="16:00" />
        </Field>
        <Field id="sLoc" label="المكان" error={state.fieldErrors?.location}>
          <Input id="sLoc" name="location" placeholder="مقر الجمعية ببريدة — القاعة ١" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending}>
            أنشئ الجلسة
          </Button>
        </FormActions>
        <Messages state={state} />
      </StepForm>

      <Modal open={reopening !== null} title="إعادة فتح التقييم" onClose={() => setReopening(null)}>
        <p>يُفتح تقييم {reopening?.row.judgeName} ليعدّله، وتغيب الدرجة النهائية حتى يعتمده ثانية. ويُسجَّل السبب.</p>
        <Field id="reopenReason" label="السبب" required>
          <Input id="reopenReason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          pending={busy}
          disabled={reason.trim().length < 3}
          onClick={() => {
            const r = reopening!;
            setReopening(null);
            setReason("");
            run(() => reopenEvaluation(programId, examId, r.session, r.row.participantId, r.row.judgeId, reason));
          }}
        >
          أعد الفتح
        </Button>
      </Modal>
    </Step>
  );
}

// ══ ٣ · الدرجات ══

function ScoresStep({ scores, trackName }: { scores: ScoreRow[]; trackName: (id: string | null) => string }) {
  const complete = scores.filter((s) => s.percent !== null).length;
  const columns: Column<ScoreRow>[] = [
    { key: "name", header: "المشارك", primary: true, render: (r) => r.name },
    { key: "no", header: "رقم التسجيل", align: "end", render: (r) => (r.registrationNo === null ? "—" : formatNumber(r.registrationNo)) },
    { key: "track", header: "المسار", render: (r) => trackName(r.trackId) },
    { key: "session", header: "الجلسة", render: (r) => r.session },
    { key: "approved", header: "اعتمد", align: "end", render: (r) => `${formatNumber(r.approved)} من ${formatNumber(r.judges)}` },
    { key: "pct", header: "الدرجة", align: "end", render: (r) => (r.percent === null ? "بانتظار اللجنة" : pct(r.percent)) },
  ];
  return (
    <Step
      n={3}
      title="الدرجات"
      why="الدرجة متوسط محكّمي اللجنة، ولا تظهر حتى يعتمدوا جميعاً."
      done={scores.length > 0 && complete === scores.length}
      state={
        <span>
          {formatNumber(complete)} من {formatNumber(scores.length)} اكتملت درجاتهم
        </span>
      }
    >
      <DataTable
        columns={columns}
        rows={scores}
        rowKey={(r) => r.participantId}
        total={scores.length}
        page={1}
        pageSize={Math.max(scores.length, 1)}
        empty={{ title: "لا درجات بعد", body: "تظهر حين يُسند المشاركون ويبدأ التحكيم." }}
      />
    </Step>
  );
}
