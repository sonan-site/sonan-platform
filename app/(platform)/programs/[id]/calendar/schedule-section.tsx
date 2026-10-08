"use client";

import { Pencil, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
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
import {
  addScheduleEntry,
  removeScheduleEntry,
  saveRegistrationWindow,
  updateScheduleEntry,
} from "./actions";
import styles from "./calendar.module.css";

/**
 * مواعيد البرنامج (`adr/0044`): تُعرض في الصفحة المعلنة بالتقويمين وحالتها.
 * كل موعدٍ يُعدَّل في مكانه، وموعد التسجيل تعديله تعديلُ نافذة التسجيل نفسها.
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
  const [busy, startTransition] = useTransition();
  // «registration» لموعد التسجيل المشتقّ، ومعرّف الصفّ لغيره.
  const [editing, setEditing] = useState<string | null>(null);
  const hasRegistration = entries.some((e) => e.id === null);

  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>مواعيد البرنامج</h2>
      </header>
      <p className={styles.hint}>
        تظهر في الصفحة المعلنة بالتاريخين الهجري والميلادي، ويُعلَّم الجاري منها تلقائياً. وموعد التسجيل
        هو نافذة التسجيل نفسها — تعديله هنا يعدّلها.
      </p>

      {entries.length === 0 ? (
        <p className={styles.hint}>لا مواعيد بعد.</p>
      ) : (
        <ul className={styles.schedule}>
          {entries.map((e) => {
            const key = e.id ?? "registration";
            const status = scheduleStatus(e, today);
            if (editing === key) {
              return (
                <li key={key} className={styles.scheduleEdit}>
                  {e.id === null ? (
                    <WindowForm programId={programId} entry={e} onDone={() => setEditing(null)} />
                  ) : (
                    <EntryForm programId={programId} entry={e} onDone={() => setEditing(null)} />
                  )}
                </li>
              );
            }
            return (
              <li key={key} className={styles.scheduleRow}>
                <div className={styles.scheduleMain}>
                  <strong>{e.title}</strong>
                  <span className={styles.hint}>{scheduleRangeLabel(e)}</span>
                  {e.note ? <span className={styles.hint}>{e.note}</span> : null}
                  {e.id === null ? <span className={styles.hint}>نافذة التسجيل</span> : null}
                </div>
                <span className={status === "now" ? styles.pillCustom : styles.pill}>
                  {SCHEDULE_STATUS_LABEL[status]}
                </span>
                <button
                  type="button"
                  className={styles.chipX}
                  aria-label={`تعديل موعد ${e.title}`}
                  onClick={() => setEditing(key)}
                >
                  <Pencil size={16} strokeWidth={1.5} aria-hidden />
                </button>
                {e.id === null ? null : (
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

      {hasRegistration ? null : (
        <p className={styles.hint}>
          لا نافذة تسجيل بعد — اضبطها من «نظرة عامة»، أو{" "}
          <button type="button" className={styles.link} onClick={() => setEditing("registration")}>
            من هنا
          </button>
          .
        </p>
      )}
      {editing === "registration" && !hasRegistration ? (
        <WindowForm programId={programId} entry={null} onDone={() => setEditing(null)} />
      ) : null}

      <EntryForm programId={programId} entry={null} onDone={() => undefined} />
    </section>
  );
}

/** نموذج موعدٍ — إضافةً بلا موعد، وتعديلاً بموعده. */
function EntryForm({
  programId,
  entry,
  onDone,
}: {
  programId: string;
  entry: ScheduleEntry | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (prev: typeof EMPTY_FORM_STATE, form: FormData) => {
      const result = await (entry ? updateScheduleEntry : addScheduleEntry)(prev, form);
      if (entry && result.notice) onDone();
      return result;
    },
    EMPTY_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `schedule_${entry?.id ?? "new"}_${name}`;

  return (
    <ActionForm action={action} state={state} className={styles.form}>
      <input type="hidden" name="programId" value={programId} />
      {entry?.id ? <input type="hidden" name="entryId" value={entry.id} /> : null}
      <div className={styles.scheduleFields}>
        <Field id={id("title")} label="العنوان" error={errors.title}>
          <Input
            id={id("title")}
            name="title"
            maxLength={60}
            defaultValue={entry?.title ?? ""}
            placeholder="الاختبار المرحلي"
            invalid={Boolean(errors.title)}
          />
        </Field>
        <Field id={id("starts")} label="يبدأ" error={errors.startsOn}>
          <DateField
            id={id("starts")}
            name="startsOn"
            kind="event"
            defaultValue={entry?.startsOn ?? ""}
            invalid={Boolean(errors.startsOn)}
          />
        </Field>
        <Field id={id("ends")} label="ينتهي" hint="اتركه فارغاً لموعد يومٍ واحد" error={errors.endsOn}>
          <DateField
            id={id("ends")}
            name="endsOn"
            kind="event"
            defaultValue={entry?.endsOn ?? ""}
            invalid={Boolean(errors.endsOn)}
          />
        </Field>
        <Field id={id("note")} label="ملاحظة" hint="اختيارية" error={errors.note}>
          <Input
            id={id("note")}
            name="note"
            maxLength={160}
            defaultValue={entry?.note ?? ""}
            invalid={Boolean(errors.note)}
          />
        </Field>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      <div className={styles.formActions}>
        <Button type="submit" pending={pending}>
          {entry ? "احفظ الموعد" : "أضِف الموعد"}
        </Button>
        {entry ? (
          <Button type="button" onClick={onDone}>
            إلغاء
          </Button>
        ) : null}
      </div>
    </ActionForm>
  );
}

/** موعد التسجيل: يومُ الفتح ويومُ الإغلاق — يُحفظان في نافذة التسجيل. */
function WindowForm({
  programId,
  entry,
  onDone,
}: {
  programId: string;
  entry: ScheduleEntry | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (prev: typeof EMPTY_FORM_STATE, form: FormData) => {
      const result = await saveRegistrationWindow(prev, form);
      if (result.notice) onDone();
      return result;
    },
    EMPTY_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <ActionForm action={action} state={state} className={styles.form}>
      <input type="hidden" name="programId" value={programId} />
      <div className={styles.scheduleFields}>
        <Field id="window_opens" label="يُفتح التسجيل" error={errors.registrationOpensAt}>
          <DateField
            id="window_opens"
            name="registrationOpensAt"
            kind="event"
            defaultValue={entry?.startsOn ?? ""}
            invalid={Boolean(errors.registrationOpensAt)}
          />
        </Field>
        <Field id="window_closes" label="يُغلق التسجيل" hint="آخر يومٍ فيه، بتوقيت الرياض" error={errors.registrationClosesAt}>
          <DateField
            id="window_closes"
            name="registrationClosesAt"
            kind="event"
            defaultValue={entry ? (entry.endsOn ?? entry.startsOn) : ""}
            invalid={Boolean(errors.registrationClosesAt)}
          />
        </Field>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      <div className={styles.formActions}>
        <Button type="submit" pending={pending}>
          احفظ نافذة التسجيل
        </Button>
        <Button type="button" onClick={onDone}>
          إلغاء
        </Button>
      </div>
    </ActionForm>
  );
}
