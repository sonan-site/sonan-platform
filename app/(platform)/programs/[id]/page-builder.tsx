"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { BLOCK_CATEGORY, BLOCK_LABEL, BLOCK_TYPES, type BlockType } from "@/lib/programs/blocks";
import {
  addAdmissionQuestion,
  removeAdmissionQuestion,
} from "./participant-actions";
import {
  addBlock,
  addHelpEntry,
  moveBlock,
  removeBlock,
  setHelpStatus,
} from "./page-actions";

export type BlockRow = { id: string; type: BlockType; summary: string };
export type HelpRow = { id: string; question: string; published: boolean };
export type AdmissionRow = {
  id: string;
  question: string;
  required: boolean;
  trackName: string | null;
};

const PANEL = { maxInlineSize: "34rem", marginBlockEnd: "var(--space-6)" } as const;
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

export function PageBuilder({
  programId,
  blocks,
  help,
  admission,
  tracks,
}: {
  programId: string;
  blocks: BlockRow[];
  help: HelpRow[];
  admission: AdmissionRow[];
  tracks: { id: string; name: string }[];
}) {
  const [blockState, blockAction, blockPending] = useActionState(addBlock, EMPTY_FORM_STATE);
  const [helpState, helpAction, helpPending] = useActionState(addHelpEntry, EMPTY_FORM_STATE);
  const [admState, admAction, admPending] = useActionState(
    addAdmissionQuestion,
    EMPTY_FORM_STATE,
  );
  const [type, setType] = useState<BlockType>("header");
  const [busy, startTransition] = useTransition();

  return (
    <>
      <h2 style={H2}>الصفحة المعلنة</h2>
      <p style={META}>
        الأنواع مغلقة والتركيب حرّ: أي عدد من أي نوع بأي ترتيب، ويجوز تكرار النوع الواحد.
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
                    startTransition(async () => void (await moveBlock(b.id, programId, "up")))
                  }
                >
                  <ChevronUp size={ICON} aria-hidden />
                </Button>
                <Button
                  aria-label="تحريك لأسفل"
                  disabled={i === blocks.length - 1}
                  pending={busy}
                  onClick={() =>
                    startTransition(async () => void (await moveBlock(b.id, programId, "down")))
                  }
                >
                  <ChevronDown size={ICON} aria-hidden />
                </Button>
                <Button
                  aria-label="حذف العنصر"
                  variant="danger"
                  pending={busy}
                  onClick={() =>
                    startTransition(async () => void (await removeBlock(b.id, programId)))
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
        {blockState.error ? <p style={ERR}>{blockState.error}</p> : null}
        {blockState.notice ? <p style={OK}>{blockState.notice}</p> : null}

        <form action={blockAction}>
          <input type="hidden" name="programId" value={programId} />

          <Field id="blockType" label="نوع العنصر" required>
            <Select
              id="blockType"
              name="blockType"
              value={type}
              onChange={(e) => setType(e.target.value as BlockType)}
              required
            >
              {BLOCK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BLOCK_LABEL[t]}
                  {BLOCK_CATEGORY[t] === "data" ? " — مولَّد" : ""}
                </option>
              ))}
            </Select>
          </Field>

          {type === "header" ? (
            <>
              <Field id="title" label="العنوان" required error={blockState.fieldErrors?.["title"]}>
                <Input id="title" name="title" required />
              </Field>
              <Field id="subtitle" label="النبذة">
                <Input id="subtitle" name="subtitle" />
              </Field>
            </>
          ) : null}

          {type === "free_text" ? (
            <>
              <Field id="heading" label="عنوان الفقرة">
                <Input id="heading" name="heading" />
              </Field>
              <Field id="text" label="النص" required error={blockState.fieldErrors?.["text"]}>
                <Textarea id="text" name="text" rows={5} required />
              </Field>
            </>
          ) : null}

          {type === "image" ? (
            <>
              <Field
                id="attachmentId"
                label="معرّف الصورة"
                required
                hint="رفع الصور يُبنى مع المرفقات — حتى ذلك الحين يُتخطّى العنصر في العرض"
                error={blockState.fieldErrors?.["attachmentId"]}
              >
                <Input id="attachmentId" name="attachmentId" latin required />
              </Field>
              <Field id="alt" label="وصف الصورة" hint="لقارئ الشاشة">
                <Input id="alt" name="alt" />
              </Field>
            </>
          ) : null}

          {type === "tracks" || type === "faq" || type === "registration" ? (
            <Field
              id="heading"
              label="العنوان"
              hint="بيانات هذا العنصر مولَّدة — لا يُدخَل محتواه يدوياً"
            >
              <Input id="heading" name="heading" />
            </Field>
          ) : null}

          {type === "registration" ? (
            <Field id="buttonLabel" label="نصّ الزر">
              <Input id="buttonLabel" name="buttonLabel" defaultValue="سجّل في البرنامج" />
            </Field>
          ) : null}

          <FormActions>
            <Button type="submit" variant="primary" pending={blockPending}>
              إضافة العنصر
            </Button>
          </FormActions>
        </form>
      </section>

      <h2 style={H2}>سجل المساعدة</h2>
      <p style={META}>مصدر عنصر الأسئلة الشائعة. المنشور منها وحده يظهر للعموم.</p>

      <div style={LIST}>
        {help.length === 0 ? (
          <p style={META}>لا أسئلة بعد.</p>
        ) : (
          help.map((h) => (
            <div key={h.id} style={ITEM}>
              <span>{h.question}</span>
              <span style={META}>{h.published ? "منشور" : "مسوّدة"}</span>
              <div style={SPACER}>
                <Button
                  pending={busy}
                  onClick={() =>
                    startTransition(
                      async () =>
                        void (await setHelpStatus(
                          h.id,
                          programId,
                          h.published ? "draft" : "published",
                        )),
                    )
                  }
                >
                  {h.published ? "إعادة لمسوّدة" : "نشر"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <h2 style={H2}>أسئلة القبول التلقائي</h2>
      <p style={META}>
        كيان منفصل تماماً عن بنك الأسئلة. إكمال الإلزامية منها = قبول فوري بلا مراجعة.
      </p>

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
                  variant="danger"
                  pending={busy}
                  onClick={() =>
                    startTransition(
                      async () => void (await removeAdmissionQuestion(q.id, programId)),
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

        <form action={admAction}>
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
        </form>
      </section>

      <section style={PANEL}>
        {helpState.error ? <p style={ERR}>{helpState.error}</p> : null}
        {helpState.notice ? <p style={OK}>{helpState.notice}</p> : null}

        <form action={helpAction}>
          <input type="hidden" name="programId" value={programId} />
          <Field id="question" label="السؤال" required error={helpState.fieldErrors?.["question"]}>
            <Input id="question" name="question" required />
          </Field>
          <Field id="answer" label="الجواب" required error={helpState.fieldErrors?.["answer"]}>
            <Textarea id="answer" name="answer" required />
          </Field>
          <FormActions>
            <Button type="submit" variant="primary" pending={helpPending}>
              إضافة سؤال
            </Button>
          </FormActions>
        </form>
      </section>
    </>
  );
}
