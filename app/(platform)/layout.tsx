import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppLayout } from "@/components/shared/app-layout";
import { EmptyState } from "@/components/shared/states";
import { visibleNavigation } from "@/config/navigation";
import { getSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/sign-out";
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

  const items = visibleNavigation(await currentViewer());
  return (
    <AppLayout items={items} onSignOut={signOut}>
      {children}
    </AppLayout>
  );
}
