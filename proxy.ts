import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/middleware";

/** بوّابة المصادقة. `proxy` هو اسم `middleware` في Next 16 — والقديم مهجور. */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // كل شيء عدا الأصول الساكنة — الصور والخطوط لا تحتاج جلسة.
    "/((?!_next/static|_next/image|fonts/|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
