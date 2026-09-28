import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppLayout } from "@/components/shared/app-layout";
import { EmptyState } from "@/components/shared/states";
import { visibleNavigation } from "@/config/navigation";
import { MODE_COOKIE, resolveMode } from "@/lib/auth/mode";
import { getSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/sign-out";
import { switchMode } from "@/lib/auth/switch-mode";
import { currentViewer } from "@/lib/permissions/granted";

/** كل ما تحت (platform) يمرّ بالتخطيط الجامع. لا تخطيط موضعي في صفحة. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  // الحساب الناقص لا تُفتح له شاشة قبل اسمه وجواله (`adr/0025`).
  if (session.status === "incomplete") redirect("/complete-profile");

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

  return (
    <AppLayout
      items={items}
      mode={mode}
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
