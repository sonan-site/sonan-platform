"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./modal.module.css";

/**
 * نافذة — على `<dialog>` الأصلي لا على طبقةٍ مصنوعة: البؤرة محبوسة فيها،
 * و`Escape` يغلقها، والقارئ الآلي يعرفها نافذةً — كل ذلك من المتصفح.
 *
 * تُستعمل للخبر الذي **يوقف المسار** (أُنشئ حسابك، افتح بريدك)، لا لكل إشعار:
 * الإشعار العابر موضعه `ActionNotice`.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  /** يُترك فارغاً في النافذة التي لا تُغلق بيد المستخدم. */
  onClose?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      onCancel={(e) => {
        if (!onClose) e.preventDefault();
        else onClose();
      }}
    >
      <div className={styles.head}>
        <p className={styles.title}>{title}</p>
        {onClose ? (
          <button type="button" className={styles.close} aria-label="إغلاق" onClick={onClose}>
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
