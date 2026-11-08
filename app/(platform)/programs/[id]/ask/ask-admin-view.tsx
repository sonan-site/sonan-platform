"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { reportAction } from "@/components/shared/action-notice";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { TabHead } from "@/components/shared/steps";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { formatNumber, formatRelative } from "@/lib/format";
import { addAnswer, editAnswer, removeAnswer, resolveReport, setAnswerStatus, setReportStatus } from "./actions";

export type ReportRow = {
  id: string;
  kind: "unanswered" | "flagged" | "blocked";
  /** سأله طالبٌ داخل — لا هويته. */
  student: boolean;
  question: string;
  /** جواب المساعد كما عُرض أو كما ردّه الحارس — فارغ لما لا جواب له. */
  answer: string | null;
  createdAt: string;
};

export type AnswerRow = { id: string; question: string; answer: string; published: boolean };

const KIND_LABEL: Record<ReportRow["kind"], string> = {
  unanswered: "بلا جواب",
  flagged: "أُبلغ أنها غير صحيحة",
  blocked: "ردّها الفحص الآلي",
};

const LIST = { display: "grid", gap: "var(--space-2)", marginBlockEnd: "var(--space-6)" } as const;
const ITEM = {
  display: "grid",
  gap: "var(--space-2)",
  padding: "var(--space-3) var(--space-4)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-sm)",
} as const;
const ROW = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" } as const;
const META = { color: "var(--color-text-subtle)", fontSize: "var(--text-xs)" } as const;
const QUOTE = {
  margin: 0,
  paddingInlineStart: "var(--space-3)",
  borderInlineStart: "2px solid var(--color-border)",
  color: "var(--color-text-subtle)",
  whiteSpace: "pre-wrap",
} as const;
const SPACER = { marginInlineStart: "auto", display: "flex", gap: "var(--space-2)" } as const;
const H2 = { fontSize: "var(--text-base)", margin: "var(--space-6) 0 var(--space-3)" } as const;
const PANEL = { maxInlineSize: "var(--form-max)" } as const;
const ERR = { color: "var(--color-danger)" } as const;
const OK = { color: "var(--color-success)" } as const;
const ICON = 16;

/** ما يُفتح في النافذة: حلّ تقرير، أو تعديل إجابة معتمدة. */
type Editing = { mode: "resolve"; report: ReportRow } | { mode: "edit"; answer: AnswerRow };

function AnswerFields({ prefix, question, answer, state }: { prefix: string; question: string; answer: string; state: FormState }) {
  return (
    <>
      <Field id={`${prefix}-q`} label="السؤال" hint="كما يُتوقَّع أن يُسأل" required error={state.fieldErrors?.["question"]} span="full">
        <Input id={`${prefix}-q`} name="question" defaultValue={question} required />
      </Field>
      <Field
        id={`${prefix}-a`}
        label="الجواب"
        hint="مختصراً كما تريد أن يقوله المساعد — يقرؤه ويقلّد أسلوبه"
        required
        error={state.fieldErrors?.["answer"]}
        span="full"
      >
        <Textarea id={`${prefix}-a`} name="answer" rows={4} defaultValue={answer} required />
      </Field>
    </>
  );
}

