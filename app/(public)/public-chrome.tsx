"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { skinForPath } from "@/lib/settings/campaign-skin";
import styles from "./layout.module.css";

/**
 * إطار الصفحات العامة — يُقرَّر من المسار **في العميل**: التخطيط لا يُعاد عند التنقّل داخله، فقرارٌ
 * في الخادم كان يعلق (زرّ «سجّل الآن» من الواجهة يفتح التسجيل بإطارٍ قديم — مراجعة خطة الألوان ح١).
 * ويُصيَّر في الخادم أولاً بالمسار نفسه، فلا وميض.
 *
 * - الواجهة (`/` حين المفتاح · `/p/<slug>/campaign`) تحمل رأسها وتذييلها، فلا تُلفّ.
 * - صفحة تسجيل برنامج الحملة بجلدها (`adr/0045` ملحق): الشعار يعيد إلى الواجهة.
 * - وما سواها بإطار المنصة.
 */
export function PublicChrome({
  featured,
  signedIn,
  children,
}: {
  /** رابط برنامج الحملة المنشور — أو لا شيء. */
  featured: string | null;
  signedIn: boolean;
  children: ReactNode;
}) {
  const path = usePathname() ?? "";
  if (path.startsWith("/p/") && path.endsWith("/campaign")) return <>{children}</>;
  if (path === "/" && featured) return <>{children}</>;

  const signInHref = signedIn ? "/dashboard" : path && path !== "/" ? `/sign-in?next=${encodeURIComponent(path)}` : "/sign-in";
  const footer = (
    <footer className={styles.foot}>
      جمعية سنن التعليمية · <Link href="/terms">شروط الاستخدام</Link> · <Link href="/privacy">سياسة الخصوصية</Link>
    </footer>
  );

  if (skinForPath(path, featured)) {
    return (
      <div className={`${styles.shell} ${styles.skinShell}`} data-skin="campaign">
        <header className={`${styles.topbar} ${styles.skinTop}`}>
          <Link href="/" className={styles.skinBrand} aria-label="واجهة المسابقة">
            {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
            <img src="/brand/sunan-logo.png" alt="جمعية سنن التعليمية" />
          </Link>
          <Link href={signInHref} className={styles.signIn}>
            {signedIn ? "لوحتي" : "تسجيل الدخول"}
          </Link>
        </header>
        <main className={styles.main}>{children}</main>
        {footer}
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <BookOpen size={20} aria-hidden />
          منصة سنن
        </Link>
        <Link href={signInHref} className={styles.signIn}>
          {signedIn ? "لوحتي" : "تسجيل الدخول"}
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
      {footer}
    </div>
  );
}
