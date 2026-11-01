"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { EmptyState } from "@/components/shared/states";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateTime } from "@/lib/format";
import { VOICE_KIND_LABEL, VOICE_KINDS, VOICE_STATUS_STUDENT, type VoiceKind, type VoiceStatus } from "@/lib/voices/voices";
import { markVoicesSeen, submitVoice } from "./actions";
import type { FormState } from "@/lib/auth/form-state";
import styles from "./voices.module.css";

export type MyVoice = {
  id: string;
  kind: VoiceKind;
  title: string;
  body: string;
  status: VoiceStatus;
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
  /** ردٌّ لم يُقرأ قبل هذه الزيارة. */
  replyNew: boolean;
  /** «فريق {البرنامج}» — لا اسم الرادّ (قرار الراعي). */
  team: string;
};

/** «صوتك» للطالب: زرّ رسالة جديدة يفتح النموذج، ثم رسائله الأحدث أولاً بحالها والرد تحتها. */
export function VoicesView({ voices, from }: { voices: MyVoice[]; from: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // جولة النافذة: خطأ جولةٍ سابقة لا يظهر في جديدة (مراجعة البناء ١).
  const [round, setRound] = useState(0);
  const [state, action, pending] = useActionState(async (prev: FormState & { round?: number }, form: FormData) => {
    const result = await submitVoice(prev, form);
    // النجاح يغلق النافذة ويُقال في الصفحة — والإغلاق هنا لا في أثرٍ بعد الرسم.
    if (result.notice) setOpen(false);
    return { ...result, round: Number(form.get("round")) };
  }, EMPTY_FORM_STATE as FormState & { round?: number });
  const roundState = state.round === round ? state : EMPTY_FORM_STATE;

  // ردٌّ جديد قُرئ هنا: يُعلَّم مقروءاً بعد الرسم، ثم يُحدَّث الإطار فتختفي نقطة الرأس.
  const anyNew = voices.some((v) => v.replyNew);
  useEffect(() => {
    if (!anyNew) return;
    void markVoicesSeen().then(() => router.refresh());
  }, [anyNew, router]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>صوتك</h1>
          <p className={styles.lede}>استفسار أو ملاحظة أو اقتراح أو مشكلة تقنية أو شكوى — يصلنا، ونردّ عليك هنا.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setRound((r) => r + 1);
            setOpen(true);
          }}
        >
          رسالة جديدة
        </Button>
      </header>

      {state.notice ? <p className={styles.notice} role="status">{state.notice}</p> : null}

      {voices.length === 0 ? (
        <EmptyState kind="no-data" title="لا رسائل بعد" body="أرسل استفسارك أو ملاحظتك، وتجد الرد هنا." />
      ) : (
        <ul className={styles.list}>
          {voices.map((v) => (
            <li key={v.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.kind}>{VOICE_KIND_LABEL[v.kind]}</span>
                <span className={`${styles.status} ${styles[v.status] ?? ""}`}>{VOICE_STATUS_STUDENT[v.status]}</span>
              </div>
              <h2 className={styles.itemTitle}>{v.title}</h2>
              <p className={styles.body}>{v.body}</p>
              <p className={styles.meta}>{formatDateTime(v.createdAt)}</p>
              {v.reply ? (
                <div className={styles.reply}>
                  <p className={styles.replyHead}>
                    ردّ {v.team}
                    {v.replyNew ? <span className={styles.newTag}>جديد</span> : null}
                  </p>
                  <p className={styles.body}>{v.reply}</p>
                  {v.repliedAt ? <p className={styles.meta}>{formatDateTime(v.repliedAt)}</p> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} title="صوتك" onClose={() => setOpen(false)}>
        {open ? (
          <VoiceForm key={round} round={round} from={from} action={action} state={roundState} pending={pending} onCancel={() => setOpen(false)} />
        ) : null}
      </Modal>
    </div>
  );
}

function VoiceForm({
  round,
  from,
  action,
  state,
  pending,
  onCancel,
}: {
  round: number;
  /** الصفحة التي جاء منها الطالب — من زرّ الرأس. */
  from: string;
  action: (form: FormData) => void;
  state: FormState;
  pending: boolean;
  onCancel: () => void;
}) {
  // السياق التقني يُقرأ هنا: النموذج لا يُرسم إلا في المتصفح (داخل النافذة)، فلا اختلاف مع الخادم.
  return (
    <ActionForm action={action} state={state}>
      <input type="hidden" name="round" value={round} />
      <input type="hidden" name="path" value={from} />
      <input type="hidden" name="ua" value={navigator.userAgent.slice(0, 300)} />
      <input type="hidden" name="viewport" value={`${window.innerWidth}x${window.innerHeight}`} />

      <fieldset className={styles.kinds}>
        <legend className={styles.kindsLegend}>نوع الرسالة</legend>
        {VOICE_KINDS.map((k) => (
          <label key={k} className={styles.kindOption}>
            <input type="radio" name="kind" value={k} required />
            <span>{VOICE_KIND_LABEL[k]}</span>
          </label>
        ))}
      </fieldset>
      {state.fieldErrors?.["kind"] ? <p className={styles.error}>{state.fieldErrors["kind"]}</p> : null}

      <Field id="voice-title" label="عنوان مختصر" required error={state.fieldErrors?.["title"]} span="full">
        <Input id="voice-title" name="title" maxLength={120} required />
      </Field>
      <Field id="voice-body" label="التفاصيل" required error={state.fieldErrors?.["body"]} span="full">
        <Textarea id="voice-body" name="body" rows={5} maxLength={2000} required />
      </Field>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      <FormActions>
        <Button onClick={onCancel}>إلغاء</Button>
        <Button type="submit" variant="primary" pending={pending}>
          إرسال
        </Button>
      </FormActions>
    </ActionForm>
  );
}
