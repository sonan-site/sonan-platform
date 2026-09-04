"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FormState } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import styles from "./steps.module.css";

/**
 * **الشاشة المرحلية** — جامع شاشات الإعداد.
 *
 * كل شاشة إعداد كانت تعرض بنية القاعدة كما هي: جدولٌ لكل جدول، بأسمائه.
 * وهذا سهلٌ على الباني وثقيلٌ على المستخدم. فالجامع هنا يفرض ثلاثة على كل
 * خطوة: **ماذا** و**لماذا** و**أين وصلت** — ولا تمرّ خطوة بلا الثلاثة.
 *
 * ما لا يفعله: لا يرتّب الخطوات ولا يمنع تخطّيها. الترتيب معنىً لا شكل،
 * فيبقى لمن يعرف المجال.
 */

export function PageHead({
  crumbs,
  title,
  lede,
}: {
  crumbs: { href: string; label: string }[];
  title: string;
  lede: string;
}) {
  return (
    <>
      {/* فتات المسار لا قائمة تنقّل، فيبقى عنصر التنقّل حكراً على التخطيط
          الجامع ومصدرِه الوحيد config/navigation.ts — ولا قائمة موازية. */}
      <p className={styles.crumbs}>
        {crumbs.map((c) => (
          <Link key={c.href} href={c.href}>
            {c.label}
          </Link>
        ))}
      </p>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lede}>{lede}</p>
      </header>
    </>
  );
}

export function Step({
  n,
  title,
  why,
  done,
  state,
  children,
}: {
  n: number;
  title: string;
  /** سطر بلغة المستخدم يقول لماذا هذه الخطوة — لا وصفٌ لما تفعله. */
  why: string;
  done: boolean;
  state: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.step}>
      <header className={styles.stepHead}>
        <span className={`${styles.stepNum} ${done ? styles.stepNumDone : ""}`}>
          {done ? <Check size={16} aria-hidden /> : formatNumber(n)}
        </span>
        <div>
          <h2 className={styles.stepTitle}>{title}</h2>
          <p className={styles.stepWhy}>{why}</p>
        </div>
      </header>

      {/* الحالة تُلوَّن: المكتمل أخضر والناقص كهرماني — قبل أن يُقرأ نصّها. */}
      <div className={`${styles.state} ${done ? styles.stateDone : styles.stateEmpty}`}>
        {state}
      </div>

      {children}
    </section>
  );
}

export function Cards({ children }: { children: ReactNode }) {
  return <div className={styles.cards}>{children}</div>;
}

export function Card({
  name,
  meta,
  children,
}: {
  name: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardName}>{name}</span>
        {meta === undefined ? null : <span className={styles.cardMeta}>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <div className={styles.chips}>{children}</div>;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

export function ChipButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={styles.chipButton}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className={styles.none}>{children}</p>;
}

export function StepForm({
  title,
  action,
  children,
}: {
  title: string;
  action: (payload: FormData) => void;
  children: ReactNode;
}) {
  return (
    <form action={action} className={styles.form}>
      <p className={styles.formTitle}>{title}</p>
      {children}
    </form>
  );
}

export function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <p className={styles.msgError}>{state.error}</p> : null}
      {state.notice ? <p className={styles.msgOk}>{state.notice}</p> : null}
    </>
  );
}

export function meta(count: number, singular: string): string {
  return `${formatNumber(count)} ${singular}`;
}
