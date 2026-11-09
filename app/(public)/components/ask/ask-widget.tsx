"use client";

import { MessageCircleQuestionMark, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AskSetup } from "@/lib/ask/ask-server";
import { AskChat } from "./ask-chat";
import styles from "./ask.module.css";
import { OPEN_EVENT } from "./ask-trigger";

/**
 * نافذة المساعد (adr/0057 · قرار الراعي ٩ نوفمبر): كل مدخلٍ يفتحها في الصفحة نفسها، فلا يضيع
 * نموذجٌ نصف مملوء ولا يخرج الطالب من المنصة. على `<dialog>` الأصلي — البؤرة و`Escape` من المتصفح.
 * المحادثة تبقى ما بقيت الصفحة: الإغلاق يخفي النافذة ولا يمحو ما فيها.
 *
 * المداخل لا تعرف النافذة: `AskTrigger` يطلق حدثاً تلتقطه، فإن لم تكن في الصفحة مضى رابطه إلى
 * صفحة المساعد.
 */

export function AskWidget({
  setup,
  fab,
}: {
  setup: AskSetup;
  /** الزرّ العائم: في كل الشاشات · في الكبيرة وحدها (المنصة: جوالها في الشريط العلوي) · بلا زرّ. */
  fab: "always" | "desktop" | "none";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // المحادثة تُبنى عند أول فتح — لا قبله.
  const [opened, setOpened] = useState(false);

  const open = useCallback(() => {
    setOpened(true);
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      e.preventDefault();
      open();
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [open]);

  return (
    <div data-campaign className={styles.widget}>
      {fab !== "none" ? (
        <button
          type="button"
          className={`${styles.fab} ${fab === "desktop" ? styles.fabDesktop : ""}`}
          aria-label="اسألني — مساعد المسابقة التجريبي"
          onClick={open}
        >
          <MessageCircleQuestionMark size={26} aria-hidden />
          <span className={styles.fabBeta} aria-hidden>
            تجريبي
          </span>
          <span className={styles.fabLabel} aria-hidden>
            اسألني
          </span>
        </button>
      ) : null}

      <dialog
        ref={dialog}
        className={styles.panel}
        aria-labelledby="ask-panel-title"
        // النقر على الخلفية يُغلق — والنقر داخل النافذة هدفه عنصرٌ فيها لا النافذة نفسها.
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className={styles.panelBody}>
          <header className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>{setup.programName}</p>
              <div className={styles.titleRow}>
                <h2 id="ask-panel-title" className={styles.panelTitle}>
                  اسأل عن المسابقة
                </h2>
                <span className={styles.beta}>تجريبي</span>
              </div>
            </div>
            <button type="button" className={styles.close} aria-label="إغلاق" onClick={() => dialog.current?.close()}>
              <X size={20} aria-hidden />
            </button>
          </header>
          {opened ? <AskChat slug={setup.slug} contact={setup.contact} panel /> : null}
        </div>
      </dialog>
    </div>
  );
}
