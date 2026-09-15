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
    // حين يرفض Supabase الدخول (مزوّدٌ خارجي، أو خطأ في إنشاء الحساب) يعيده بلا
    // رمز ومعه `error_code`. يُمرَّر الرمز وحده — حروفاً لاتينية لا نصّاً حرّاً —
    // فتعرف الشاشة أنه رفضٌ من الدخول لا رابطٌ تالف، ويُعرف السبب عند التشخيص.
    const reason = (request.nextUrl.searchParams.get("error_code") ??
      request.nextUrl.searchParams.get("error") ??
      "")
      .replace(/[^a-z0-9_]/gi, "")
      .slice(0, 40);
    if (reason) {
      console.error("auth callback rejected:", reason, request.nextUrl.searchParams.get("error_description"));
      target.searchParams.set("error", "provider-failed");
      target.searchParams.set("reason", reason);
    } else {
      target.searchParams.set("error", "invalid-link");
    }
    return NextResponse.redirect(target);
  }

  const db = await createClient();
  const { error } = await db.auth.exchangeCodeForSession(code);

  if (error) {
    target.pathname = "/sign-in";
    target.searchParams.set("error", "expired-link");
    return NextResponse.redirect(target);
  }

  // من دخل بـ Google أول مرة لا ملف له: يُستكمل اسمه وجواله قبل وجهته (`adr/0025`).
  const { data: auth } = await db.auth.getUser();
  if (auth.user) {
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!profile) {
      const complete = new URL("/complete-profile", request.nextUrl.origin);
      complete.searchParams.set("next", next);
      return NextResponse.redirect(complete);
    }
  }

  // الوجهة تمرّ بالقاعدة نفسها التي يمرّ بها الدخول — لا نسخة ثانية منها هنا.
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
