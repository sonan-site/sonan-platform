"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EmptyState } from "@/components/shared/states";
import { parseLinkFragment } from "@/lib/auth/link-fragment";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/db/browser";

/**
 * وجهة روابط الاسترجاع والدعوة — تفتح الجلسة من الرابط ثم تمضي إلى وجهته.
 *
 * الجلسة في جزء العنوان بعد `#` (`lib/auth/link-fragment.ts`)، ولا يقرؤه إلا
 * المتصفح. فتُثبَّت هنا بعميل المتصفح (كوكيز الجلسة نفسها)، ويُمسح الرمز من
 * شريط العنوان وسجلّه قبل أي شيء — فلا يبقى في تاريخ المتصفح.
 */
export default function AuthLinkPage() {
  const router = useRouter();

  useEffect(() => {
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    const link = parseLinkFragment(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);

    if (link.kind === "none") {
      router.replace("/sign-in?error=invalid-link");
      return;
    }
    if (link.kind === "error") {
      router.replace(`/sign-in?error=${link.expired ? "expired-link" : "invalid-link"}`);
      return;
    }

    void createClient()
      .auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      .then(({ error }) => {
        if (error) {
          router.replace("/sign-in?error=expired-link");
          return;
        }
        router.replace(next);
        router.refresh();
      });
  }, [router]);

  return <EmptyState kind="no-data" title="جارٍ فتح الرابط" body="لحظات وتنتقل إلى وجهتك." />;
}
