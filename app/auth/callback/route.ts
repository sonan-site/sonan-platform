import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/db/server";

/**
 * مسار استدعاء المصادقة — يبدّل الرمز المؤقّت بجلسة.
 * تمرّ به روابط الدعوة والاسترجاع، وهو المكان الوحيد الذي يفعل ذلك.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const target = request.nextUrl.clone();
  target.search = "";

  if (!code) {
    target.pathname = "/sign-in";
    target.searchParams.set("error", "invalid-link");
    return NextResponse.redirect(target);
  }

  const db = await createClient();
  const { error } = await db.auth.exchangeCodeForSession(code);

  if (error) {
    target.pathname = "/sign-in";
    target.searchParams.set("error", "expired-link");
    return NextResponse.redirect(target);
  }

  // الوجهة تمرّ بالقاعدة نفسها التي يمرّ بها الدخول — لا نسخة ثانية منها هنا.
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
