"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * حاوية الأعمدة تُفتح على أحدثها (مراجعة الكود ملاحظة ٤): الزمن من اليمين، فالأحدث في نهاية السطر —
 * وفي المدى الطويل يقع خارج الشاشة. والتمرير إلى النهاية في RTL قيمةٌ سالبة.
 */
export function ScrollToLatest({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: -el.scrollWidth });
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
