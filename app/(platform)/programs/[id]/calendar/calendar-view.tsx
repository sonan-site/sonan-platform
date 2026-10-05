"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useActionState, useTransition, type ReactNode } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { ActionForm } from "@/components/shared/action-form";
import { DateField } from "@/components/shared/date-field";
import { Button, Input, Select } from "@/components/shared/form";
import { TabHead } from "@/components/shared/steps";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { formatDateBoth, formatNumber } from "@/lib/format";
import {
  deadlineOn,
  effectiveValues,
  ENGINE_LABEL,
  WEEK_DAYS,
  type EngineKey,
  type EngineValues,
  type TrackOverrides,
} from "@/lib/programs/engine-settings";
import {
  addCalendarException,
  customizeEngineSetting,
  inheritEngineSetting,
  removeCalendarException,
  saveEngineSetting,
} from "./actions";
import styles from "./calendar.module.css";

export type TrackSettings = {
  id: string;
  name: string;
  overrides: TrackOverrides;
  values: EngineValues;
};

/** «١١:٠٠ م» — الوقت بنظام اثنتي عشرة ساعة كما يُقرأ. */
function timeLabel(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const pm = h >= 12;
  const hour = h % 12 || 12;
  return `${formatNumber(hour)}:${String(m).padStart(2, "0").replace(/\d/g, (d) => formatNumber(Number(d)))} ${pm ? "م" : "ص"}`;
}

function dateLabel(day: string): string {
  return formatDateBoth(`${day}T12:00:00Z`);
}

