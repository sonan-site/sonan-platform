import { NextResponse, type NextRequest } from "next/server";
import { parseConfirmLink } from "@/lib/auth/confirm-link";
import { DEFAULT_LANDING, safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/db/server";

/**
 * رابط الدعوة واستعادة كلمة المرور — يتحقّق من رمز البريد ويفتح الجلسة.
 * قالبا البريد في Supabase يوجّهان إليه (انظر `lib/auth/confirm-link.ts`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const link = parseConfirmLink(request.nextUrl.searchParams);

  const failure = (code: "invalid-link" | "expired-link") => {
    const target = new URL("/sign-in", request.nextUrl.origin);
    target.searchParams.set("error", code);
    // الوجهة تبقى مع الخطأ (رحلة التسجيل ت٣).
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    if (next !== DEFAULT_LANDING) target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  };

  if (!link) return failure("invalid-link");

  const db = await createClient();
  const { error } = await db.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
  if (error) return failure("expired-link");

  return NextResponse.redirect(new URL(link.next, request.nextUrl.origin));
}
