"use client";

import { Printer } from "lucide-react";
import styles from "./guide.module.css";

/**
 * «حفظ PDF» = طباعة المتصفح. وفي المتصفحات المدمجة (واتساب · إنستغرام) قد لا تعمل الطباعة — فسطرٌ
 * يدلّ على فتح الصفحة في المتصفح (مراجعة الخطة م٨).
 */
export function GuidePrint() {
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
