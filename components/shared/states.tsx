import { CircleAlert, Inbox, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./states.module.css";

/**
 * الحالات الثلاث — **إلزامية في كل عرض بيانات** (`platform.md §١١.٥`).
 * و`guard-structure` يفشل عند عرض بيانات ينقصه واحدة منها.
 */

const ICON_SIZE = 24;

/** تحميل: هيكل عظمي **بعدد الصفوف المتوقَّع**، لا دوّامة تُخفي البنية. */
export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.skeleton} role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.row} />
      ))}
    </div>
  );
}

/**
 * الفراغ — **يفرّق بين حالتين لا يخلطهما**:
 * `no-data` لا بيانات أصلاً، فالإجراء «أضِف».
 * `no-results` التصفية أخفتها، فالإجراء «امسح التصفية».
 * خلطهما يقول للمستخدم «لا يوجد شيء» وعنده مئة صفّ خلف مرشِّح نسيه.
 */
export function EmptyState({
  kind,
  title,
  body,
  action,
}: {
  kind: "no-data" | "no-results";
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const Icon = kind === "no-results" ? SearchX : Inbox;
  return (
    <div className={styles.wrap}>
      <Icon className={styles.icon} size={ICON_SIZE} aria-hidden />
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

/** خطأ: سبب مفهوم + إعادة محاولة. لا اعتذار ولا غموض. */
export function ErrorState({
  title = "تعذّر تحميل البيانات",
  body,
  action,
}: {
  title?: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className={`${styles.wrap} ${styles.error}`} role="alert">
      <CircleAlert className={styles.icon} size={ICON_SIZE} aria-hidden />
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
