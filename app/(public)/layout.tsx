import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { getHomeFeatured } from "@/lib/settings/home-featured-server";
import { PublicChrome } from "./public-chrome";

/**
 * التخطيط العام — المتجر وصفحات البرامج المعلنة.
 * **لا يمرّ بـ AppLayout بقصد**: طبقة تسويقية لا تشترط حساباً (`adr/0004`)،
 * فلا شريط جانبي ولا تنقّل داخلي لمن لم يسجّل. مستثنى في allowlist بحجّته.
 *
 * الإطار يُختار من المسار في العميل (`PublicChrome`) — هنا ما يعرفه الخادم وحده.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  // الرأس يعرف من دخل: كان يعرض «تسجيل الدخول» لمن هو داخلٌ أصلاً بلا طريق إلى لوحته.
  const [featured, session] = await Promise.all([getHomeFeatured(), getSession()]);
  return (
    <PublicChrome featured={featured} signedIn={session.status === "active"}>
      {children}
    </PublicChrome>
  );
}
