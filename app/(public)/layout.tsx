import { BookOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import styles from "./layout.module.css";

/**
 * التخطيط العام — المتجر وصفحات البرامج المعلنة.
 * **لا يمرّ بـ AppLayout بقصد**: طبقة تسويقية لا تشترط حساباً (`adr/0004`)،
 * فلا شريط جانبي ولا تنقّل داخلي لمن لم يسجّل. مستثنى في allowlist بحجّته.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  // الرأس يعرف من دخل: كان يعرض «تسجيل الدخول» لمن هو داخلٌ أصلاً بلا طريق إلى لوحته.
  const session = await getSession();
  const signedIn = session.status === "active";

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <BookOpen size={20} aria-hidden />
          منصة سنن
        </Link>
        <Link href={signedIn ? "/dashboard" : "/sign-in"} className={styles.signIn}>
          {signedIn ? "لوحتي" : "تسجيل الدخول"}
        </Link>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.foot}>
        جمعية سنن التعليمية · <Link href="/terms">شروط الاستخدام</Link> ·{" "}
        <Link href="/privacy">سياسة الخصوصية</Link>
      </footer>
    </div>
  );
}
