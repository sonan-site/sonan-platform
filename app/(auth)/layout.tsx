import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./layout.module.css";

/**
 * تخطيط ما قبل المصادقة.
 * **لا يمرّ بـ AppLayout بقصد**: لا شريط جانبي ولا تنقّل لمن لم يدخل بعد —
 * إظهار أقسام لا تُفتح إعلانٌ عن قدرة غير موجودة. مستثنى في allowlist بحجّته.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <BookOpen size={20} aria-hidden />
          منصة سنن
        </div>
        {children}
      </div>
    </div>
  );
}
