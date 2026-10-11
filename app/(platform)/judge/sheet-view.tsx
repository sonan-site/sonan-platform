"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { questionScore, type JudgeSheet } from "@/lib/exams/sheet";
import { formatNumber } from "@/lib/format";
import { approveSheet, markQuestion } from "./actions";
import styles from "./judge.module.css";

/**
 * ورقة التقييم — للمحكّم من جواله، ولمدير الاختبارات يُدخل ورقةً ورقية باسم
 * محكّمها (`judgeId` + سببٌ إلزامي). **كل نقرة تُحفظ في الخادم**، والشاشة تعرض
 * ما أرجعه لا ما ظنّته.
 */
export function SheetView({
  sessionId,
  participantId,
  judgeId,
  initial,
}: {
  sessionId: string;
  participantId: string;
  /** فارغ = المحكّم بنفسه. وإلا فإدخالٌ عنه. */
  judgeId: string | null;
  initial: JudgeSheet;
}) {
  const [sheet, setSheet] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const onBehalf = judgeId !== null;

  const evaluated = sheet.questions.filter((q) => q.evaluated).length;
  const all = evaluated === sheet.questions.length;

  function save(questionId: string, marked: string[]) {
    if (onBehalf && reason.trim().length < 3) {
      setError("اذكر سبب الإدخال عن المحكّم أولاً.");
      return;
    }
    start(async () => {
      const r = await markQuestion(sessionId, participantId, judgeId, questionId, marked, onBehalf ? reason.trim() : null);
      if (r.error) setError(r.error);
      else if (r.sheet) {
        setError(null);
        setSheet(r.sheet);
      }
    });
  }

  function approve() {
    start(async () => {
      const r = await approveSheet(sessionId, participantId, judgeId);
      setConfirming(false);
      if (r.error) setError(r.error);
      else if (r.sheet) {
        setError(null);
        setSheet(r.sheet);
      }
    });
  }

  return (
    <div className={styles.sheet}>
      <header className={styles.who}>
        <h1>{sheet.participant.name}</h1>
        {sheet.participant.registrationNo !== null ? (
          <span className={styles.muted}>رقم التسجيل {formatNumber(sheet.participant.registrationNo)}</span>
        ) : null}
        <p className={styles.tally}>
          قُيِّم {formatNumber(evaluated)} من {formatNumber(sheet.questions.length)} · الدرجة{" "}
          <b>
            {formatNumber(sheet.total)} من {formatNumber(sheet.max)}
          </b>
        </p>
        {sheet.approved ? <p className={styles.locked}>اعتمدتَ هذا التقييم وأُقفل.</p> : null}
      </header>

      {onBehalf && !sheet.approved ? (
        <Field id="reason" label="سبب الإدخال عن المحكّم" required hint="يُسجَّل مع كل سؤالٍ تُدخله.">
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="تعطّل جوال المحكّم" />
        </Field>
      ) : null}

      <ol className={styles.questions}>
        {sheet.questions.map((q, i) => (
          <li key={q.id} className={`${styles.question} ${q.evaluated ? styles.evaluated : ""}`}>
            <p className={styles.qHead}>
              <span>
                {formatNumber(i + 1)}. {q.text}
              </span>
              <span className={styles.qScore}>
                {q.evaluated ? `${formatNumber(questionScore(q))} / ` : ""}
                {formatNumber(q.score)}
              </span>
            </p>
            {q.answer ? <p className={styles.answer}>{q.answer}</p> : null}

            <div className={styles.criteria} role="group" aria-label={`خصومات السؤال ${formatNumber(i + 1)}`}>
              {q.criteria.map((c) => {
                const on = q.marked.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                    disabled={pending || sheet.approved}
                    onClick={() => save(q.id, on ? q.marked.filter((x) => x !== c.id) : [...q.marked, c.id])}
                  >
                    {c.label} −{formatNumber(c.value)}
                  </button>
                );
              })}
              {!q.evaluated ? (
                <button
                  type="button"
                  className={`${styles.chip} ${styles.clean}`}
                  disabled={pending || sheet.approved}
                  onClick={() => save(q.id, [])}
                >
                  بلا خصم
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {!sheet.approved ? (
        <div className={styles.approveBar}>
          <Button variant="primary" disabled={!all || pending} onClick={() => setConfirming(true)}>
            اعتمد التقييم
          </Button>
          {!all ? <span className={styles.muted}>قيّم الأسئلة كلها أولاً.</span> : null}
        </div>
      ) : null}

      <Modal open={confirming} title="اعتماد التقييم" onClose={() => setConfirming(false)}>
        <p>
          درجة {sheet.participant.name}: {formatNumber(sheet.total)} من {formatNumber(sheet.max)}. بعد الاعتماد يُقفل
          التقييم، ولا يُعاد فتحه إلا من الإدارة.
        </p>
        <Button variant="primary" pending={pending} onClick={approve}>
          اعتمد
        </Button>
      </Modal>
    </div>
  );
}
