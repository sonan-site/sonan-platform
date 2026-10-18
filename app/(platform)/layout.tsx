import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppLayout } from "@/components/shared/app-layout";
import { EmptyState } from "@/components/shared/states";
import { visibleNavigation } from "@/config/navigation";
import { MODE_COOKIE, resolveMode } from "@/lib/auth/mode";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/sign-out";
import { switchMode } from "@/lib/auth/switch-mode";
import { currentViewer } from "@/lib/permissions/granted";
import { getHomeFeatured } from "@/lib/settings/home-featured-server";

/** كل ما تحت (platform) يمرّ بالتخطيط الجامع. لا تخطيط موضعي في صفحة. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  // الحساب الناقص لا تُفتح له شاشة قبل اسمه وجواله (`adr/0025`).
  // وبوجهته: يعود بعد الإكمال إلى الصفحة التي قصدها (رحلة التسجيل ت٥) — والترويسة
  // من الوسيط تمرّ بحارس الوجهة كأي مُدخَل.
  if (session.status === "incomplete") {
    const here = safeNext((await headers()).get("x-pathname"));
    redirect(`/complete-profile?next=${encodeURIComponent(here)}`);
  }

  // الموقوف يُقال له ذلك مرّة، بدل صفحاتٍ تقول كلٌّ منها «سجّل الدخول» وهو داخل.
  if (session.status === "suspended") {
    return (
      <AppLayout items={[]} onSignOut={signOut}>
        <EmptyState
          kind="no-data"
          title="حسابك موقوف"
          body="لا يمكنك استعمال المنصة بهذا الحساب الآن. تواصل مع إدارة المنصة إن كان ذلك خطأً."
        />
      </AppLayout>
    );
  }

  const viewer = await currentViewer();

  /**
   * **وضع الجلسة** (`adr/0032`): الباب الذي دخل منه يحدّد ما يراه. ومن جمع
   * الصفتين — صلاحيةً ومشاركةً — له مفتاح ينتقل به، وغيره لا يُعرض له مفتاحٌ
   * لوضعٍ لا يملكه.
   */
  const hasRole = viewer.granted.size > 0;
  const mode = resolveMode((await cookies()).get(MODE_COOKIE)?.value, hasRole);
  const bothWays = hasRole && viewer.isParticipant;

  const items = visibleNavigation({ ...viewer, mode });

  // إطار الطالب بلون الحملة (ملحق `adr/0045`): لمن يشارك في برنامجها، في وضع الطالب وحده — والفريق
  // بهوية المنصة. ومشاركاته من الجلسة نفسها، فالسؤال الوحيد الزائد عن المفتاح وفي وضع الطالب فقط.
  const featured = mode === "participant" && session.status === "active" ? await getHomeFeatured() : null;
  const skin = featured && session.status === "active" && session.programSlugs.includes(featured) ? "campaign-tint" : null;

  return (
    <AppLayout
      items={items}
      mode={mode}
      skin={skin}
      onSignOut={signOut}
      onSwitchMode={
        bothWays
          ? async () => {
              "use server";
              await switchMode(mode === "staff" ? "participant" : "staff");
            }
          : undefined
      }
    >
      {children}
    </AppLayout>
  );
}
