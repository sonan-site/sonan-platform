"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/shared/form";
import { EmptyState } from "@/components/shared/states";
import { formatNumber, formatPercent } from "@/lib/format";
import type { JourneyDay, JourneyProgress } from "@/lib/participants/journey";
import { submitDay } from "../actions";

export type SpanPart = { from: number; to: number; fromLabel: string; toLabel: string };

export type TaskRow = {
  fieldId: string;
  label: string;
  kind: "ranged" | "counted";
  amount: number;
  isDone: boolean;
  /** الحقل النطاقي الذي استنفد مسار المشارك — لا نطاق له بعد. */
  exhausted: boolean;
  /** مسارٌ لم تُضبَط مقاطعه بعد. حالة إدارية لا إنجاز، ولا تُخلَط بالاستنفاد. */
  trackEmpty: boolean;
  span: SpanPart[];
};

const NOTE = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  maxInlineSize: "68ch",
} as const;
const ERR = { color: "var(--color-danger)" } as const;
const OK = { color: "var(--color-success)" } as const;

const SHELL = { maxInlineSize: "34rem" } as const;

const HEAD = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  marginBlockEnd: "var(--space-5)",
} as const;

const TASK = {
  padding: "var(--space-4)",
  marginBlockEnd: "var(--space-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
} as const;

const TASK_DONE = {
  ...TASK,
  borderColor: "var(--color-success)",
} as const;

const META = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--space-4)",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  marginBlockEnd: "var(--space-6)",
} as const;

