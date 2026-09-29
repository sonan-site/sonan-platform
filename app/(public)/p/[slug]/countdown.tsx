"use client";

import { useEffect, useState } from "react";
import { formatNumber, now } from "@/lib/format";
import styles from "./blocks.module.css";

/**
 * عدّاد الإغلاق.
 *
 * **مكوّن عميل لأن الوقت يمضي**: ما سواه في الصفحة يُصاغ في الخادم، وهذا وحده
 * يحتاج نبضة. وموعدُه من **بيانات البرنامج** لا من محتوى العنصر — فلا رقمان
 * يفترقان: ما يُعرَض للزائر هو ما يُغلق التسجيل فعلاً.
 *
 * ويبدأ فارغاً ثم يملأ بعد أول نبضة: الخادم والمتصفّح لا يتّفقان على «الآن»،
 * فعرضُه في الخادم يُنتج فرقاً بين ما صُيّر وما رُسم.
 */
export function Countdown({ closesAt, endedText }: { closesAt: string; endedText: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(closesAt).getTime();
    // الوقت المحيط يمرّ بوحدة التنسيق وحدها — لا بنداءٍ مباشر للساعة.
    const tick = () => setLeft(Math.max(0, end - now().getTime()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [closesAt]);

  if (left === null) return <p className={styles.hint}>…</p>;
  if (left === 0) return <p className={styles.countdownEnded}>{endedText}</p>;

  const total = Math.floor(left / 1000);
  const parts: [number, string][] = [
    [Math.floor(total / 86400), "يوم"],
    [Math.floor((total % 86400) / 3600), "ساعة"],
    [Math.floor((total % 3600) / 60), "دقيقة"],
    [total % 60, "ثانية"],
  ];

  return (
    <div className={styles.countdown} role="timer" aria-live="off">
      {parts.map(([value, unit]) => (
        <span key={unit} className={styles.countdownPart}>
          <span className={`${styles.countdownValue} tabular`}>{formatNumber(value)}</span>
          <span className={styles.countdownUnit}>{unit}</span>
        </span>
      ))}
    </div>
  );
}
