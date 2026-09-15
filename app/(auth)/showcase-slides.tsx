"use client";

import { useEffect, useState } from "react";
import type { Slide } from "@/lib/settings/showcase";
import styles from "./layout.module.css";

const INTERVAL_MS = 6000;

/**
 * الشرائح تتبدّل وحدها، والنقاط تنقل إلى أيٍّ منها. **لا تتبدّل** لمن طلب
 * تقليل الحركة، ولا وهو يمرّر المؤشر فوقها ليقرأ.
 */
export function ShowcaseSlides({ slides }: { slides: Slide[] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setCurrent((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [slides.length, paused]);

  const slide = slides[current] ?? slides[0];
  if (!slide) return null;

  return (
    <div
      className={styles.slides}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div key={current} className={styles.slide} aria-live="polite">
        <p className={styles.slideTitle}>{slide.title}</p>
        {slide.body ? <p className={styles.slideBody}>{slide.body}</p> : null}
      </div>

      {slides.length > 1 ? (
        <div className={styles.dots}>
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              className={styles.dot}
              aria-label={`الشريحة ${i + 1}: ${s.title}`}
              aria-current={i === current || undefined}
              onClick={() => setCurrent(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
