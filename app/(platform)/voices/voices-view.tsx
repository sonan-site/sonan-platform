"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { EmptyState } from "@/components/shared/states";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/browser";
import { formatDateTime } from "@/lib/format";
import { VOICE_BUCKET, VOICE_IMAGE_SOURCE_TYPES, voiceImagePath } from "@/lib/voices/image";
import { prepareVoiceImage } from "@/lib/voices/prepare-image";
import { VOICE_KIND_LABEL, VOICE_KINDS, VOICE_STATUS_STUDENT, type VoiceKind, type VoiceStatus } from "@/lib/voices/voices";
import { attachVoiceImage, markVoicesSeen, submitVoice } from "./actions";
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
  /** رابطٌ موقّع قصير العمر لصورتها، إن كانت. */
  imageUrl: string | null;
};

/**
 * يرفع الصورة الجاهزة من المتصفح مباشرة إلى مجلد رسالتها (adr/0054 د٢)، ثم يسجّلها —
 * والتسجيل يُعاد مرّةً إن تعثّر: رفعٌ نجح وتسجيلٌ فشل لا يحبس الصورة (مراجعة الخطة ١١).
 */
async function uploadVoiceImage(userId: string, voiceId: string, blob: Blob): Promise<boolean> {
  // الرسالة وصلت قبل هذا — فأي استثناء (شبكةٌ انقطعت، نشرٌ جديد) يُقال «تعذّر رفع الصورة» لا صفحة خطأ
  // تدفع الطالب إلى إعادة الإرسال فتتكرّر رسالته (مراجعة البناء ٤).
  try {
    const path = voiceImagePath(userId, voiceId, crypto.randomUUID());
    const { error } = await createClient().storage.from(VOICE_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) return false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if ((await attachVoiceImage(voiceId, path)).ok) return true;
      } catch {
        // المحاولة التالية.
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** «صوتك» للطالب: زرّ رسالة جديدة يفتح النموذج، ثم رسائله الأحدث أولاً بحالها والرد تحتها. */
export function VoicesView({ voices, from, userId }: { voices: MyVoice[]; from: string; userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // جولة النافذة: خطأ جولةٍ سابقة لا يظهر في جديدة (مراجعة البناء ١).
  const [round, setRound] = useState(0);
  const [state, action, pending] = useActionState(async (prev: FormState & { round?: number }, form: FormData) => {
    const round = Number(form.get("round"));
    // الصورة تُجهَّز قبل الإرسال: صورةٌ لا تُقرأ تُقال في النموذج قبل أن تُنشأ رسالةٌ بلاها.
    // والملف لا يُرسل إلى الخادم (حدّ جسم الطلب) — يُرفع من هنا بعد الإرسال.
    const file = form.get("image");
    form.delete("image");
    let blob: Blob | null = null;
    if (file instanceof File && file.size > 0) {
      const prepared = await prepareVoiceImage(file);
      if ("error" in prepared) return { fieldErrors: { image: prepared.error }, round };
      blob = prepared.blob;
    }

    const result = await submitVoice(prev, form);
    if (result.voiceId && blob && !(await uploadVoiceImage(userId, result.voiceId, blob))) {
      result.notice = "وصلت رسالتك، وتعذّر رفع الصورة. اذكر ما فيها في رسالةٍ أخرى إن لزم.";
    }
    // النجاح يغلق النافذة ويُقال في الصفحة — والإغلاق هنا لا في أثرٍ بعد الرسم.
    if (result.notice) {
      setOpen(false);
      if (blob) router.refresh();
    }
    return { ...result, round };
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
              {v.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- مرفق برفع المستخدم برابطٍ موقّع قصير العمر: لا محسّن صور يخزّنه أبعد منه
                <img className={styles.thumb} src={v.imageUrl} alt="الصورة المرفقة" />
              ) : null}
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
      <ImageField error={state.fieldErrors?.["image"]} />
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

/** صورةٌ اختيارية بمعاينةٍ وزرّ إزالة — والتصغير وإزالة الموقع عند الإرسال (adr/0054 د٣). */
function ImageField({ error }: { error?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <Field id="voice-image" label="صورة (اختيارية)" hint="لقطة شاشة أو صورة توضّح ما تقصد. يُزال منها موقع التصوير قبل رفعها." error={error} span="full">
      <div className={styles.imageField}>
        <input
          ref={input}
          id="voice-image"
          name="image"
          type="file"
          accept={VOICE_IMAGE_SOURCE_TYPES.join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
        {preview ? (
          <div className={styles.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element -- معاينةٌ محلّية لملفٍّ لم يُرفع بعد */}
            <img className={styles.thumb} src={preview} alt="معاينة الصورة" />
            <Button
              onClick={() => {
                if (input.current) input.current.value = "";
                setPreview(null);
              }}
            >
              إزالة الصورة
            </Button>
          </div>
        ) : null}
      </div>
    </Field>
  );
}
