"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOutToCampaign } from "@/lib/auth/sign-out";
import { isBareCampaignPath, skinForPath } from "@/lib/settings/campaign-skin";
import type { CampaignVisitor } from "@/lib/settings/campaign-visitor-server";
import styles from "./layout.module.css";

/**
 * إطار الصفحات العامة — يُقرَّر من المسار **في العميل**: التخطيط لا يُعاد عند التنقّل داخله، فقرارٌ
 * في الخادم كان يعلق (زرّ «سجّل الآن» من الواجهة يفتح التسجيل بإطارٍ قديم — مراجعة خطة الألوان ح١).
 * ويُصيَّر في الخادم أولاً بالمسار نفسه، فلا وميض.
 *
 * - الواجهة (`/` حين المفتاح · `/p/<slug>/campaign`) والدليل (`/p/<slug>/guide`) تحمل رأسها وتذييلها، فلا تُلفّ.
 * - صفحة تسجيل برنامج الحملة بجلدها (`adr/0045` ملحق): الشعار يعيد إلى الواجهة.
 * - وما سواها بإطار المنصة.
 */
export function PublicChrome({
  featured,
  signedIn,
  visitor,
  children,
}: {
  /** رابط برنامج الحملة المنشور — أو لا شيء. */
  featured: string | null;
  signedIn: boolean;
  /** حال الزائر في برنامج الحملة — رأس صفحاتها يقول خطوته التالية لا «لوحتي» (قرار الراعي ٢٧ أكتوبر). */
  visitor: CampaignVisitor | null;
  children: ReactNode;
}) {
  const path = usePathname() ?? "";
  if (isBareCampaignPath(path)) return <>{children}</>;
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
          {typeof visitor === "object" && visitor !== null ? (
            <Link href={visitor.journey} className={styles.signIn}>
              رحلتي
            </Link>
          ) : visitor === "account" ? (
            // في منتصف التسجيل لا لوحة له بعد — فمكان «لوحتي» مخرجٌ لمن ليس صاحب الحساب.
            <form action={signOutToCampaign} className={styles.skinOut}>
              <button type="submit" className={styles.notYou}>
                لست أنت؟ خروج
              </button>
            </form>
          ) : (
            <Link href={signInHref} className={styles.signIn}>
              تسجيل الدخول
            </Link>
          )}
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
