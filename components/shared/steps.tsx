"use client";

import { Check, ChevronUp, Circle, Plus } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { ActionForm } from "./action-form";
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

/**
 * ترويسة تبويب — عنوانه ولِيده، **بلا فتات ولا `h1`**.
 *
 * التبويب داخل شاشة، وعنوان الشاشة فوقه (اسم البرنامج). فلو حمل `h1` ثانياً
 * صار في الصفحة عنوانان أوّلان، ولا يعرف القارئ الآلي أيّهما الصفحة.
 */
export function TabHead({ title, lede }: { title: string; lede: string }) {
  return (
    <header className={styles.head}>
      <h2 className={styles.tabTitle}>{title}</h2>
      <p className={styles.lede}>{lede}</p>
    </header>
  );
}

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
          الجامع ومصدرِه الوحيد config/navigation.ts — ولا قائمة موازية.
          وشاشة الجذر بلا فتات: فقرة فارغة تترك فجوةً بلا معنى. */}
      {crumbs.length > 0 ? (
        <p className={styles.crumbs}>
          {crumbs.map((c) => (
            <Link key={c.href} href={c.href}>
              {c.label}
            </Link>
          ))}
        </p>
      ) : null}
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
  state,
  fold,
  children,
}: {
  title: string;
  action: (payload: FormData) => void;
  /** حالة الإجراء — بها يُعرف أنجح الحفظ فيُفرَّغ النموذج، أم فشل فيبقى ما كُتب. */
  state: FormState;
  /**
   * **يُطوى النموذج خلف زرٍّ بعنوانه** (`ق-٢٤`).
   *
   * الخطوة بُنيت تُعلّم الزائر أول مرة، ولم تتعلّم أنه **يعود**: فكانت تُعيد
   * عليه النموذج كاملاً في كل زيارة، وتدفع بياناته تحت شاشة.
   *
   * والقيمة **حالته الأولى لا مقوده**: `open` حين لا شيء بعد — فأول زيارةٍ
   * تُعلّم كما كانت — ثم تبقى بيد المستخدم، فلا يُغلق عليه ما فتحه لأن الحفظ
   * نجح وزاد العدد.
   */
  fold?: "open" | "closed";
  children: ReactNode;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(fold !== "closed");

  const form = (
    <ActionForm action={action} state={state} className={fold ? styles.foldForm : styles.form}>
      {/* المطويّ عنوانه على زرّه، فلا يُكرَّر فوق حقوله. */}
      {fold ? null : <p className={styles.formTitle}>{title}</p>}
      {children}
    </ActionForm>
  );

  if (!fold) return form;

  return (
    <div className={styles.fold}>
      <button
        type="button"
        className={`${styles.foldToggle} ${open ? styles.foldOpen : styles.foldClosed}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronUp size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
        {open ? "أخفِ النموذج" : title}
      </button>
      {/* يُخفى ولا يُنزَع: من طوى النموذج بعد كتابةٍ فيه يجد ما كتبه حين يعيده. */}
      <div id={panelId} hidden={!open} className={styles.foldPanel}>
        {form}
      </div>
    </div>
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

/**
 * لوحة الجاهزية — ما اكتمل وما يحجب الإطلاق، ورابطٌ لكل ناقص.
 *
 * **وصفٌ لا قيد:** لا تمنع النشر ولا تُغيّر سلوكاً. النشر قرار الراعي،
 * وهذه تُريه ما يقرّر عليه بدل أن يتفقّد ست شاشات.
 */
export function Readiness({
  items,
  hrefOf,
}: {
  items: { key: string; label: string; consequence: string; done: boolean; fix: string }[];
  hrefOf: (fix: string) => string | null;
}) {
  const done = items.filter((i) => i.done).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  return (
    <section className={styles.ready}>
      <div className={styles.readyHead}>
        <h2 className={styles.readyTitle}>جاهزية الإطلاق</h2>
        <span className={styles.readyCount}>
          {formatNumber(done)} من {formatNumber(items.length)}
        </span>
      </div>

      <div
        className={styles.bar}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="نسبة الجاهزية"
      >
        <div className={styles.barFill} style={{ inlineSize: `${percent}%` }} />
      </div>

      <ul className={styles.readyList}>
        {items.map((item) => {
          const href = item.done ? null : hrefOf(item.fix);
          return (
            <li
              key={item.key}
              className={`${styles.readyItem} ${item.done ? styles.readyOk : styles.readyPending}`}
            >
              <span className={styles.readyMark}>
                {item.done ? <Check size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
              </span>
              <span>
                <span className={styles.readyLabel}>{item.label}</span>
                {item.done ? null : <span className={styles.readyWhy}>{item.consequence}</span>}
              </span>
              {href ? (
                <Link className={styles.readyGo} href={href}>
                  أصلِح
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
