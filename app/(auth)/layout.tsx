import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { NEXT_COOKIE } from "@/lib/auth/next-cookie";
import { getHomeFeatured } from "@/lib/settings/home-featured-server";
import { getShowcase } from "@/lib/settings/showcase-server";
import { AuthChrome } from "./auth-chrome";

/**
 * شاشات ما قبل الدخول — نصفان على الحاسوب: الشعار والشرائح جهة اليمين،
 * والنموذج جهة اليسار. وعلى الجوال عمودٌ واحد: الشعار ثم النموذج، والشرائح
 * تُخفى فلا تدفع النموذج إلى أسفل الشاشة.
 *
 * الشرائح من «الإعدادات» (الهجرة ٠٣٨). وبلا شرائح يبقى اسم المنصة وترحيبها.
 * والإطار يُختار في العميل (`AuthChrome`) — هنا ما يعرفه الخادم وحده.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const [{ slides }, featured, jar] = await Promise.all([getShowcase(), getHomeFeatured(), cookies()]);
  return (
    <AuthChrome featured={featured} cookieNext={jar.get(NEXT_COOKIE)?.value ?? null} slides={slides}>
      {children}
    </AuthChrome>
  );
}
