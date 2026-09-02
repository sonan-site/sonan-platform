"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * قراءة تفضيل محفوظ في المتصفح **بلا `useEffect`**.
 *
 * `useSyncExternalStore` هي الأداة الصحيحة لمصدر حالة خارج React: تُرجع قيمة
 * الخادم أثناء التصيير، ثم تُزامن مع المتصفح بعده بلا تصيير متتالٍ.
 * وقراءة `localStorage` في تأثير ثم `setState` تُنتج تصييرين وومضة مرئية.
 */

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStoredState<T extends string>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return (window.localStorage.getItem(key) as T | null) ?? fallback;
      } catch {
        // تخزين محجوب (تصفّح خاص، أو منع من المستخدم) — الافتراض يعمل
        return fallback;
      }
    },
    () => fallback,
  );

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // لا شيء يتعطّل إن تعذّر الحفظ — يبقى الاختيار لهذه الجلسة
      }
      emit();
    },
    [key],
  );

  return [value, set];
}
