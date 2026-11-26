import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppLayout } from "@/components/shared/app-layout";
import { EmptyState } from "@/components/shared/states";
import { AskWidget } from "@/app/(public)/components/ask/ask-widget";
import { askSetup } from "@/lib/ask/ask-server";
import { visibleNavigation } from "@/config/navigation";
import { MODE_COOKIE, resolveMode } from "@/lib/auth/mode";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/sign-out";
import { createClient } from "@/lib/db/server";
import { switchMode } from "@/lib/auth/switch-mode";
import { currentViewer } from "@/lib/permissions/granted";
import { getHomeFeatured } from "@/lib/settings/home-featured-server";
import { ArabicNamePrompt } from "./arabic-name-prompt";
import { InstallInvite } from "./install-invite";
import { PushInvite } from "./push-invite";
import { pushReady } from "@/lib/push/config";

/** كل ما تحت (platform) يمرّ بالتخطيط الجامع. لا تخطيط موضعي في صفحة. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  // الحساب الناقص لا تُفتح له شاشة قبل اسمه وجواله (`adr/0025`).
  // وبوجهته: يعود بعد الإكمال إلى الصفحة التي قصدها (رحلة التسجيل ت٥) — والترويسة
  // من الوسيط تمرّ بحارس الوجهة كأي مُدخَل.
  // ومن دخل بكلمة مؤقتة يعيّن كلمته قبل أي شاشة (`adr/0060`) — ثم يعود إلى وجهته.
  if (session.status === "password_change") {
    const here = safeNext((await headers()).get("x-pathname"));
    redirect(`/change-password?next=${encodeURIComponent(here)}`);
  }

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
  // ومساعد المسابقة لطالبها (adr/0057) — بالشرط نفسه الذي يلوّن إطاره.
  // ونقطتا «صوتك» والجرس في وضع الطالب وحده (adr/0054 · adr/0055) — لا تنتظران البرنامج المميَّز،
  // فتُسألان معه (خطة الأداء ٢٤ نوفمبر · ب٢).
  const [[skin, ask], [voicesUnseen, notificationsUnseen]] = await Promise.all([
    (async () => {
      const featured = mode === "participant" && session.status === "active" ? await getHomeFeatured() : null;
      const tint = featured && session.status === "active" && session.programSlugs.includes(featured) ? "campaign-tint" : null;
      return [tint, tint && featured ? await askSetup(featured) : undefined] as const;
    })(),
    mode === "participant"
      ? createClient().then((db) =>
          Promise.all([
            db.rpc("fn_my_voices_unseen").then((r) => r.data ?? 0),
            db.rpc("fn_my_notifications_unseen").then((r) => r.data ?? false),
          ]),
        )
      : Promise.resolve([0, false] as const),
  ]);

  return (
    <AppLayout
      items={items}
      mode={mode}
      skin={skin}
      voicesUnseen={voicesUnseen}
      notificationsUnseen={notificationsUnseen}
      ask={ask}
      askWidget={ask ? <AskWidget setup={ask} fab="desktop" /> : null}
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
      {/* دعوة تثبيت المنصة على الجهاز (adr/0063) — لكل من دخل، حتى يثبّتها أو يؤجّلها. */}
      <InstallInvite />
      {/* دعوة تفعيل الإشعارات (adr/0064) — للطالب حيث جرسه، ولمن فتحها من أيقونتها. */}
      {mode === "participant" && pushReady() ? <PushInvite /> : null}
      {children}
      {/* الاسم بالحروف العربية (adr/0062): نافذةٌ تُؤجَّل لا تُوقف. */}
      {session.status === "active" && session.nameToUpdate ? <ArabicNamePrompt name={session.nameToUpdate} /> : null}
    </AppLayout>
  );
}
