"use client";

import { X } from "lucide-react";
import { useActionState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { ActionForm } from "@/components/shared/action-form";
import { DateField } from "@/components/shared/date-field";
import { Button, Field, Input } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import {
  SCHEDULE_STATUS_LABEL,
  scheduleRangeLabel,
  scheduleStatus,
  type ScheduleEntry,
} from "@/lib/programs/schedule";
import { addScheduleEntry, removeScheduleEntry } from "./actions";
import styles from "./calendar.module.css";

/**
 * مواعيد البرنامج (`adr/0044`): تُعرض في الصفحة المعلنة بالتقويمين وحالتها.
 * والتسجيل بينها مشتقٌّ من نافذته — يُعدَّل من «نظرة عامة» لا من هنا.
 */
export function ScheduleSection({
  programId,
  today,
  entries,
}: {
  programId: string;
  today: string;
  entries: ScheduleEntry[];
}) {
  const [state, action, pending] = useActionState(addScheduleEntry, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};

  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>مواعيد البرنامج</h2>
      </header>
      <p className={styles.hint}>
        تظهر في الصفحة المعلنة بالتاريخين الهجري والميلادي، ويُعلَّم الجاري منها تلقائياً. وموعد التسجيل
        يتبع نافذة التسجيل في «نظرة عامة».
      </p>

      {entries.length === 0 ? (
        <p className={styles.hint}>لا مواعيد بعد.</p>
      ) : (
        <ul className={styles.schedule}>
          {entries.map((e) => {
            const status = scheduleStatus(e, today);
            return (
              <li key={e.id ?? "registration"} className={styles.scheduleRow}>
                <div className={styles.scheduleMain}>
                  <strong>{e.title}</strong>
                  <span className={styles.hint}>{scheduleRangeLabel(e)}</span>
                  {e.note ? <span className={styles.hint}>{e.note}</span> : null}
                </div>
                <span className={status === "now" ? styles.pillCustom : styles.pill}>
                  {SCHEDULE_STATUS_LABEL[status]}
                </span>
                {e.id === null ? (
                  <span className={styles.hint}>من نافذة التسجيل</span>
                ) : (
                  <button
                    type="button"
                    className={styles.chipX}
                    aria-label={`حذف موعد ${e.title}`}
                    disabled={busy}
                    onClick={() =>
                      startTransition(async () => reportAction(await removeScheduleEntry(programId, e.id!)))
                    }
                  >
                    <X size={16} strokeWidth={1.5} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ActionForm action={action} state={state} className={styles.form}>
        <input type="hidden" name="programId" value={programId} />
        <div className={styles.scheduleFields}>
          <Field id="schedule_title" label="العنوان" error={errors.title}>
            <Input id="schedule_title" name="title" maxLength={60} placeholder="الاختبار المرحلي" invalid={Boolean(errors.title)} />
          </Field>
          <Field id="schedule_starts" label="يبدأ" error={errors.startsOn}>
            <DateField id="schedule_starts" name="startsOn" kind="event" invalid={Boolean(errors.startsOn)} />
          </Field>
          <Field id="schedule_ends" label="ينتهي" hint="اتركه فارغاً لموعد يومٍ واحد" error={errors.endsOn}>
            <DateField id="schedule_ends" name="endsOn" kind="event" invalid={Boolean(errors.endsOn)} />
          </Field>
          <Field id="schedule_note" label="ملاحظة" hint="اختيارية" error={errors.note}>
            <Input id="schedule_note" name="note" maxLength={160} invalid={Boolean(errors.note)} />
          </Field>
        </div>
        {state.error ? <p className={styles.error}>{state.error}</p> : null}
        <div>
          <Button type="submit" pending={pending}>
            أضِف الموعد
          </Button>
        </div>
      </ActionForm>
    </section>
  );
}
