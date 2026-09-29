"use client";

import { reportAction } from "@/components/shared/action-notice";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { BLOCK_LABEL, BLOCK_TYPES, type BlockType } from "@/lib/programs/blocks";
import { addAdmissionQuestion, removeAdmissionQuestion } from "./participant-actions";
import { addBlock, editBlock, moveBlock, removeBlock } from "./page-actions";

export type BlockRow = {
  id: string;
  type: BlockType;
  summary: string;
  /** محتوى العنصر كما هو — يملأ نموذج التعديل. */
  content: Record<string, unknown>;
};
export type AdmissionRow = {
  id: string;
  question: string;
  required: boolean;
  trackName: string | null;
};

/** تلميح العناصر التي تُملأ من بيانات البرنامج نفسه. */
const BLOCK_HINT: Partial<Record<BlockType, string>> = {
  tracks: "تُعرض مسارات البرنامج كما أدخلتها",
  faq: "تُعرض الأسئلة الشائعة المنشورة في تبويبها",
  registration: "يُفتح الزر حين يكون التسجيل مفتوحاً",
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
const META = { color: "var(--color-text-subtle)", fontSize: "var(--text-xs)" } as const;
const SPACER = { marginInlineStart: "auto", display: "flex", gap: "var(--space-2)" } as const;

const ICON = 16;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * حقول المحتوى — **واحدةٌ للإضافة والتعديل**.
 *
 * كانت الحقول مكتوبةً في نموذج الإضافة وحده، ولا تعديل في المنصة أصلاً: من
 * أراد تصحيح حرفٍ حذف العنصر وأعاده، فيذهب إلى آخر الصفحة. ومشاركتُها هنا
 * تمنع أن يفترق النموذجان بحقلٍ ينساه أحدهما.
 */
function BlockFields({
  scope,
  type,
  values,
  state,
}: {
  /** «إضافة» أو «تعديل» — النموذجان مُركَّبان معاً، فالمعرّف بالنوع وحده يتكرّر. */
  scope: string;
  type: BlockType;
  values: Record<string, unknown>;
  state: FormState;
}) {
  const id = (name: string) => `${scope}-${type}-${name}`;

  return (
    <>
      {type === "header" ? (
        <>
          <Field id={id("title")} label="العنوان" required error={state.fieldErrors?.["title"]}>
            <Input id={id("title")} name="title" defaultValue={text(values["title"])} required />
          </Field>
          <Field id={id("subtitle")} label="النبذة">
            <Input id={id("subtitle")} name="subtitle" defaultValue={text(values["subtitle"])} />
          </Field>
        </>
      ) : null}

      {type === "free_text" ? (
        <>
          <Field id={id("heading")} label="عنوان الفقرة">
            <Input id={id("heading")} name="heading" defaultValue={text(values["heading"])} />
          </Field>
          <Field id={id("text")} label="النص" required error={state.fieldErrors?.["text"]} span="full">
            <Textarea
              id={id("text")}
              name="text"
              rows={5}
              defaultValue={text(values["text"])}
              required
            />
          </Field>
        </>
      ) : null}

      {type === "tracks" || type === "faq" || type === "registration" ? (
        <Field id={id("heading")} label="العنوان" hint={BLOCK_HINT[type]}>
          <Input id={id("heading")} name="heading" defaultValue={text(values["heading"])} />
        </Field>
      ) : null}

      {type === "tracks" ? (
        <Field id={id("showCapacity")} label="اعرض المقاعد" hint="المتبقي من سعة كل مسار">
          <input
            id={id("showCapacity")}
            name="showCapacity"
            type="checkbox"
            defaultChecked={values["showCapacity"] === true}
          />
        </Field>
      ) : null}

      {type === "registration" ? (
        <Field id={id("buttonLabel")} label="نصّ الزر">
          <Input
            id={id("buttonLabel")}
            name="buttonLabel"
            defaultValue={text(values["buttonLabel"]) || "سجّل في البرنامج"}
          />
        </Field>
      ) : null}
    </>
  );
}

export function PageBuilder({
  programId,
  blocks,
  admission,
  tracks,
}: {
  programId: string;
  blocks: BlockRow[];
  admission: AdmissionRow[];
  tracks: { id: string; name: string }[];
}) {
  const [blockState, blockAction, blockPending] = useActionState(addBlock, EMPTY_FORM_STATE);
  const [editState, editAction, editPending] = useActionState(editBlock, EMPTY_FORM_STATE);
  const [admState, admAction, admPending] = useActionState(addAdmissionQuestion, EMPTY_FORM_STATE);
  const [type, setType] = useState<BlockType>("header");
  const [editing, setEditing] = useState<BlockRow | null>(null);
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  /**
   * **الإغلاق مشتقٌّ لا أثرٌ جانبي:** النافذة مفتوحةٌ ما لم يُحفظ صفّها.
   *
   * وبلا هذا كانت تبقى مفتوحة بعد الحفظ، و`ActionForm` يُعيد الحقول إلى نصّها
   * **القديم** — فيرى المُعِدّ ما كتبه قد اختفى، ويضغط «احفظ» ثانيةً فيكتب
   * القديم فوق الجديد. والفشل يُبقيها مفتوحة بخطئه ظاهراً.
   */
  const editShown = submittedFor === editing?.id ? editState : EMPTY_FORM_STATE;
  const editOpen = editing !== null && !editShown.notice;

  return (
    <>
      <h2 style={H2}>الصفحة المعلنة</h2>
      <p style={META}>
        ما يراه الزائر حين يفتح رابط البرنامج. أضف العناصر ورتّبها كما تشاء، ويجوز تكرار النوع.
      </p>

      <div style={LIST}>
        {blocks.length === 0 ? (
          <p style={META}>لا عناصر بعد — الصفحة المعلنة فارغة.</p>
        ) : (
          blocks.map((b, i) => (
            <div key={b.id} style={ITEM}>
              <strong>{BLOCK_LABEL[b.type]}</strong>
              <span style={META}>{b.summary}</span>
              <div style={SPACER}>
                <Button
                  aria-label="تحريك لأعلى"
                  disabled={i === 0}
                  pending={busy}
                  onClick={() =>
                    startTransition(async () => reportAction(await moveBlock(b.id, programId, "up")))
                  }
                >
                  <ChevronUp size={ICON} aria-hidden />
                </Button>
                <Button
                  aria-label="تحريك لأسفل"
                  disabled={i === blocks.length - 1}
                  pending={busy}
                  onClick={() =>
                    startTransition(async () =>
                      reportAction(await moveBlock(b.id, programId, "down")),
                    )
                  }
                >
                  <ChevronDown size={ICON} aria-hidden />
                </Button>
                <Button aria-label="تعديل العنصر" onClick={() => {
                    setSubmittedFor(null);
                    setEditing(b);
                  }}>
                  <Pencil size={ICON} aria-hidden />
                </Button>
                <Button
                  aria-label="حذف العنصر"
                  variant="danger"
                  pending={busy}
                  onClick={() =>
                    startTransition(async () => reportAction(await removeBlock(b.id, programId)))
                  }
                >
                  <Trash2 size={ICON} aria-hidden />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* النافذة تُغلق بالحفظ، فيُقال النجاح هنا — لا يختفي مع ما أغلقه. */}
      {editShown.notice ? <p style={OK}>{editShown.notice}</p> : null}

      <section style={PANEL}>
        {blockState.error ? <p style={ERR}>{blockState.error}</p> : null}
        {blockState.notice ? <p style={OK}>{blockState.notice}</p> : null}

        <ActionForm action={blockAction} state={blockState}>
          <input type="hidden" name="programId" value={programId} />

          <Field id="blockType" label="نوع العنصر" required>
            <Select
              id="blockType"
              name="blockType"
              value={type}
              onChange={(e) => setType(e.target.value as BlockType)}
              required
            >
              {/* الصورة لا تُعرض دون رفع الصور، فلا تُعرض خياراً. */}
              {BLOCK_TYPES.filter((t) => t !== "image").map((t) => (
                <option key={t} value={t}>
                  {BLOCK_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <BlockFields scope="add" type={type} values={{}} state={blockState} />

          <FormActions>
            <Button type="submit" variant="primary" pending={blockPending}>
              إضافة العنصر
            </Button>
          </FormActions>
        </ActionForm>
      </section>

      <Modal
        open={editOpen}
        title={editing ? `تعديل — ${BLOCK_LABEL[editing.type]}` : "تعديل"}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <ActionForm key={editing.id} action={editAction} state={editShown}>
            <input type="hidden" name="programId" value={programId} />
            <input type="hidden" name="blockId" value={editing.id} />
            {/* النوع لا يُغيَّر: تغييره يُبطل المحتوى كلَّه، فالأصحّ حذفٌ وإضافة. */}
            <input type="hidden" name="blockType" value={editing.type} />

            <BlockFields
              scope="edit"
              type={editing.type}
              values={editing.content}
              state={editShown}
            />

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

      <h2 style={H2}>أسئلة القبول التلقائي</h2>
      <p style={META}>يجيب عنها المتقدّم عند التسجيل. من أجاب عن الإلزامية منها قُبل فوراً.</p>

      <div style={LIST}>
        {admission.length === 0 ? (
          <p style={META}>لا أسئلة قبول — التسجيل يمرّ بلا شروط.</p>
        ) : (
          admission.map((q) => (
            <div key={q.id} style={ITEM}>
              <span>{q.question}</span>
              <span style={META}>
                {q.required ? "إلزامي" : "اختياري"}
                {q.trackName ? ` · ${q.trackName}` : " · عام للبرنامج"}
              </span>
              <div style={SPACER}>
                <Button
                  aria-label="حذف السؤال"
                  variant="danger"
                  pending={busy}
                  onClick={() =>
                    startTransition(async () =>
                      reportAction(await removeAdmissionQuestion(q.id, programId)),
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
        {admState.error ? <p style={ERR}>{admState.error}</p> : null}
        {admState.notice ? <p style={OK}>{admState.notice}</p> : null}

        <ActionForm action={admAction} state={admState}>
          <input type="hidden" name="programId" value={programId} />
          <Field
            id="admQuestion"
            label="نصّ السؤال"
            required
            error={admState.fieldErrors?.["question"]}
          >
            <Input id="admQuestion" name="question" required />
          </Field>
          <Field id="admTrack" label="خاص بمسار" hint="اتركه فارغاً لسؤال عام للبرنامج">
            <Select id="admTrack" name="trackId" defaultValue="">
              <option value="">عام للبرنامج</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="admRequired" label="إلزامي" hint="الإلزامي وحده شرط القبول">
            <input id="admRequired" name="isRequired" type="checkbox" defaultChecked />
          </Field>
          <FormActions>
            <Button type="submit" variant="primary" pending={admPending}>
              إضافة سؤال قبول
            </Button>
          </FormActions>
        </ActionForm>
      </section>
    </>
  );
}
