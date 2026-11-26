import type { NextFetchEvent, NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/middleware";

/** بوّابة المصادقة. `proxy` هو اسم `middleware` في Next 16 — والقديم مهجور. */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  return updateSession(request, event);
}

export const config = {
  matcher: [
    // كل شيء عدا الأصول الساكنة — الصور والخطوط لا تحتاج جلسة، ولا تعريف التطبيق (`adr/0063`):
    // المتصفح يجلبه بلا جلسة، فلو مرّ بالبوابة حُوِّل إلى الدخول وما عُرف التطبيق.
    // ولا عامل الإشعارات (`sw.js`) ولا مُرسِلها (`api/push/dispatch`) — `adr/0064`: الأول يجلبه المتصفح بلا جلسة،
    // والثاني تطلبه القاعدة وحارسه سرّه.
    "/((?!_next/static|_next/image|fonts/|favicon.ico|manifest.webmanifest|sw\.js$|api/push/dispatch$|.*\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
