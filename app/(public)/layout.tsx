import { BookOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./layout.module.css";

/**
 * التخطيط العام — المتجر وصفحات البرامج المعلنة.
 * **لا يمرّ بـ AppLayout بقصد**: طبقة تسويقية لا تشترط حساباً (`adr/0004`)،
 * فلا شريط جانبي ولا تنقّل داخلي لمن لم يسجّل. مستثنى في allowlist بحجّته.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <BookOpen size={20} aria-hidden />
          منصة سنن
        </Link>
        <Link href="/sign-in" className={styles.signIn}>
          تسجيل الدخول
        </Link>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.foot}>جمعية سنن التعليمية</footer>
    </div>
  );
}
