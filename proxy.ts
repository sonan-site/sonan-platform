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
    "/((?!_next/static|_next/image|fonts/|favicon.ico|manifest.webmanifest|.*\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
