"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import {
  birthYears,
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
 */
export function DateField({
  id,
  name,
  defaultValue = "",
  invalid,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  invalid?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => initialMonth(defaultValue));
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
  const weeks = monthGrid(view.year, view.month);

  function pick(day: number) {
    setValue(toDateValue({ year: view.year, month: view.month, day }));
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
          setView(initialMonth(value));
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
              value={view.year}
              onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
            >
              {birthYears().map((year) => (
                <option key={year} value={year}>
                  {formatNumber(year)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.weekdays} aria-hidden>
            {WEEKDAYS.map((day) => (
              <span key={day}>{day.slice(0, 3)}</span>
            ))}
          </div>

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
                    selected.year === view.year
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
    </div>
  );
}
