import type { LegalItem } from "@/lib/legal/terms";
import styles from "./legal.module.css";

/** صفحة نصٍّ قانوني — الشروط والخصوصية بقالبٍ واحد. */
export function LegalPage({ title, items }: { title: string; items: readonly LegalItem[] }) {
  return (
    <article className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <ol className={styles.list}>
        {items.map((item) => (
          <li key={item.body} className={styles.item}>
            {item.title ? <strong>{item.title}: </strong> : null}
            {item.body}
          </li>
        ))}
      </ol>
    </article>
  );
}
