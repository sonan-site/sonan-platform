"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COUNTRIES, type Country } from "@/lib/profile/phone";
import styles from "./country-select.module.css";

/**
 * اختيار دولة — قائمة مبنيّة لا `select`.
 *
 * **لماذا لا `select`:** المغلقة تعرض نصّ الخيار نفسه، فمفتاح الجوال يعرض اسم
 * الدولة كاملاً ويزاحم الرقم. وهنا المغلق يعرض ما يلزم فقط (`+966`)، والمفتوح
 * يعرض الأسماء والمفاتيح مع بحثٍ بالاسم — والقائمة نحو ٢٥٠ دولة.
 *
 * القيمة تُرسَل في حقل مخفيّ باسمها، فما يصل الخادم هو ما كان يصله من القائمة
 * الأصلية: رمز الدولة من حرفين.
 */

type Mode = "dial" | "name";

export function CountrySelect({
  name,
  value,
  onChange,
  label,
  mode = "dial",
  invalid,
}: {
  name: string;
  value: string;
  onChange?: (code: string) => void;
  /** يُقرأ للقارئ الآلي: «مفتاح دولة الجوال» أو «الجنسية». */
  label: string;
  /** المغلق: مفتاح الاتصال، أو اسم الدولة. */
  mode?: Mode;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const selected = COUNTRIES.find((c) => c.code === value) ?? COUNTRIES[0]!;
  const matches = filterCountries(query);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();

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

  function pick(code: string) {
    onChange?.(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={styles.wrap} ref={wrap}>
      <input type="hidden" name={name} value={selected.code} />

      <button
        type="button"
        className={`${styles.trigger} ${invalid ? styles.invalid : ""}`}
        aria-label={`${label}: ${selected.name}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={mode === "dial" ? styles.dial : styles.name}>
          {mode === "dial" ? selected.dial : selected.name}
        </span>
        <ChevronDown size={16} aria-hidden />
      </button>

      {open ? (
        <div className={styles.panel}>
          <input
            ref={search}
            type="search"
            className={styles.search}
            placeholder="ابحث عن دولة"
            aria-label="ابحث عن دولة"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const first = matches[0];
                if (first) pick(first.code);
              }
            }}
          />
          <ul className={styles.list} role="listbox" aria-label={label}>
            {matches.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.code === selected.code}
                  className={styles.option}
                  onClick={() => pick(c.code)}
                >
                  <span className={styles.optionCheck}>
                    {c.code === selected.code ? <Check size={16} aria-hidden /> : null}
                  </span>
                  <span className={styles.optionName}>{c.name}</span>
                  <span className={styles.dial}>{c.dial}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? <li className={styles.none}>لا دولة بهذا الاسم</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** بحثٌ بالاسم العربي أو بالمفتاح أو برمز الدولة — كلٌّ يكتب بما يعرف. */
export function filterCountries(query: string): Country[] {
  const q = query.trim();
  if (!q) return [...COUNTRIES];
  const upper = q.toUpperCase();
  return COUNTRIES.filter(
    (c) => c.name.includes(q) || c.dial.includes(q.replace("+", "")) || c.code === upper,
  );
}
