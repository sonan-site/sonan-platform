"use client";

import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { reportAction } from "@/components/shared/action-notice";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { TabHead } from "@/components/shared/steps";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import {
  addHelpEntry,
  editHelpEntry,
  moveHelpEntry,
  removeHelpEntry,
  setHelpStatus,
} from "../page-actions";

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  /** المجموعة في الصفحة المعلنة — الفارغة تُعرض أولاً بلا عنوان. */
  category: string;
  published: boolean;
};

const LIST = { display: "grid", gap: "var(--space-2)", marginBlockEnd: "var(--space-6)" } as const;
const ITEM = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: "var(--space-3) var(--space-4)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-sm)",
} as const;
const META = { color: "var(--color-text-subtle)", fontSize: "var(--text-xs)" } as const;
const SPACER = { marginInlineStart: "auto", display: "flex", gap: "var(--space-2)" } as const;
const PANEL = { maxInlineSize: "34rem" } as const;
const ERR = { color: "var(--color-danger)" } as const;
const OK = { color: "var(--color-success)" } as const;

const ICON = 16;

/** حقول السؤال — واحدةٌ للإضافة والتعديل، فلا يفترق النموذجان. */
function FaqFields({ row, state }: { row: FaqRow | null; state: FormState }) {
  const id = (name: string) => `${row ? "edit" : "add"}-${name}`;
  return (
    <>
      <Field id={id("q")} label="السؤال" required error={state.fieldErrors?.["question"]}>
        <Input id={id("q")} name="question" defaultValue={row?.question ?? ""} required />
      </Field>
      <Field id={id("a")} label="الجواب" required error={state.fieldErrors?.["answer"]}>
        <Textarea id={id("a")} name="answer" rows={4} defaultValue={row?.answer ?? ""} required />
      </Field>
      <Field
        id={id("c")}
        label="المجموعة"
        hint="مثل «التسجيل» أو «الجوائز» — اتركها فارغة لسؤال عام"
        error={state.fieldErrors?.["category"]}
      >
        <Input id={id("c")} name="category" defaultValue={row?.category ?? ""} />
      </Field>
    </>
  );
}

export function FaqView({ programId, rows }: { programId: string; rows: FaqRow[] }) {
  const [addState, addAction, addPending] = useActionState(addHelpEntry, EMPTY_FORM_STATE);
  const [editState, editAction, editPending] = useActionState(editHelpEntry, EMPTY_FORM_STATE);
  const [editing, setEditing] = useState<FaqRow | null>(null);
  const [busy, startTransition] = useTransition();

  const published = rows.filter((r) => r.published).length;

  return (
    <>
      <TabHead
        title="الأسئلة الشائعة"
        lede={`تظهر في عنصر «الأسئلة الشائعة» بالصفحة المعلنة، مجموعةً مجموعة بترتيبها هنا. المنشور منها وحده يراه الزائر — ${formatNumber(published)} من ${formatNumber(rows.length)}.`}
      />

      <div style={LIST}>
        {rows.length === 0 ? (
          <p style={META}>لا أسئلة بعد — عنصر «الأسئلة الشائعة» يظهر فارغاً للزائر.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.id} style={ITEM}>
              <span>{r.question}</span>
              <span style={META}>
                {r.category || "بلا مجموعة"} · {r.published ? "منشور" : "مسوّدة"}
              </span>
              <div style={SPACER}>
                <Button
                  aria-label="تحريك لأعلى"
                  disabled={i === 0}
                  pending={busy}
                  onClick={() =>
                    startTransition(async () =>
                      reportAction(await moveHelpEntry(r.id, programId, "up")),
                    )
                  }
                >
                  <ChevronUp size={ICON} aria-hidden />
                </Button>
                <Button
                  aria-label="تحريك لأسفل"
                  disabled={i === rows.length - 1}
                  pending={busy}
                  onClick={() =>
                    startTransition(async () =>
                      reportAction(await moveHelpEntry(r.id, programId, "down")),
                    )
                  }
                >
                  <ChevronDown size={ICON} aria-hidden />
                </Button>
                <Button
                  pending={busy}
                  onClick={() =>
                    startTransition(async () =>
                      reportAction(
                        await setHelpStatus(r.id, programId, r.published ? "draft" : "published"),
                      ),
                    )
                  }
                >
                  {r.published ? "إعادة لمسوّدة" : "نشر"}
                </Button>
                <Button aria-label="تعديل السؤال" onClick={() => setEditing(r)}>
                  <Pencil size={ICON} aria-hidden />
                </Button>
                <Button
                  aria-label="حذف السؤال"
                  variant="danger"
                  pending={busy}
                  onClick={() =>
                    startTransition(async () =>
                      reportAction(await removeHelpEntry(r.id, programId)),
                    )
                  }
                >
                  <Trash2 size={ICON} aria-hidden />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <section style={PANEL}>
        {addState.error ? <p style={ERR}>{addState.error}</p> : null}
        {addState.notice ? <p style={OK}>{addState.notice}</p> : null}

        <ActionForm action={addAction} state={addState}>
          <input type="hidden" name="programId" value={programId} />
          <FaqFields row={null} state={addState} />
          <FormActions>
            <Button type="submit" variant="primary" pending={addPending}>
              أضِف سؤالاً
            </Button>
          </FormActions>
        </ActionForm>
      </section>

      <Modal open={editing !== null} title="تعديل السؤال" onClose={() => setEditing(null)}>
        {editing ? (
          <ActionForm action={editAction} state={editState}>
            <input type="hidden" name="programId" value={programId} />
            <input type="hidden" name="entryId" value={editing.id} />
            <FaqFields row={editing} state={editState} />
            <FormActions>
              <Button onClick={() => setEditing(null)}>إلغاء</Button>
              <Button type="submit" variant="primary" pending={editPending}>
                احفظ
              </Button>
            </FormActions>
          </ActionForm>
        ) : null}
      </Modal>
    </>
  );
}
