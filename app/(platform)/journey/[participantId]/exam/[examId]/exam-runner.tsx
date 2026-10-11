"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/shared/form";
import type { AttemptState } from "@/lib/exams/attempt";
import { formatNumber } from "@/lib/format";
import { answerQuestion, attemptState, skipQuestion, startAttempt } from "./actions";
import styles from "./exam.module.css";

const pct = (n: number) => `${formatNumber(n)}٪`;

/**
 * المحاولة: سؤالٌ واحد في الشاشة، وعدّادٌ تنازلي **يعرض** وقت الخادم ولا يحكم.
 * انتهاء العدّاد يسأل الخادم عن الحال — فيُغلق السؤال هناك وينتقل.
 */
export function ExamRunner({
  examId,
  name,
  questionCount,
  secondsPerQuestion,
  maxSkips,
  maxAttempts,
  attempts,
  passPercentage,
  bestPercent,
  passed,
  openAttemptId,
  blockers,
}: {
  examId: string;
  name: string;
  questionCount: number;
  secondsPerQuestion: number | null;
  maxSkips: number | null;
  maxAttempts: number | null;
  attempts: number;
  passPercentage: number;
  bestPercent: number | null;
  passed: boolean;
  openAttemptId: string | null;
  blockers: string[];
}) {
  const router = useRouter();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [state, setState] = useState<AttemptState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const apply = useCallback((result: { state?: AttemptState; attemptId?: string; error?: string }) => {
    if (result.error) setError(result.error);
    else setError(null);
    if (result.attemptId) setAttemptId(result.attemptId);
    if (result.state) setState(result.state);
  }, []);

  function begin() {
    start(async () => apply(await startAttempt(examId)));
  }

  if (state?.status === "open" && attemptId) {
    // مفتاحه السؤال: سؤالٌ جديد يبدأ شاشته من الصفر — اختياراً فارغاً وعدّاداً من وقت الخادم.
    return <QuestionScreen key={state.question.id} attemptId={attemptId} state={state} onState={apply} error={error} />;
  }

  if (state?.status === "submitted") {
    return (
      <section className={styles.result}>
        <h1>{state.exam}</h1>
        <p className={styles.big}>{pct(state.percent)}</p>
        <p>
          {formatNumber(state.score)} من {formatNumber(state.max)} —{" "}
          {state.passed ? (
            <b className={styles.ok}>اجتزت الاختبار. بارك الله فيك.</b>
          ) : (
            <b className={styles.warn}>دون نسبة الاجتياز ({pct(state.passPercentage)}).</b>
          )}
        </p>
        <Button variant="primary" onClick={() => router.refresh()}>
          عُد إلى صفحة الاختبار
        </Button>
      </section>
    );
  }

  const usedUp = maxAttempts !== null && attempts >= maxAttempts;
  return (
    <section className={styles.intro}>
      <h1>{name}</h1>
      <ul className={styles.rules}>
        <li>{formatNumber(questionCount)} سؤالاً من محفوظك، يظهر كل سؤالٍ وحده.</li>
        {secondsPerQuestion ? <li>لكل سؤال {formatNumber(secondsPerQuestion)} ثانية، ولا يُحسب جوابٌ بعد انقضائها.</li> : null}
        <li>لا رجوع إلى سؤالٍ مضى.</li>
        {maxSkips ? <li>لك أن تتخطّى {formatNumber(maxSkips)} سؤالاً فيُبدَّل بغيره.</li> : null}
        <li>
          الاجتياز {pct(passPercentage)} فأكثر.
          {maxAttempts && maxAttempts > 1 ? ` لك ${formatNumber(maxAttempts)} محاولات، والمعتدّ أعلاها.` : null}
        </li>
        <li>إن انقطع اتصالك فعُد إلى هذه الصفحة: تكمل من سؤالك نفسه.</li>
      </ul>

      {bestPercent !== null ? (
        <p className={passed ? styles.ok : styles.warn}>
          أعلى نتيجة لك: {pct(bestPercent)} {passed ? "— اجتزت الاختبار." : ""}
          {!passed && maxAttempts ? ` (${formatNumber(attempts)} من ${formatNumber(maxAttempts)} محاولات)` : null}
        </p>
      ) : null}

      {openAttemptId ? (
        <Button variant="primary" pending={pending} onClick={begin}>
          أكمل محاولتك
        </Button>
      ) : blockers.length > 0 ? (
        <ul className={styles.blockers}>
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <Button variant="primary" pending={pending} onClick={begin}>
          {attempts > 0 && !usedUp ? "ابدأ محاولة جديدة" : "ابدأ الاختبار"}
        </Button>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </section>
  );
}

function QuestionScreen({
  attemptId,
  state,
  onState,
  error,
}: {
  attemptId: string;
  state: Extract<AttemptState, { status: "open" }>;
  onState: (r: { state?: AttemptState; error?: string }) => void;
  error: string | null;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [left, setLeft] = useState(state.secondsLeft);
  const [pending, start] = useTransition();
  const asked = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  // انتهى الوقت: الخادم يُغلق السؤال وينقل — مرّةً لكل سؤال.
  useEffect(() => {
    if (left > 0 || asked.current) return;
    asked.current = true;
    const id = setTimeout(() => start(async () => onState(await attemptState(attemptId))), 2500);
    return () => clearTimeout(id);
  }, [left, attemptId, onState]);

  const multiple = state.question.type === "multiple";
  function toggle(id: string) {
    setPicked((all) => (multiple ? (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]) : [id]));
  }

  return (
    <section className={styles.question}>
      <div className={styles.bar}>
        <span>
          السؤال {formatNumber(state.index)} من {formatNumber(state.total)}
        </span>
        <span className={left <= 10 ? styles.urgent : undefined} aria-live="polite">
          {formatNumber(left)} ثانية
        </span>
      </div>
      <progress className={styles.meter} max={state.secondsPerQuestion} value={left} aria-label="الوقت الباقي" />

      <h1 className={styles.text}>{state.question.text}</h1>
      {multiple ? <p className={styles.hint}>اختر كل جوابٍ صحيح.</p> : null}

      <div className={styles.options} role={multiple ? "group" : "radiogroup"}>
        {state.question.options.map((o) => (
          <button
            key={o.id}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={picked.includes(o.id)}
            className={`${styles.option} ${picked.includes(o.id) ? styles.picked : ""}`}
            disabled={pending || left === 0}
            onClick={() => toggle(o.id)}
          >
            {o.text}
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <Button
          variant="primary"
          pending={pending}
          disabled={picked.length === 0 || left === 0}
          onClick={() => start(async () => onState(await answerQuestion(attemptId, state.question.id, picked)))}
        >
          {state.index === state.total ? "أجب وسلّم" : "أجب والتالي"}
        </Button>
        {state.skipsLeft > 0 ? (
          <Button
            disabled={pending || left === 0}
            onClick={() => start(async () => onState(await skipQuestion(attemptId, state.question.id)))}
          >
            تخطَّ ({formatNumber(state.skipsLeft)})
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
