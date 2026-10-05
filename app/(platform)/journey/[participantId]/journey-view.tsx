"use client";

import { Check, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/shared/form";
import { formatClock, formatDateBoth, formatHijri, formatNumber, formatPercent, formatTime } from "@/lib/format";
import { commitmentLabel, daysText, type CommitmentStatus, type JourneyState, type Pace } from "@/lib/participants/journey";
import { countRepetition, markField, openNextDay, undoMark } from "../actions";
import styles from "./journey.module.css";

/** سطرٌ من نطاق الواجب: نصّه، وأوائل طرفيه إن كُتبت في المادة. */
export type TaskLine = { text: string; fromLabel: string | null; toLabel: string | null };

export type TaskRow = {
  fieldId: string;
  label: string;
  isRequired: boolean;
  lines: TaskLine[];
  /** العدد المطلوب — `null` لواجبٍ بلا تكرار. */
  repetition: number | null;
  count: number;
  markedAt: string | null;
  undoable: boolean;
};

export type ArchiveRow = {
  id: string;
  date: string;
  status: CommitmentStatus;
  planDay: number;
  completedDays: number[];
  compensated: boolean;
};

const PACE_CLASS: Record<Pace["tone"], string> = {
  on: styles.ok ?? "",
  ahead: styles.ok ?? "",
  behind: styles.warn ?? "",
};

/** «بقي لك يومٌ واحد · يومان · ٣ أيام» — فاعلاً لا مفعولاً. */
function daysLeftText(count: number): string {
  if (count === 1) return "يومٌ واحد";
  if (count === 2) return "يومان";
  return daysText(count);
}

function percent(value: number): string {
  return formatPercent(value / 100, Number.isInteger(value) ? 0 : 1);
}

export function JourneyView({
  participantId,
  justJoined,
  programName,
  trackName,
  state,
  pace,
  day,
  lastDay,
  markable,
  tasks,
  archive,
  priorDays,
}: {
  participantId: string;
  /** جاء من التسجيل للتوّ. */
  justJoined: boolean;
  programName: string;
  trackName: string;
  state: JourneyState;
  pace: Pace;
  /** اليوم المعروض من الخطة. */
  day: number;
  /** آخر يومٍ يُفتح للعرض — يومه الحالي. */
  lastDay: number;
  /** يُرصد هذا اليوم الآن. */
  markable: boolean;
  tasks: TaskRow[];
  archive: ArchiveRow[];
  /** أيامٌ أتمّها في مساراتٍ قبل هذا — صفرٌ لمن لم يُنقل. */
  priorDays: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [pending, startTransition] = useTransition();

  const go = (to: number) => router.push(`/journey/${participantId}?day=${to}`);
  const required = tasks.filter((t) => t.isRequired);
  const requiredDone = required.filter((t) => t.markedAt !== null).length;
  const planDay = Math.min(state.currentDay, state.dayCount);
  const finishedDay = state.currentDay - 1;

  function startNext(): void {
    startTransition(async () => {
      const result = await openNextDay(participantId);
      setMessage(result);
      if (!result.error) router.push(`/journey/${participantId}`);
    });
  }

  return (
    <div className={styles.shell}>
      <p className={styles.back}>
        <Link href="/journey">رحلتي</Link>
      </p>

      {justJoined ? (
        <p role="status" className={styles.joined}>
          تمّ تسجيلك في {programName}. هذا واجبك الأول.
        </p>
      ) : null}
      <h1>{programName}</h1>

      <dl className={styles.stats}>
        <div>
          <dt>المسار</dt>
          <dd>{trackName}</dd>
        </div>
        <div>
          <dt>يوم الخطة</dt>
          <dd>
            {state.stage === "finished"
              ? "أتممتَ الخطة"
              : `${formatNumber(planDay)} من ${formatNumber(state.dayCount)}`}
          </dd>
        </div>
        <div>
          <dt>الإنجاز</dt>
          <dd>{percent(state.progressPct)}</dd>
        </div>
        {state.stage !== "not_started" && state.stage !== "finished" ? (
          <div>
            <dt>الموعد</dt>
            <dd className={PACE_CLASS[pace.tone]}>{pace.text}</dd>
          </div>
        ) : null}
        {priorDays > 0 ? (
          <div>
            <dt>أيامٌ من مسارٍ سابق</dt>
            <dd>{formatNumber(priorDays)}</dd>
          </div>
        ) : null}
        {state.stumbled > 0 ? (
          <div>
            <dt>أيام التعثّر</dt>
            <dd>
              {formatNumber(state.stumbled)}
              {state.compensated > 0 ? ` (عُوِّض منها ${formatNumber(state.compensated)})` : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {state.carried ? (
        <p role="status" className={styles.alert}>
          واجب يومك مرحَّل: لم يُتمّ قبل وقت نهاية رصد يومٍ سابق. أتمّه ليعود تقدّمك.
        </p>
      ) : null}

      {state.stage === "not_started" ? (
        <p className={styles.banner}>
          يومك الأول {formatDateBoth(state.startDate)}. هذا واجبه لتستعدّ له.
        </p>
      ) : null}

      {state.stage === "done_today" ? (
        <div className={styles.done}>
          <p>
            أتممتَ واجب اليوم {formatNumber(finishedDay)}. ولك أن تبدأ التالي الآن، وبقي لك اليوم{" "}
            {daysLeftText(state.dailyLimit - state.completedToday)} في حدّك اليومي.
          </p>
          <Button variant="primary" pending={pending} onClick={startNext}>
            ابدأ واجب اليوم التالي
          </Button>
        </div>
      ) : null}

      {state.stage === "limit" ? (
        <p className={styles.done}>
          بلغتَ الحد اليومي: أتممتَ اليوم {daysText(state.completedToday)} من خطتك. يُفتح واجب اليوم التالي
          غداً.
        </p>
      ) : null}

      {state.stage === "finished" ? (
        <p className={styles.done}>أتممتَ خطتك كاملة — {daysText(state.dayCount)}.</p>
      ) : null}

      {message.error ? (
        <p role="alert" className={styles.error}>
          {message.error}
        </p>
      ) : null}

      <div className={styles.dayHead}>
        <Button aria-label="اليوم السابق" disabled={day <= 1} onClick={() => go(day - 1)}>
          <ChevronRight size={16} aria-hidden />
        </Button>
        <strong>
          اليوم {formatNumber(day)} من {formatNumber(state.dayCount)}
          {day < state.currentDay ? " · أُتمّ" : null}
        </strong>
        <Button aria-label="اليوم التالي" disabled={day >= lastDay} onClick={() => go(day + 1)}>
          <ChevronLeft size={16} aria-hidden />
        </Button>
      </div>

      {markable && day === state.currentDay ? (
        <p className={styles.note}>
          الواجبات الإلزامية: {formatNumber(requiredDone)} من {formatNumber(required.length)} — وبإتمامها كلها
          يُتمّ اليوم.
          {state.isProgramDay
            ? ` وقت نهاية الرصد اليوم ${formatClock(state.deadline)}.`
            : " اليوم ليس من أيام البرنامج، فلا يُحاسَب عليه — ولك أن تتقدّم فيه."}
        </p>
      ) : markable ? (
        <p className={styles.note}>
          أتممتَ هذا اليوم. ولك أن ترصد ما بقي من اختياريّه قبل {formatClock(state.deadline)}.
        </p>
      ) : day === state.currentDay && state.stage === "done_today" ? (
        <p className={styles.note}>ابدأ واجب اليوم التالي لترصده.</p>
      ) : null}

      {tasks.map((task) => (
        <TaskCard
          key={`${day}-${task.fieldId}-${task.markedAt ?? ""}-${task.count}`}
          participantId={participantId}
          day={day}
          task={task}
          markable={markable}
        />
      ))}

      {tasks.length === 0 ? <p className={styles.note}>لا واجب في هذا اليوم.</p> : null}

      <details className={styles.archive}>
        <summary>سجلّ الالتزام ({formatNumber(archive.length)})</summary>
        {archive.length === 0 ? (
          <p className={styles.note}>يُكتب حكم كل يومٍ من أيام البرنامج عند وقت نهاية رصده.</p>
        ) : (
          <ul>
            {archive.map((row) => (
              <li key={row.id}>
                <span>{formatHijri(row.date)}</span>
                <strong className={row.status === "stumbled" && !row.compensated ? styles.warn : styles.ok}>
                  {commitmentLabel(row.status, row.compensated)}
                </strong>
                <span className={styles.muted}>
                  {row.completedDays.length > 0
                    ? `الأيام ${row.completedDays.map((d) => formatNumber(d)).join("، ")}`
                    : `اليوم ${formatNumber(row.planDay)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

/**
 * واجبٌ واحد: نطاقه، وعدّاده إن كان له تكرار، وزرّ إتمامه.
 *
 * **العدّاد يُحفظ مع كل ضغطة** ولا ينتظر الإتمام — فتحديث الصفحة أو انقطاع
 * الشبكة لا يُضيع ما عدّه. والشاشة تعدّ فوراً، ثم تأخذ عدد القاعدة حين تسكن
 * الضغطات: هي المرجع لا الشاشة.
 */
function TaskCard({
  participantId,
  day,
  task,
  markable,
}: {
  participantId: string;
  day: number;
  task: TaskRow;
  markable: boolean;
}) {
  const router = useRouter();
  const [count, setCount] = useState(task.count);
  // الخطأ في بطاقته لا أعلى الصفحة: على الجوال لا يُرى ما فوق الشاشة.
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(0);
  const [pending, startTransition] = useTransition();
  const marked = task.markedAt !== null;
  const target = { participantId, day, fieldId: task.fieldId };
  const short = task.repetition !== null && count < task.repetition;

  function bump(delta: 1 | -1): void {
    if (task.repetition === null) return;
    const next = Math.max(0, Math.min(task.repetition, count + delta));
    if (next === count) return;
    setCount(next);
    setError(null);
    inflight.current += 1;
    void countRepetition({ ...target, delta }).then((result) => {
      inflight.current -= 1;
      if (result.error) {
        setError(result.error);
        // رُفضت الضغطة فلم تُحفظ: تُرَدّ — والطلبات تمضي بترتيبها، فما قبلها محفوظ.
        setCount((c) => Math.max(0, c - delta));
        router.refresh();
        return;
      }
      if (inflight.current === 0 && result.count !== undefined) setCount(result.count);
    });
  }

  function act(kind: "mark" | "undo"): void {
    startTransition(async () => {
      const result = kind === "mark" ? await markField(target) : await undoMark(target);
      setError(result.error ?? null);
    });
  }

  return (
    <section className={marked ? `${styles.task} ${styles.taskDone}` : styles.task} aria-label={task.label}>
      <div className={styles.taskHead}>
        <strong>{task.label}</strong>
        {!task.isRequired ? <span className={styles.tag}>اختياري</span> : null}
      </div>

      {task.lines.map((line, i) => (
        <div key={i} className={styles.line}>
          <p>{line.text}</p>
          {line.fromLabel || line.toLabel ? (
            <p className={styles.muted}>
              {line.fromLabel ? `أوله: ${line.fromLabel}` : null}
              {line.fromLabel && line.toLabel ? " · " : null}
              {line.toLabel ? `آخره: ${line.toLabel}` : null}
            </p>
          ) : null}
        </div>
      ))}

      {task.repetition !== null ? (
        <div className={styles.counter}>
          <Button
            aria-label="أنقص واحداً"
            disabled={!markable || marked || count === 0}
            onClick={() => bump(-1)}
          >
            <Minus size={18} aria-hidden />
          </Button>
          <output aria-live="polite">
            التكرار <strong>{formatNumber(count)}</strong> من {formatNumber(task.repetition)}
          </output>
          <Button
            aria-label="زد واحداً"
            variant="primary"
            disabled={!markable || marked || count >= task.repetition}
            onClick={() => bump(1)}
          >
            <Plus size={18} aria-hidden />
          </Button>
        </div>
      ) : null}

      {marked ? (
        <div className={styles.taskFoot}>
          <span className={styles.ok}>
            <Check size={14} aria-hidden /> أُتمّ {formatTime(task.markedAt!)}
          </span>
          {task.undoable ? (
            <Button pending={pending} onClick={() => act("undo")}>
              تراجع
            </Button>
          ) : null}
        </div>
      ) : markable ? (
        <div className={styles.taskFoot}>
          <Button variant="primary" pending={pending} disabled={short} onClick={() => act("mark")}>
            أتممتُه
          </Button>
          {short ? <span className={styles.muted}>أكمل التكرار ليُتاح الإتمام.</span> : null}
        </div>
      ) : (
        <p className={styles.muted}>لم يُرصد.</p>
      )}

      {error ? (
        <p role="alert" className={styles.cardError}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
