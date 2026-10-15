import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./account.module.css";

/**
 * قسمٌ في «حسابي» يُعرض للقراءة، وزرُّ قلمٍ يفتحه وحده للتعديل (ملاحظات الجوال ٢ · ٢).
 * الصفوف بقيمها كما تُرى، و«—» لما لم يُكتب.
 */
export function ReadSection({
  title,
  rows,
  editLabel = "تعديل",
  editId,
  disabled = false,
  onEdit,
  notice,
  children,
}: {
  title: string;
  rows: [label: string, value: ReactNode][];
  editLabel?: string;
  /** معرّف زرّ التعديل — يعود إليه التركيز عند الإلغاء. */
  editId: string;
  /** حفظٌ جارٍ في قسمٍ آخر: لا يُفتح غيره حتى يعود ردّه، فلا تضيع نتيجته. */
  disabled?: boolean;
  onEdit: () => void;
  /** رسالة آخر حفظٍ ناجح في هذا القسم. */
  notice?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.read}>
      <div className={styles.readHead}>
        <p className={styles.readTitle}>{title}</p>
        <button type="button" id={editId} className={styles.edit} onClick={onEdit} disabled={disabled}>
          <Pencil size={16} aria-hidden />
          {editLabel}
          <span className={styles.srOnly}> {title}</span>
        </button>
      </div>
      {rows.length > 0 ? (
        <dl className={styles.rows}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{value === null || value === undefined || value === "" ? "—" : value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
      {/* الحاوية قائمةٌ دائماً ويتغيّر نصّها — فتقرؤه قارئات الشاشة. */}
      <p className={styles.notice} role="status">
        {notice ?? ""}
      </p>
    </div>
  );
}
