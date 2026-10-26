"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { reportAction } from "@/components/shared/action-notice";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { scheduleDayLabel } from "@/lib/programs/schedule";
import { addGuideUpdate, editGuideUpdate, removeGuideUpdate } from "./guide-actions";

export type GuideUpdateRow = {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  body: string;
};

const PANEL = { maxInlineSize: "var(--form-max)", marginBlockEnd: "var(--space-6)" } as const;
const H2 = { fontSize: "var(--text-lg)", marginBlockStart: "var(--space-10)" } as const;
const ERR = { color: "var(--color-danger)" } as const;
const OK = { color: "var(--color-success)" } as const;
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
const BODY = { minInlineSize: 0, flex: 1 } as const;
const META = { color: "var(--color-text-subtle)", fontSize: "var(--text-xs)" } as const;
const ACTIONS = { display: "flex", gap: "var(--space-2)" } as const;

const ICON = 16;

/** حقلا السطر — واحدٌ للإضافة والتعديل، فلا يفترق النموذجان. */
function UpdateFields({ row, today, state }: { row: GuideUpdateRow | null; today: string; state: FormState }) {
  const id = (name: string) => `guide-${row ? "edit" : "add"}-${name}`;
  return (
    <>
      <Field id={id("d")} label="التاريخ" required error={state.fieldErrors?.["entryDate"]}>
        <Input id={id("d")} name="entryDate" type="date" latin defaultValue={row?.date ?? today} required />
      </Field>
      <Field
        id={id("b")}
        label="التحديث"
        hint="سطرٌ مختصر بما تغيّر — حتى 160 حرفاً"
        required
        error={state.fieldErrors?.["body"]}
        span="full"
      >
        <Textarea id={id("b")} name="body" rows={2} maxLength={160} defaultValue={row?.body ?? ""} required />
      </Field>
    </>
  );
}

/** سجل تحديثات الدليل (خطة دليل المشارك · د) — في تبويب الصفحة تحت عناصرها. */
export function GuideUpdates({
  programId,
  programSlug,
  rows,
  today,
}: {
  programId: string;
  programSlug: string;
  /** `null` = تعذّرت القراءة. */
  rows: GuideUpdateRow[] | null;
  /** اليوم بالرياض `YYYY-MM-DD` — تاريخ السطر الجديد افتراضاً. */
  today: string;
}) {
  const [addState, addAction, addPending] = useActionState(addGuideUpdate, EMPTY_FORM_STATE);
  const [editState, editAction, editPending] = useActionState(editGuideUpdate, EMPTY_FORM_STATE);
  const [editing, setEditing] = useState<GuideUpdateRow | null>(null);
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // الإغلاق مشتقٌّ: النافذة مفتوحةٌ ما لم يُحفظ صفّها (نمط الأسئلة الشائعة).
  const editShown = submittedFor === editing?.id ? editState : EMPTY_FORM_STATE;
  const editOpen = editing !== null && !editShown.notice;

  return (
    <>
      <h2 style={H2}>سجل تحديثات الدليل</h2>
      <p style={META}>
        سطورٌ قصيرة بتاريخها تظهر في آخر <Link href={`/p/${programSlug}/guide`}>دليل المشارك</Link>، وأحدثها في
        غلافه «آخر تحديث معلن». سجّل فيه كل تغيير يمسّ المشاركين: موعدٌ أو شرطٌ أو مقاعد.
      </p>

      <div style={LIST}>
        {rows === null ? (
          <p style={ERR}>تعذّر جلب سجل التحديثات. أعد تحميل الصفحة.</p>
        ) : rows.length === 0 ? (
          <p style={META}>لا تحديثات بعد — يُخفى القسم من الدليل حتى يُضاف أول سطر.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} style={ITEM}>
              <div style={BODY}>
                <div style={META}>{scheduleDayLabel(r.date)}</div>
                <div>{r.body}</div>
              </div>
              <div style={ACTIONS}>
                <Button
                  aria-label="تعديل التحديث"
                  onClick={() => {
                    setSubmittedFor(null);
                    setEditing(r);
                  }}
                >
                  <Pencil size={ICON} aria-hidden />
                </Button>
                <Button
                  aria-label="حذف التحديث"
                  variant="danger"
                  pending={busy}
                  onClick={() =>
                    startTransition(async () => reportAction(await removeGuideUpdate(r.id, programId)))
                  }
                >
                  <Trash2 size={ICON} aria-hidden />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {editShown.notice ? <p style={OK}>{editShown.notice}</p> : null}

      <section style={PANEL}>
        {addState.error ? <p style={ERR}>{addState.error}</p> : null}
        {addState.notice ? <p style={OK}>{addState.notice}</p> : null}
        <ActionForm action={addAction} state={addState}>
          <input type="hidden" name="programId" value={programId} />
          <UpdateFields row={null} today={today} state={addState} />
          <FormActions>
            <Button type="submit" variant="primary" pending={addPending}>
              أضِف التحديث
            </Button>
          </FormActions>
        </ActionForm>
      </section>

      <Modal open={editOpen} title="تعديل التحديث" onClose={() => setEditing(null)}>
        {editing ? (
          <ActionForm key={editing.id} action={editAction} state={editShown}>
            <input type="hidden" name="programId" value={programId} />
            <input type="hidden" name="entryId" value={editing.id} />
            <UpdateFields row={editing} today={today} state={editShown} />
            {editShown.error ? <p style={ERR}>{editShown.error}</p> : null}
            <FormActions>
              <Button onClick={() => setEditing(null)}>إلغاء</Button>
              <Button
                type="submit"
                variant="primary"
                pending={editPending}
                onClick={() => setSubmittedFor(editing.id)}
              >
                احفظ
              </Button>
            </FormActions>
          </ActionForm>
        ) : null}
      </Modal>
    </>
  );
}
