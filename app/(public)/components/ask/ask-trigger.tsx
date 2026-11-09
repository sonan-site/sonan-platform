"use client";

import type { MouseEvent, ReactNode } from "react";

/** الحدث الذي تلتقطه نافذة المساعد (`AskWidget`). وحدةٌ بلا خادم — فيستوردها الإطار الجامع. */
export const OPEN_EVENT = "sonan:ask-open";

/**
 * مدخلٌ إلى المساعد بنصٍّ أو أيقونة: يفتح النافذة إن كانت في الصفحة، وإلا مضى إلى صفحة المساعد.
 */
export function AskTrigger({
  slug,
  className,
  label,
  children,
}: {
  slug: string;
  className?: string | undefined;
  /** لما كان أيقونةً بلا نصّ. */
  label?: string | undefined;
  children: ReactNode;
}) {
  return (
    <a
      href={`/p/${slug}/ask`}
      className={className}
      aria-label={label}
      title={label}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        // `dispatchEvent` يعيد false حين التقطته النافذة — فلا يُتبع الرابط.
        if (!window.dispatchEvent(new Event(OPEN_EVENT, { cancelable: true }))) e.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