export function AskAdminView({
  programId,
  askedToday,
  reports,
  answers,
}: {
  programId: string;
  askedToday: number;
  reports: ReportRow[];
  answers: AnswerRow[];
}) {
  const [addState, addAction, addPending] = useActionState(addAnswer, EMPTY_FORM_STATE);
  const [resolveState, resolveAction, resolvePending] = useActionState(resolveReport, EMPTY_FORM_STATE);
  const [editState, editAction, editPending] = useActionState(editAnswer, EMPTY_FORM_STATE);
  const [editing, setEditing] = useState<Editing | null>(null);
  // أيُّ نافذةٍ تخصّها حالة النموذج — بلا هذا يظهر خطأ نافذةٍ سابقة في غيرها.
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const key = editing ? (editing.mode === "resolve" ? `r:${editing.report.id}` : `a:${editing.answer.id}`) : null;
  const state = editing?.mode === "resolve" ? resolveState : editState;
  const shown = submittedFor === key ? state : EMPTY_FORM_STATE;
  // الإغلاق مشتقٌّ: النافذة مفتوحةٌ ما لم يُحفظ ما فيها (نمط تبويب الأسئلة الشائعة).
  const open = editing !== null && !shown.notice;

  return (
    <>
      <TabHead
        title="المساعد"
        lede={`«اسأل عن المسابقة» يجيب من المنشور ومن الإجابات المعتمدة هنا. أسئلة آخر 24 ساعة: ${formatNumber(askedToday)} · بانتظارك: ${formatNumber(reports.length)}.`}
      />

      <h2 style={H2}>بانتظار جوابك</h2>
      <div style={LIST}>
        {reports.length === 0 ? (
          <p style={META}>لا شيء بانتظارك — كل ما سُئل وجد جوابه أو عولج.</p>
        ) : (
          reports.map((r) => (
            <div key={r.id} style={ITEM}>
              <div style={ROW}>
                <strong>{r.question}</strong>
                <span style={META}>
                  {KIND_LABEL[r.kind]} · {r.student ? "طالب" : "زائر"} · {formatRelative(r.createdAt)}
                </span>
              </div>
              {r.answer ? <p style={QUOTE}>{r.answer}</p> : null}
              <div style={ROW}>
                <div style={SPACER}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSubmittedFor(null);
                      setEditing({ mode: "resolve", report: r });
                    }}
                  >
                    اكتب الجواب
                  </Button>
                  <Button
                    pending={busy}
                    onClick={() => startTransition(async () => reportAction(await setReportStatus(r.id, programId, "dismissed")))}
                  >
                    تجاهل
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {shown.notice ? <p style={OK}>{shown.notice}</p> : null}

      <h2 style={H2}>الإجابات المعتمدة</h2>
      <div style={LIST}>
        {answers.length === 0 ? (
          <p style={META}>لا إجابات معتمدة بعد — المساعد يجيب من المنشور وحده.</p>
        ) : (
          answers.map((a) => (
            <div key={a.id} style={ITEM}>
              <div style={ROW}>
                <strong>{a.question}</strong>
                <span style={META}>{a.published ? "يقرؤها المساعد" : "موقوفة"}</span>
                <div style={SPACER}>
                  <Button
                    pending={busy}
                    onClick={() =>
                      startTransition(async () =>
                        reportAction(await setAnswerStatus(a.id, programId, a.published ? "draft" : "published")),
                      )
                    }
                  >
                    {a.published ? "أوقِف" : "انشر"}
                  </Button>
                  <Button
                    aria-label="تعديل الإجابة"
                    onClick={() => {
                      setSubmittedFor(null);
                      setEditing({ mode: "edit", answer: a });
                    }}
                  >
                    <Pencil size={ICON} aria-hidden />
                  </Button>
                  <Button
                    aria-label="حذف الإجابة"
                    variant="danger"
                    pending={busy}
                    onClick={() => startTransition(async () => reportAction(await removeAnswer(a.id, programId)))}
                  >
                    <Trash2 size={ICON} aria-hidden />
                  </Button>
                </div>
              </div>
              <p style={QUOTE}>{a.answer}</p>
            </div>
          ))
        )}
      </div>

      <section style={PANEL}>
        {addState.error ? <p style={ERR}>{addState.error}</p> : null}
        {addState.notice ? <p style={OK}>{addState.notice}</p> : null}
        <ActionForm action={addAction} state={addState}>
          <input type="hidden" name="programId" value={programId} />
          <AnswerFields prefix="add" question="" answer="" state={addState} />
          <FormActions>
            <Button type="submit" variant="primary" pending={addPending}>
              أضِف إجابة معتمدة
            </Button>
          </FormActions>
        </ActionForm>
      </section>

      <Modal
        open={open}
        title={editing?.mode === "resolve" ? "جوابٌ لما سُئل" : "تعديل الإجابة"}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <ActionForm key={key} action={editing.mode === "resolve" ? resolveAction : editAction} state={shown}>
            <input type="hidden" name="programId" value={programId} />
            {editing.mode === "resolve" ? (
              <>
                <input type="hidden" name="reportId" value={editing.report.id} />
                {editing.report.answer ? <p style={QUOTE}>قال المساعد: {editing.report.answer}</p> : null}
                <AnswerFields prefix="resolve" question={editing.report.question} answer="" state={shown} />
              </>
            ) : (
              <>
                <input type="hidden" name="id" value={editing.answer.id} />
                <AnswerFields prefix="edit" question={editing.answer.question} answer={editing.answer.answer} state={shown} />
              </>
            )}
            {shown.error ? <p style={ERR}>{shown.error}</p> : null}
            <FormActions>
              <Button onClick={() => setEditing(null)}>إلغاء</Button>
              <Button
                type="submit"
                variant="primary"
                pending={editing.mode === "resolve" ? resolvePending : editPending}
                onClick={() => setSubmittedFor(key)}
              >
                احفظ وانشر للمساعد
              </Button>
            </FormActions>
          </ActionForm>
        ) : null}
      </Modal>
    </>
  );
}
