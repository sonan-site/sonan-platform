"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import {
  ageLabel,
  birthYears,
  eventYears,
  initialMonth,
  monthGrid,
  MONTHS,
  parseDateInput,
  toDateValue,
  WEEKDAYS,
} from "@/lib/format/calendar";
import styles from "./date-field.module.css";

/**
 * تقويم المنصة — بديل `input[type=date]`.
 *
 * تقويم المتصفح شكله من نظام التشغيل لا من المنصة، وارتفاعه يخالف بقية
 * الخانات. وهنا: **الشهر والسنة قائمتان** لا أسهم تُضغط مئة مرة — فسنة الميلاد
 * نقرتان. والقيمة تُرسَل `YYYY-MM-DD` كما كانت، فلا تتغيّر قواعد التحقق.
 *
 * والميلاد الفارغ يُفتح بلا سنة: الأيام لا تظهر حتى تُختار، والعمر يظهر تحت الحقل بعد الاختيار.
 */
export function DateField({
  id,
  name,
  defaultValue = "",
  invalid,
  kind = "birth",
}: {
  id: string;
  name: string;
  defaultValue?: string;
  invalid?: boolean;
  /** `birth` للميلاد: مئة سنة مضت. و`event` لموعدٍ قريب: سنة قبل وثلاث بعد، ويُفتح على الشهر الجاري. */
  kind?: "birth" | "event";
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => initialMonth(defaultValue, kind));
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = parseDateInput(value);
  const year = view.year;
  const weeks = year === null ? [] : monthGrid(year, view.month);
  const age = kind === "birth" ? ageLabel(value) : null;

  function pick(day: number) {
    if (year === null) return;
    setValue(toDateValue({ year, month: view.month, day }));
    setOpen(false);
  }

  return (
    <div className={styles.wrap} ref={wrap}>
      {/* الحقل المخفيّ لا يُتحقَّق منه في المتصفح — التحقّق في `profileSchema`. */}
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        id={id}
        className={`${styles.trigger} ${invalid ? styles.invalid : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setView(initialMonth(value, kind));
          setOpen((v) => !v);
        }}
      >
        <CalendarDays size={16} aria-hidden />
        <span className={value ? styles.value : styles.placeholder}>
          {value ? formatDate(`${value}T00:00:00Z`) : "اختر التاريخ"}
        </span>
        <ChevronDown size={16} aria-hidden />
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="اختيار التاريخ">
          <div className={styles.head}>
            <select
              className={styles.pick}
              aria-label="الشهر"
              value={view.month}
              onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
            >
              {MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className={styles.pick}
              aria-label="السنة"
              value={view.year ?? ""}
              onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
            >
              {view.year === null ? (
                <option value="" disabled>
                  اختر السنة
                </option>
              ) : null}
              {(kind === "event" ? eventYears() : birthYears()).map((y) => (
                <option key={y} value={y}>
                  {/* السنة تسميةٌ لا كمّية: بلا فاصل الآلاف («2,006»). */}
                  {String(y)}
                </option>
              ))}
            </select>
          </div>

          {year === null ? (
            <p className={styles.yearFirst}>اختر السنة أولاً</p>
          ) : (
            <div className={styles.weekdays} aria-hidden>
              {WEEKDAYS.map((day) => (
                <span key={day}>{day.slice(0, 3)}</span>
              ))}
            </div>
          )}

          <div className={styles.grid}>
            {weeks.flat().map((day, i) =>
              day === null ? (
                <span key={`x${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  className={styles.day}
                  aria-current={
                    selected?.day === day &&
                    selected.month === view.month &&
                    selected.year === year
                      ? "date"
                      : undefined
                  }
                  onClick={() => pick(day)}
                >
                  {formatNumber(day)}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}

      {age ? <p className={styles.age}>{age}</p> : null}
    </div>
  );
}
