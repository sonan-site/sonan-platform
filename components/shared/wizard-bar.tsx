"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatNumber } from "@/lib/format";
import type { NextStep } from "@/lib/programs/readiness";
import styles from "./wizard-bar.module.css";

/**
 * شريط المعالج — **خطوة تالية واحدة** فوق كل شاشة من شاشات العمل الطويل.
 *
 * العمل الذي يعبر ست شاشات لا يُقاد بقائمة نواقص: من رأى ثمانية بنود ناقصة لم
 * يعرف بأيّها يبدأ. فهنا: ما أُنجز من الكلّ، وما يُفعل **الآن**، وزرٌّ إليه.
 * وحين يكون المستخدم في شاشة الخطوة نفسها لا يُعرض الزرّ — هو فيها.
 */
export function WizardBar({
  programId,
  done,
  total,
  step,
}: {
  programId: string;
  done: number;
  total: number;
  step: NextStep | null;
}) {
  const pathname = usePathname();
  const base = `/programs/${programId}`;
  const href = step ? (step.tab ? `${base}/${step.tab}` : base) : base;
  const here = pathname === href;

  return (
    <div className={styles.bar}>
      <div className={styles.progress}>
        <span className={styles.count}>
          الجاهزية: {formatNumber(done)} من {formatNumber(total)}
        </span>
        <span
          className={styles.track}
          role="progressbar"
          aria-label="نسبة الجاهزية"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <span className={styles.fill} style={{ inlineSize: `${(done / total) * 100}%` }} />
        </span>
      </div>

      {step ? (
        <p className={styles.step}>
          <span className={styles.label}>الخطوة التالية:</span> {step.title}
          {here ? <span className={styles.hereTag}>أنت هنا</span> : null}
        </p>
      ) : (
        <p className={styles.step}>
          <Check size={16} aria-hidden className={styles.doneIcon} />
          اكتمل البرنامج — لا خطوة باقية.
        </p>
      )}

      {step && !here ? (
        <Link href={href} className={styles.go}>
          {step.cta}
        </Link>
      ) : null}
    </div>
  );
}
