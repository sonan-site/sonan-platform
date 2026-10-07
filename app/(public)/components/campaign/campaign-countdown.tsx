"use client";

import { useEffect, useState } from "react";
import { formatNumber, now } from "@/lib/format";
import styles from "./campaign.module.css";

/**
 * عدّاد الحملة — إلى فتح التسجيل قبل أن يُفتح، وإلى إغلاقه بعد أن يُفتح.
 * الموعد من **نافذة التسجيل** لا من نصّ، ويبدأ فارغاً ثم يملأ بعد أول نبضة:
 * الخادم والمتصفّح لا يتّفقان على «الآن».
 */
export function CampaignCountdown({ target }: { target: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(target).getTime();
    const tick = () => setLeft(Math.max(0, end - now().getTime()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const total = Math.floor((left ?? 0) / 1000);
  const parts: [number, string][] = [
    [Math.floor(total / 86400), "يوم"],
    [Math.floor((total % 86400) / 3600), "ساعة"],
    [Math.floor((total % 3600) / 60), "دقيقة"],
    [total % 60, "ثانية"],
  ];

  return (
    <div className={styles.clock} role="timer" aria-live="off">
      {parts.map(([value, unit]) => (
        <div key={unit}>
          <strong>{left === null ? "…" : formatNumber(value)}</strong>
          <span>{unit}</span>
        </div>
      ))}
    </div>
  );
}
