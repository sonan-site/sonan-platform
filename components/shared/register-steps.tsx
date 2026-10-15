import { Check } from "lucide-react";
import { formatNumber } from "@/lib/format";
import styles from "./register-steps.module.css";

export const REGISTER_STEPS = ["الحساب", "بياناتك", "مسارك", "الإقرار"] as const;

/** صفحة تسجيلٍ في برنامج — بمسارٍ محمول أو بدونه. */
export const isRegisterPath = (path: string): boolean => /^\/p\/[^/?#]+\/register(?:[?#]|$)/.test(path);

/**
 * مؤشّر الخطوات الأربع (رحلة التسجيل ت٨ · ملاحظات الجوال أ١). `done` عدد ما تمّ من أولها،
 * والتالية له هي الحالية.
 */
export function RegisterSteps({ done }: { done: number }) {
  return (
    <ol className={styles.steps} aria-label="خطوات التسجيل">
      {REGISTER_STEPS.map((label, i) => (
        <li
          key={label}
          className={i < done ? styles.stepDone : i === done ? styles.stepNow : undefined}
          aria-current={i === done ? "step" : undefined}
        >
          <span className={styles.stepDot}>{i < done ? <Check size={13} aria-hidden /> : formatNumber(i + 1)}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
