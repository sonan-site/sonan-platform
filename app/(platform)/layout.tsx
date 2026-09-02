import type { ReactNode } from "react";
import { AppLayout } from "@/components/shared/app-layout";
import { visibleNavigation } from "@/config/navigation";
import { signOut } from "@/lib/auth/sign-out";
import { grantedPermissions } from "@/lib/permissions/granted";

/** كل ما تحت (platform) يمرّ بالتخطيط الجامع. لا تخطيط موضعي في صفحة. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const items = visibleNavigation(await grantedPermissions());
  return (
    <AppLayout items={items} onSignOut={signOut}>
      {children}
    </AppLayout>
  );
}
