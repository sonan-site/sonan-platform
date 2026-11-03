import type { LegalClause } from "@/lib/legal/terms";
import styles from "./legal.module.css";

/** أسماء البنود كما في المسودة المعتمدة («البند الأول: …») — والنصّان دون اثني عشر بنداً. */
const ORDINALS = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
  "الحادي عشر",
  "الثاني عشر",
];

/** صفحة نصٍّ قانوني — الشروط والخصوصية بقالبٍ واحد: بنودٌ مرقّمة بعناوين، وفي كلٍّ فقرة أو نقاط. */
export function LegalPage({ title, clauses }: { title: string; clauses: readonly LegalClause[] }) {
  return (
    <article className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      {clauses.map((clause, i) => (
        <section key={clause.title} className={styles.clause} aria-labelledby={`clause-${i}`}>
          <h2 id={`clause-${i}`} className={styles.heading}>
            البند {ORDINALS[i] ?? i + 1}: {clause.title}
          </h2>
          {clause.paragraphs?.map((p) => (
            <p key={p} className={styles.text}>
              {p}
            </p>
          ))}
          {clause.points ? (
            <ul className={styles.points}>
              {clause.points.map((point) => (
                <li key={point.text}>
                  {point.label ? <strong>{point.label}: </strong> : null}
                  {point.text}
                </li>
              ))}
            </ul>
          ) : null}
          {clause.after ? <p className={styles.text}>{clause.after}</p> : null}
        </section>
      ))}
    </article>
  );
}
