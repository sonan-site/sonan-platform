"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import styles from "./guide.module.css";

/**
 * «حفظ PDF» = طباعة المتصفح. وفي المتصفحات المدمجة (واتساب · إنستغرام) قد لا تعمل الطباعة — فسطرٌ
 * يدلّ على فتح الصفحة في المتصفح (مراجعة الخطة م٨).
 *
 * والأسئلة الشائعة تنطوي كالواجهة، والمطبوع لا نقر فيه: فتُفتح كلها قبل الطباعة — بالزرّ أو بأمر
 * المتصفح (`beforeprint`) — وتعود كما كانت بعدها.
 */
export function GuidePrint() {
  useEffect(() => {
    let closed: HTMLDetailsElement[] = [];
    const open = () => {
      closed = [...document.querySelectorAll("details")].filter((d) => !d.open);
      for (const d of closed) d.open = true;
    };
    const restore = () => {
      for (const d of closed) d.open = false;
      closed = [];
    };
    window.addEventListener("beforeprint", open);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", open);
      window.removeEventListener("afterprint", restore);
    };
  }, []);

  return (
    <div className={styles.print}>
      <button type="button" className={styles.printButton} onClick={() => window.print()}>
        <Printer size={18} aria-hidden />
        حفظ PDF
      </button>
      <span className={styles.printHint}>إن لم يعمل الزرّ فافتح الصفحة في متصفح الجوال ثم احفظها.</span>
    </div>
  );
}
