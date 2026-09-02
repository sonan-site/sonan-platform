import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // كل شيء عدا الأصول الساكنة — الصور والخطوط لا تحتاج جلسة.
    "/((?!_next/static|_next/image|fonts/|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