export function CalendarView({
  programId,
  today,
  program,
  tracks,
  current,
}: {
  programId: string;
  today: string;
  program: EngineValues;
  tracks: TrackSettings[];
  /** المسار المفتوح — وبلا مسار: البرنامج. */
  current: TrackSettings | null;
}) {
  const values = effectiveValues(program, current);
  const trackId = current?.id ?? null;
  const base = `/programs/${programId}/calendar`;

  const card = (key: EngineKey, body: (disabled: boolean) => ReactNode) => (
    <SettingCard
      key={key}
      settingKey={key}
      programId={programId}
      track={current}
      custom={current ? Boolean(current.overrides[key]) : null}
    >
      {body(current !== null && !current.overrides[key])}
    </SettingCard>
  );

  return (
    <>
      <TabHead
        title="التقويم وقواعد التقدّم"
        lede="بها يُحكم على كل يوم: أتمّ المشارك، أو أعفاه تقدّمه، أو تعثّر. وهي لا تنقله بين أيام خطته — الانتقال بإتمام يومه وحده. تُضبط للبرنامج كله، ويُخصَّص منها ما يختلف في مسار."
      />

      {/* مجموعة روابط لا عنصر تنقّل: التنقّل حكرٌ على مصدره (`nav-outside-source`). */}
      <div className={styles.scopes} role="group" aria-label="نطاق الإعدادات">
        <Link href={base} className={`${styles.scope} ${current ? "" : styles.scopeOn}`} aria-current={current ? undefined : "page"}>
          البرنامج — للكل
        </Link>
        {tracks.map((t) => {
          const customized = Object.values(t.overrides).filter(Boolean).length;
          return (
            <Link
              key={t.id}
              href={`${base}?scope=${t.id}`}
              className={`${styles.scope} ${current?.id === t.id ? styles.scopeOn : ""}`}
              aria-current={current?.id === t.id ? "page" : undefined}
            >
              {t.name}
              {customized > 0 ? <span className={styles.badge}>{formatNumber(customized)} مخصّص</span> : null}
            </Link>
          );
        })}
      </div>

      {current ? (
        <p className={styles.note}>
          «{current.name}» يرث إعدادات البرنامج. ما تخصّصه هنا يحلّ محلّ الموروث في هذا المسار وحده، ويبقى
          الباقي يتبع البرنامج.
        </p>
      ) : null}

      {/* مفتاحٌ بالنطاق: تبديل المسار لا يُعيد بناء الصفحة، فتبقى قيمٌ في الحالة من نطاقٍ سابق. */}
      <div className={styles.grid} key={trackId ?? "program"}>
        {card("start_date", (disabled) => (
          <ValueForm programId={programId} trackId={trackId} settingKey="start_date" disabled={disabled}>
            <DateField
              key={values.startDate ?? ""}
              id="start_date"
              name="value"
              kind="event"
              defaultValue={values.startDate ?? ""}
            />
          </ValueForm>
        ))}

        {card("work_days", (disabled) => (
          <ValueForm programId={programId} trackId={trackId} settingKey="work_days" disabled={disabled}>
            <div className={styles.days}>
              {WEEK_DAYS.map(({ day, label }) => (
                <label key={day} className={styles.day}>
                  <input type="checkbox" name="day" value={day} defaultChecked={values.workDays.includes(day)} disabled={disabled} />
                  {label}
                </label>
              ))}
            </div>
          </ValueForm>
        ))}

        {card("exceptions", (disabled) => (
          <Exceptions programId={programId} trackId={trackId} days={values.exceptions} disabled={disabled} />
        ))}

        {card("deadline", (disabled) => (
          <>
            <ValueForm programId={programId} trackId={trackId} settingKey="deadline" disabled={disabled}>
              <Input
                type="time"
                name="value"
                aria-label="وقت نهاية الرصد"
                defaultValue={deadlineOn(values.deadlines, today)}
                disabled={disabled}
                latin
              />
            </ValueForm>
            {values.deadlines.length > 1 ? (
              <ul className={styles.history}>
                {values.deadlines.map((row, i) => (
                  <li key={row.from}>
                    {i === 0 ? "قبل ذلك" : `من ${dateLabel(row.from)}`}: {timeLabel(row.time)}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ))}

        {card("daily_limit", (disabled) => (
          <ValueForm programId={programId} trackId={trackId} settingKey="daily_limit" disabled={disabled}>
            <Input
              type="number"
              name="value"
              min={1}
              max={20}
              numeric
              aria-label="الحد اليومي"
              defaultValue={values.dailyLimit}
              disabled={disabled}
              style={{ maxInlineSize: "6rem" }}
            />
          </ValueForm>
        ))}

        {card("credit_enabled", (disabled) => (
          <ToggleForm
            programId={programId}
            trackId={trackId}
            settingKey="credit_enabled"
            on={values.creditEnabled}
            disabled={disabled}
          />
        ))}

        {card("compensation_enabled", (disabled) => (
          <ToggleForm
            programId={programId}
            trackId={trackId}
            settingKey="compensation_enabled"
            on={values.compensationEnabled}
            disabled={disabled}
          />
        ))}

        {card("progress_measure", (disabled) => (
          <ValueForm programId={programId} trackId={trackId} settingKey="progress_measure" disabled={disabled}>
            <Select name="value" aria-label="مقياس نسبة الإنجاز" defaultValue={values.progressMeasure} disabled={disabled}>
              <option value="units">بالوحدات</option>
              <option value="days">بالأيام</option>
            </Select>
          </ValueForm>
        ))}
      </div>
    </>
  );
}

function SettingCard({
  settingKey,
  programId,
  track,
  custom,
  children,
}: {
  settingKey: EngineKey;
  programId: string;
  track: TrackSettings | null;
  /** `null` على البرنامج — لا وراثة فيه. */
  custom: boolean | null;
  children: ReactNode;
}) {
  const [busy, startTransition] = useTransition();
  const { title, hint } = ENGINE_LABEL[settingKey];
  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {track && custom !== null ? (
          <span className={styles.inherit}>
            <span className={custom ? styles.pillCustom : styles.pill}>{custom ? "مخصّص" : "موروث"}</span>
            <button
              type="button"
              className={styles.link}
              disabled={busy}
              onClick={() =>
                startTransition(async () =>
                  reportAction(
                    custom
                      ? await inheritEngineSetting(programId, track.id, settingKey)
                      : await customizeEngineSetting(programId, track.id, settingKey),
                  ),
                )
              }
            >
              {custom ? "إرجاع للموروث" : "تخصيص"}
            </button>
          </span>
        ) : null}
      </header>
      {children}
      <p className={styles.hint}>{hint}</p>
    </section>
  );
}

function Hidden({ programId, trackId, settingKey }: { programId: string; trackId: string | null; settingKey: EngineKey }) {
  return (
    <>
      <input type="hidden" name="programId" value={programId} />
      <input type="hidden" name="trackId" value={trackId ?? ""} />
      <input type="hidden" name="key" value={settingKey} />
    </>
  );
}

function Messages({ state }: { state: FormState }) {
  const error = state.error ?? state.fieldErrors?.value;
  return (
    <>
      {error ? <p className={styles.error}>{error}</p> : null}
      {state.notice ? <p className={styles.ok}>{state.notice}</p> : null}
    </>
  );
}

function ValueForm({
  programId,
  trackId,
  settingKey,
  disabled,
  children,
}: {
  programId: string;
  trackId: string | null;
  settingKey: EngineKey;
  disabled: boolean;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(saveEngineSetting, EMPTY_FORM_STATE);
  return (
    <ActionForm action={action} state={state} className={styles.form}>
      <Hidden programId={programId} trackId={trackId} settingKey={settingKey} />
      <fieldset className={styles.fieldset} disabled={disabled}>
        {children}
        <Button type="submit" pending={pending}>
          احفظ
        </Button>
      </fieldset>
      <Messages state={state} />
    </ActionForm>
  );
}

function ToggleForm({
  programId,
  trackId,
  settingKey,
  on,
  disabled,
}: {
  programId: string;
  trackId: string | null;
  settingKey: EngineKey;
  on: boolean;
  disabled: boolean;
}) {
  return (
    <ValueForm programId={programId} trackId={trackId} settingKey={settingKey} disabled={disabled}>
      <label className={styles.day}>
        <input type="checkbox" name="value" defaultChecked={on} disabled={disabled} />
        مفعّل
      </label>
    </ValueForm>
  );
}

function Exceptions({
  programId,
  trackId,
  days,
  disabled,
}: {
  programId: string;
  trackId: string | null;
  days: string[];
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(addCalendarException, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  return (
    <>
      <ActionForm action={action} state={state} className={styles.form}>
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="trackId" value={trackId ?? ""} />
        <fieldset className={styles.fieldset} disabled={disabled}>
          <DateField id="exception_date" name="date" kind="event" />
          <Button type="submit" pending={pending}>
            أضِف
          </Button>
        </fieldset>
        {state.error ?? state.fieldErrors?.date ? (
          <p className={styles.error}>{state.error ?? state.fieldErrors?.date}</p>
        ) : null}
      </ActionForm>
      {days.length === 0 ? (
        <p className={styles.hint}>بلا توقّف.</p>
      ) : (
        <ul className={styles.chips}>
          {days.map((day) => (
            <li key={day} className={styles.chip}>
              {dateLabel(day)}
              {disabled ? null : (
                <button
                  type="button"
                  className={styles.chipX}
                  aria-label={`حذف ${dateLabel(day)}`}
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => reportAction(await removeCalendarException(programId, trackId, day)))
                  }
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