export function JourneyView({
  participantId,
  programName,
  trackName,
  planName,
  day,
  totalDays,
  tasks,
  examName,
  submittable,
  progress,
  previous,
  next,
}: {
  participantId: string;
  programName: string;
  trackName: string;
  planName: string;
  day: JourneyDay;
  totalDays: number;
  tasks: TaskRow[];
  examName: string | null;
  submittable: boolean;
  progress: JourneyProgress;
  previous: number | null;
  next: number | null;
}) {
  const router = useRouter();
  // **علامات إتمام لا أرقام.** المشارك لا يكتب نطاقاً — القاعدة تحسبه.
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [state, setState] = useState<{ error?: string; notice?: string }>({});
  const [pending, startTransition] = useTransition();

  function toggle(fieldId: string): void {
    setMarked((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(fieldId)) nextSet.delete(fieldId);
      else nextSet.add(fieldId);
      return nextSet;
    });
  }

  const doneCount = day.submitted ? tasks.filter((t) => t.isDone).length : marked.size;

  return (
    <div style={SHELL}>
      <p style={{ fontSize: "var(--text-sm)" }}>
        <Link href="/journey">رحلتي</Link>
      </p>
      <h1>{programName}</h1>

      <div style={META}>
        <span>المسار: {trackName}</span>
        <span>الخطة: {planName}</span>
        <span>
          الالتزام: {formatPercent(progress.commitment)} ({formatNumber(progress.submittedDays)} من{" "}
          {formatNumber(progress.workDays)})
        </span>
      </div>

      <div style={HEAD}>
        <Button
          aria-label="اليوم السابق"
          variant="secondary"
          disabled={previous === null}
          {...(previous !== null
            ? { onClick: () => router.push(`/journey/${participantId}?day=${previous}`) }
            : {})}
        >
          <ChevronRight size={16} aria-hidden />
        </Button>

        <strong>
          اليوم {formatNumber(day.dayNumber)} من {formatNumber(totalDays)}
          {day.submitted ? " · مُرسَل" : null}
        </strong>

        <Button
          aria-label="اليوم التالي"
          variant="secondary"
          disabled={next === null}
          {...(next !== null
            ? { onClick: () => router.push(`/journey/${participantId}?day=${next}`) }
            : {})}
        >
          <ChevronLeft size={16} aria-hidden />
        </Button>
      </div>

      {day.dayType === "rest" ? (
        <EmptyState kind="no-data" title="يوم راحة" body="لا مطلوب اليوم. ويومك التالي يُكمل من حيث وقفت." />
      ) : null}

      {day.dayType === "exam" ? (
        <EmptyState
          kind="no-data"
          title={examName ?? "يوم اختبار"}
          body="يوم الاختبار يستبدل واجبات اليوم بالكامل. تفاصيله تُعلَن قبل موعده."
        />
      ) : null}

      {day.dayType === "normal" ? (
        <>
          <p style={{ ...NOTE, marginBlockEnd: "var(--space-4)" }}>
            {day.submitted
              ? "هذا اليوم أُرسل. ما تراه لقطته وقت الإرسال، ولا تتغيّر."
              : `${formatNumber(doneCount)} من ${formatNumber(tasks.length)} واجبات`}
          </p>

          {tasks.map((task) => {
            const done = day.submitted ? task.isDone : marked.has(task.fieldId);
            return (
              <div key={task.fieldId} style={done ? TASK_DONE : TASK}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    marginBlockEnd: "var(--space-2)",
                  }}
                >
                  <strong>{task.label}</strong>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                    {task.kind === "ranged" ? "نطاقي" : "عددي"}
                  </span>
                </div>

                {task.kind === "counted" ? (
                  <p style={{ marginBlockEnd: "var(--space-3)" }}>
                    العدد: <strong>{formatNumber(task.amount)}</strong>
                  </p>
                ) : task.trackEmpty ? (
                  <p style={{ ...NOTE, marginBlockEnd: "var(--space-3)" }}>
                    لم تُضبَط مادة مسارك بعد. تُدخلها الإدارة قبل انطلاق البرنامج.
                  </p>
                ) : task.exhausted ? (
                  <p style={{ ...NOTE, marginBlockEnd: "var(--space-3)" }}>
                    أتممتَ مادة مسارك في هذا الواجب — لا نطاق بعده.
                  </p>
                ) : (
                  <div style={{ marginBlockEnd: "var(--space-3)" }}>
                    {task.span.length > 1 ? (
                      <p style={{ ...NOTE, marginBlockEnd: "var(--space-2)" }}>
                        مقطعان، فمادة مسارك ليست متّصلة الترقيم:
                      </p>
                    ) : null}
                    {task.span.map((part) => (
                      <p key={`${part.from}-${part.to}`} style={{ marginBlockEnd: "var(--space-1)" }}>
                        من <strong>{formatNumber(part.from)}</strong>
                        {part.fromLabel ? ` · ${part.fromLabel}` : null} إلى{" "}
                        <strong>{formatNumber(part.to)}</strong>
                        {part.toLabel ? ` · ${part.toLabel}` : null}
                      </p>
                    ))}
                  </div>
                )}

                {day.submitted ? (
                  <p style={done ? OK : NOTE}>
                    {done ? "أُتمّ" : "لم يُتَمّ"}
                    {done ? <Check size={14} aria-hidden style={{ verticalAlign: "middle" }} /> : null}
                  </p>
                ) : (
                  <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={marked.has(task.fieldId)}
                      disabled={!submittable || pending}
                      onChange={() => toggle(task.fieldId)}
                    />
                    أتممتُ هذا الواجب
                  </label>
                )}
              </div>
            );
          })}

          {tasks.length === 0 ? (
            <EmptyState kind="no-data" title="لا واجب في هذا اليوم" body="لم تُضبَط حقول قالب هذا اليوم بعد." />
          ) : null}

          {!day.submitted && tasks.length > 0 ? (
            <>
              {submittable ? (
                <Button
                  variant="primary"
                  pending={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await submitDay(participantId, day.id, [...marked]);
                      setState(result);
                      if (!result.error) setMarked(new Set());
                    })
                  }
                >
                  {marked.size === 0 ? "أرسِل بلا إنجاز" : "أرسِل الإتمام"}
                </Button>
              ) : (
                <p style={NOTE}>
                  لم يحن هذا اليوم بعد. أرسِل يومك الجاري أولاً — والسلسلة تمضي للأمام فقط.
                </p>
              )}

              <p style={{ ...NOTE, marginBlockStart: "var(--space-3)" }}>
                الإرسال مرة واحدة، ويُثبِّت ما أتممتَه. وما لم تُتمّه يبقى لك في اليوم التالي.
              </p>
            </>
          ) : null}

          {state.error ? <p style={ERR}>{state.error}</p> : null}
          {state.notice ? <p style={OK}>{state.notice}</p> : null}
        </>
      ) : null}
    </div>
  );
}
