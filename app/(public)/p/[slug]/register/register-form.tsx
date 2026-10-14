"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { registerInProgram } from "./actions";
import styles from "./register.module.css";

export type QuestionRow = {
  id: string;
  question: string;
  required: boolean;
  /** شكل الإجابة — عرضٌ لا قاعدة (الهجرة ٠٥٤). */
  kind: "text" | "choice" | "consent";
  trackId: string | null;
};

export type TrackOption = {
  id: string;
  name: string;
  description: string;
  capacity: number | null;
  /** المتبقي من مقاعده — فارغ = بلا سقف. */
  remaining: number | null;
};

/**
 * صفحة التسجيل بخطوات (رحلة التسجيل ت٨): ترويسة المسابقة · مؤشّر الخطوات · بطاقات
 * المسارات · الأسئلة · الإقرارات كلٌّ في سطره · زرٌّ رئيسي.
 *
 * **أسماء الحقول وقيمها كما كانت حرفياً** — `trackId` و`q:<id>` و«أقرّ» و«نعم/لا» —
 * فـ`fn_register` تحكم بها كما حكمت، والشكل وحده تغيّر.
 */
export function RegisterForm({
  programId,
  programName,
  initialTrack,
  slug,
  participantLabel,
  tracks,
  questions,
}: {
  programId: string;
  programName: string;
  /** المسار المحمول من الواجهة (`?track`) إن كان صالحاً — وإلا فارغ. */
  initialTrack: string;
  slug: string;
  participantLabel: string;
  tracks: TrackOption[];
  questions: QuestionRow[];
}) {
  const [state, action, pending] = useActionState(registerInProgram, EMPTY_FORM_STATE);
  const [trackId, setTrackId] = useState<string>(initialTrack);

  // السؤال العام يظهر دائماً، والخاص بمسار يظهر عند اختياره.
  const visible = questions.filter((q) => q.trackId === null || q.trackId === trackId);
  const asked = visible.filter((q) => q.kind !== "consent");
  const consents = visible.filter((q) => q.kind === "consent");

  const steps = [
    { label: "الحساب", done: true },
    { label: "بياناتك", done: true },
    { label: "مسارك", done: tracks.length === 0 || trackId !== "" },
    { label: "الإقرار", done: false },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{programName}</p>
        <h1 className={styles.title}>التسجيل</h1>
        <p className={styles.lede}>
          أكمل ما يلي ليكتمل تسجيلك بصفة {participantLabel} — القبول فوريٌّ بلا مراجعة.
        </p>
      </header>

      <ol className={styles.steps} aria-label="خطوات التسجيل">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={s.done ? styles.stepDone : i === steps.findIndex((x) => !x.done) ? styles.stepNow : undefined}
          >
            <span className={styles.stepDot}>{s.done ? <Check size={13} aria-hidden /> : formatNumber(i + 1)}</span>
            {s.label}
          </li>
        ))}
      </ol>

      <ActionForm action={action} state={state} className={styles.form}>
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="slug" value={slug} />

        {tracks.length > 0 ? (
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>اختر مسارك</legend>
            <div className={styles.tracks}>
              {tracks.map((t) => {
                const full = t.remaining === 0;
                const used =
                  t.capacity && t.remaining !== null ? ((t.capacity - t.remaining) / t.capacity) * 100 : 0;
                return (
                  <label key={t.id} className={`${styles.track} ${full ? styles.trackFull : ""}`}>
                    <input
                      type="radio"
                      name="trackId"
                      value={t.id}
                      required
                      disabled={full}
                      checked={trackId === t.id}
                      onChange={() => setTrackId(t.id)}
                      className={styles.radio}
                    />
                    <span className={styles.trackBody}>
                      <b>{t.name}</b>
                      {t.description ? <span className={styles.muted}>{t.description}</span> : null}
                      {t.capacity !== null ? (
                        <>
                          <span className={styles.seats}>
                            {full
                              ? "اكتملت المقاعد"
                              : `متبقٍّ ${formatNumber(t.remaining ?? 0)} من ${formatNumber(t.capacity)}`}
                          </span>
                          <span className={styles.bar} aria-hidden>
                            <i style={{ inlineSize: `${used}%` }} />
                          </span>
                        </>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {asked.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>أسئلة القبول</h2>
            {asked.map((q) => {
              const id = `q:${q.id}`;
              if (q.kind === "choice") {
                return (
                  <fieldset key={q.id} className={styles.question}>
                    <legend>
                      {q.question}
                      {q.required ? <span className={styles.req}> *</span> : null}
                    </legend>
                    <div className={styles.choice}>
                      {["نعم", "لا"].map((v) => (
                        <label key={v} className={styles.choiceOpt}>
                          <input type="radio" name={id} value={v} required={q.required} className={styles.radio} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              }
              return (
                <div key={q.id} className={styles.question}>
                  <label htmlFor={id}>
                    {q.question}
                    {q.required ? <span className={styles.req}> *</span> : null}
                  </label>
                  <Textarea id={id} name={id} rows={2} required={q.required} />
                </div>
              );
            })}
          </section>
        ) : null}

        {consents.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>الإقرار</h2>
            {consents.map((q) => {
              const id = `q:${q.id}`;
              return (
                <label key={q.id} htmlFor={id} className={styles.consent}>
                  <input id={id} name={id} type="checkbox" value="أقرّ" required={q.required} className={styles.check} />
                  <span>
                    {q.question}
                    {q.required ? <span className={styles.req}> *</span> : null}
                  </span>
                </label>
              );
            })}
          </section>
        ) : null}

        {state.error ? (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        ) : null}

        <button type="submit" className={styles.submit} disabled={pending} aria-busy={pending}>
          {pending ? "يُسجَّل…" : "أتمم التسجيل"}
        </button>
      </ActionForm>
    </div>
  );
}
