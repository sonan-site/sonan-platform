import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { NEXT_COOKIE } from "@/lib/auth/next-cookie";
import { getHomeFeatured } from "@/lib/settings/home-featured-server";
import { getShowcase } from "@/lib/settings/showcase-server";
import { createClient } from "@/lib/db/server";
import { dateParts, lastOpenDay, now } from "@/lib/format";
import { AuthChrome } from "./auth-chrome";
import type { CampaignGate } from "./campaign-gate";

/** اسم برنامج الحملة وموعد إغلاق تسجيله إن كان مفتوحاً — للبوابة. وخطأ القاعدة: لا بوابة. */
async function campaignGate(slug: string | null): Promise<CampaignGate | null> {
  if (!slug) return null;
  const db = await createClient();
  const { data } = await db
    .from("programs")
    .select("name, registration_opens_at, registration_closes_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  const at = now();
  const open =
    (!data.registration_opens_at || at >= new Date(data.registration_opens_at)) &&
    (!data.registration_closes_at || at < new Date(data.registration_closes_at));
  const day = data.registration_closes_at ? `${lastOpenDay(data.registration_closes_at)}T12:00:00Z` : null;
  if (!open || !day) return { name: data.name, closing: null };
  const h = dateParts(day, "hijri");
  const g = dateParts(day, "gregory");
  return { name: data.name, closing: `آخر يوم للتسجيل ${h.day} ${h.month} ${h.year}هـ (${g.day} ${g.month})` };
}

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
  const gate = await campaignGate(featured);
  return (
    <AuthChrome featured={featured} gate={gate} cookieNext={jar.get(NEXT_COOKIE)?.value ?? null} slides={slides}>
      {children}
    </AuthChrome>
  );
}
