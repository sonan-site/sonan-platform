import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getShowcase } from "@/lib/settings/showcase-server";
import styles from "./layout.module.css";
import { ShowcaseSlides } from "./showcase-slides";

/**
 * شاشات ما قبل الدخول — نصفان على الحاسوب: الشعار والشرائح جهة اليمين،
 * والنموذج جهة اليسار. وعلى الجوال عمودٌ واحد: الشعار ثم النموذج، والشرائح
 * تُخفى فلا تدفع النموذج إلى أسفل الشاشة.
 *
 * الشرائح من «الإعدادات» (الهجرة ٠٣٨). وبلا شرائح يبقى اسم المنصة وترحيبها.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { slides } = await getShowcase();
  // بوابة الإدارة لا شرائح فيها: العارض هناك يدخل لعمله لا ليُعرَّف بالمنصة.
  const path = (await headers()).get("x-pathname") ?? "";
  const staffGate = path.startsWith("/admin");

  return (
    <div className={styles.shell}>
      <aside className={styles.panel}>
        <div className={styles.brand}>
          <BookOpen size={24} aria-hidden />
          منصة سنن
        </div>
        <div className={styles.showcase}>
          {slides.length > 0 && !staffGate ? (
            <ShowcaseSlides slides={slides} />
          ) : (
            <div className={styles.slide}>
              <p className={styles.slideTitle}>
                {staffGate ? "منصة سنن — إدارة البرامج" : "أهلاً بك في منصة سنن"}
              </p>
              <p className={styles.slideBody}>
                {staffGate
                  ? "البرامج ومساراتها ومادتها وخططها، ومن يعمل عليها."
                  : "برامج الجمعية ورحلتك فيها، في مكان واحد."}
              </p>
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.card}>{children}</div>
      </main>
    </div>
  );
}
