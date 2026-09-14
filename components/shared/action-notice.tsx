"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { FormState } from "@/lib/auth/form-state";
import styles from "./action-notice.module.css";

/**
 * نتيجة أزرار النقرة الواحدة — **الواحد** (`platform.md §١١`).
 *
 * «إيقاف» و«حذف» و«نشر» تُنفَّذ بلا نموذج، وكانت نتيجتها تُرمى: الإجراء
 * يُرجع «تعذّر حذف النصيب»، والشاشة لا تقول شيئاً فيظنّ المُعِدّ أنه تمّ.
 * هنا مخزن واحد: أي زرّ يُبلغ نتيجته بـ`reportAction`، والتخطيط الجامع
 * يعرضها مرّة واحدة، فلا تُنسى في شاشة.
 */

type Notice = { id: number; state: FormState } | null;

let current: Notice = null;
let counter = 0;
const listeners = new Set<() => void>();

function emit(next: Notice) {
  current = next;
  for (const listener of listeners) listener();
}

/** يُستدعى بنتيجة الإجراء. الفارغة (لا خطأ ولا تنبيه) تُخفي ما كان معروضاً. */
export function reportAction(state: FormState): void {
  counter += 1;
  emit(state.error || state.notice ? { id: counter, state } : null);
}

const VISIBLE_MS = 6000;

export function ActionNotice() {
  const notice = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      if (current?.id === notice.id) emit(null);
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  const { error, notice: ok } = notice.state;

  return (
    <div
      role={error ? "alert" : "status"}
      className={`${styles.notice} ${error ? styles.error : styles.ok}`}
    >
      <span>{error ?? ok}</span>
      <button type="button" className={styles.close} onClick={() => emit(null)} aria-label="إغلاق">
        ×
      </button>
    </div>
  );
}
