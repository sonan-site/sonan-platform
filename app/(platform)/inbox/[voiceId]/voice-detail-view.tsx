"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { reportAction } from "@/components/shared/action-notice";
import { Button, Field, FormActions, Textarea } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateTime } from "@/lib/format";
import { VOICE_STATUS_STAFF, VOICE_STATUSES, type VoiceStatus } from "@/lib/voices/voices";
import { archiveVoice, replyVoice, setVoiceStatus } from "../actions";
import styles from "../inbox.module.css";

export type VoiceDetail = {
  id: string;
  body: string;
  status: VoiceStatus;
  reply: string | null;
  repliedAt: string | null;
  /** الاسم الحقيقي للإدارة — والطالب يرى «فريق البرنامج». */
  repliedBy: string | null;
  replySeen: boolean;
  sender: string;
  phone: string | null;
  registrationNo: string | null;
  track: string | null;
  program: string | null;
  path: string | null;
  ua: string | null;
  viewport: string | null;
  /** رابطٌ موقّع قصير العمر للصورة المرفقة، إن كانت. */
  imageUrl: string | null;
  /** للرسالة صورة وتعذّر توليد رابطها. */
  imageFailed: boolean;
};

/** زرّ الانتقال إلى الحال — والمغلقة يعيد فتحها المشرف (قرار الراعي). */
const STATUS_ACTION: Record<VoiceStatus, string> = {
  new: "أعدها جديدة",
  in_progress: "قيد المعالجة",
  closed: "أغلقها",
};

export function VoiceDetailView({ voice }: { voice: VoiceDetail }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(replyVoice, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  return (
    <div className={styles.detail}>
      <section className={styles.card} aria-label="الرسالة">
        <p className={styles.body}>{voice.body}</p>
        {voice.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- مرفق برفع المستخدم برابطٍ موقّع قصير العمر: لا محسّن صور يخزّنه أبعد منه
          <img className={styles.image} src={voice.imageUrl} alt="الصورة المرفقة بالرسالة" />
        ) : voice.imageFailed ? (
          <p className={styles.muted}>للرسالة صورةٌ مرفقة تعذّر عرضها الآن. حدّث الصفحة.</p>
        ) : null}
      </section>

      <section className={styles.card} aria-label="المرسِل والسياق">
        <dl className={styles.meta}>
          <dt>المرسِل</dt>
          <dd>{voice.sender}</dd>
          {voice.phone ? (
            <>
              <dt>الجوال</dt>
              <dd>
                <bdi dir="ltr">{voice.phone}</bdi>
              </dd>
            </>
          ) : null}
          {voice.registrationNo ? (
            <>
              <dt>رقم التسجيل</dt>
              <dd>
                <bdi dir="ltr">{voice.registrationNo}</bdi>
              </dd>
            </>
          ) : null}
          <dt>البرنامج</dt>
          <dd>{[voice.program, voice.track].filter(Boolean).join(" · ") || "بلا مشاركة"}</dd>
          {voice.path ? (
            <>
              <dt>الصفحة</dt>
              <dd>
                <bdi dir="ltr">{voice.path}</bdi>
              </dd>
            </>
          ) : null}
          {voice.viewport ? (
            <>
              <dt>الشاشة</dt>
              <dd>
                <bdi dir="ltr">{voice.viewport}</bdi>
              </dd>
            </>
          ) : null}
          {voice.ua ? (
            <>
              <dt>المتصفح</dt>
              <dd>
                <bdi dir="ltr">{voice.ua}</bdi>
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className={styles.card} aria-label="الحال">
        <p className={styles.muted}>الحال: {VOICE_STATUS_STAFF[voice.status]}</p>
        <div className={styles.actions}>
          {VOICE_STATUSES.filter((s) => s !== voice.status).map((s) => (
            <Button
              key={s}
              pending={busy}
              onClick={() => startTransition(async () => reportAction(await setVoiceStatus(voice.id, s)))}
            >
              {STATUS_ACTION[s]}
            </Button>
          ))}
          <Button variant="danger" onClick={() => setConfirmArchive(true)}>
            أرشفة
          </Button>
        </div>
      </section>

      <section className={styles.card} aria-label="الرد">
        {voice.reply ? (
          <p className={styles.muted}>
            ردّ {voice.repliedBy ?? "—"}
            {voice.repliedAt ? ` · ${formatDateTime(voice.repliedAt)}` : ""} · {voice.replySeen ? "قرأه الطالب" : "لم يقرأه بعد"}
          </p>
        ) : (
          <p className={styles.muted}>لم يُردّ بعد. يرى الطالب ردّك باسم فريق البرنامج.</p>
        )}
        {state.notice ? <p className={styles.muted} role="status">{state.notice}</p> : null}
        {state.error ? <p className={styles.muted} role="alert">{state.error}</p> : null}
        <ActionForm action={action} state={state}>
          <input type="hidden" name="id" value={voice.id} />
          <Field id="voice-reply" label={voice.reply ? "تعديل الرد" : "الرد"} required error={state.fieldErrors?.["reply"]} span="full">
            <Textarea id="voice-reply" name="reply" rows={4} maxLength={1000} defaultValue={voice.reply ?? ""} required />
          </Field>
          <label className={styles.muted}>
            <input type="checkbox" name="close" /> أغلق الرسالة مع الرد
          </label>
          <FormActions>
            <Button type="submit" variant="primary" pending={pending}>
              {voice.reply ? "احفظ التعديل" : "أرسل الرد"}
            </Button>
          </FormActions>
        </ActionForm>
      </section>

      <Modal open={confirmArchive} title="أرشفة الرسالة" onClose={() => setConfirmArchive(false)}>
        <p>تخرج الرسالة من الصندوق، ويراها الطالب «مغلقة». للمكرّر أو المزعج — وإن أردت أن تقول له شيئاً فردّ قبل الأرشفة.</p>
        <FormActions>
          <Button onClick={() => setConfirmArchive(false)}>إلغاء</Button>
          <Button
            variant="danger"
            pending={busy}
            onClick={() =>
              startTransition(async () => {
                const r = await archiveVoice(voice.id);
                reportAction(r);
                if (!r.error) router.push("/inbox");
              })
            }
          >
            أرشفة
          </Button>
        </FormActions>
      </Modal>
    </div>
  );
}
