"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { skinForNext } from "@/lib/settings/campaign-skin";
import type { Slide } from "@/lib/settings/showcase";
import { CampaignGateProvider, type CampaignGate } from "./campaign-gate";
import styles from "./layout.module.css";
import { ShowcaseSlides } from "./showcase-slides";

/**
 * إطار شاشات ما قبل الدخول — يُقرَّر في العميل من المسار والوجهة: التخطيط لا يُعاد عند التنقّل داخله
 * ولا يرى `next` (مراجعة خطة الألوان ح٢).
 *
 * من وجهته تسجيل برنامج الحملة يراه بجلد الواجهة (ملحق `adr/0045`): الشعار بدل «منصة سنن» والشرائح
 * تُخفى — الواجهة عرّفته بالمسابقة للتوّ. والوجهة في الرابط، أو في كوكي «الاستعادة» لصفحة التفعيل.
 */
export function AuthChrome({
  featured,
  gate,
  cookieNext,
  slides,
  children,
}: {
  featured: string | null;
  /** بوابة تسجيل الحملة — تُعطى للصفحات حين الجلد جلدها وحده. */
  gate: CampaignGate | null;
  /** وجهة الاستعادة المحفوظة — `/activate` لا يحملها في رابطه. */
  cookieNext: string | null;
  slides: Slide[];
  children: ReactNode;
}) {
  const path = usePathname() ?? "";
  const next = useSearchParams().get("next");
  // بوابة الإدارة لا شرائح فيها ولا جلد: العارض هناك يدخل لعمله لا ليُعرَّف بالمنصة.
  const staffGate = path.startsWith("/admin");
  const skin = staffGate ? null : (skinForNext(next, featured) ?? (path === "/activate" ? skinForNext(cookieNext, featured) : null));

  return (
    <div className={styles.shell} data-skin={skin ?? undefined}>
      <aside className={styles.panel}>
        {skin ? (
          <Link href="/" className={styles.skinBrand} aria-label="واجهة المسابقة">
            {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
            <img src="/brand/sunan-logo.png" alt="جمعية سنن التعليمية" />
          </Link>
        ) : (
          <div className={styles.brand}>
            <BookOpen size={24} aria-hidden />
            منصة سنن
          </div>
        )}
        <div className={styles.showcase}>
          {skin ? (
            <div className={styles.slide}>
              <p className={`${styles.slideTitle} ${styles.skinTitle}`}>مسابقة سنن</p>
              <p className={styles.slideBody}>حسابك أولاً، ثم تكمل تسجيلك في المسابقة من حيث توقّفت.</p>
            </div>
          ) : slides.length > 0 && !staffGate ? (
            <ShowcaseSlides slides={slides} />
          ) : (
            <div className={styles.slide}>
              <p className={styles.slideTitle}>{staffGate ? "منصة سنن — إدارة البرامج" : "أهلاً بك في منصة سنن"}</p>
              <p className={styles.slideBody}>
                {staffGate ? "البرامج ومساراتها ومادتها وخططها، ومن يعمل عليها." : "برامج الجمعية ورحلتك فيها، في مكان واحد."}
              </p>
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.card}>
          <CampaignGateProvider gate={skin ? gate : null}>{children}</CampaignGateProvider>
        </div>
      </main>
    </div>
  );
}
