import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/db/server";

/**
 * مسار استدعاء المصادقة — يبدّل الرمز المؤقّت بجلسة.
 * تمرّ به روابط الدعوة والاسترجاع، وهو المكان الوحيد الذي يفعل ذلك.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/";

  const target = request.nextUrl.clone();
  target.search = "";

  if (!code) {
    target.pathname = "/sign-in";
    target.searchParams.set("error", "رابط غير صالح أو منتهٍ.");
    return NextResponse.redirect(target);
  }

  const db = await createClient();
  const { error } = await db.auth.exchangeCodeForSession(code);

  // المسار النسبي وحده يُقبل — رابط خارجي في `next` تحويلٌ مفتوح.
  target.pathname = error ? "/sign-in" : next.startsWith("/") ? next : "/";
  if (error) target.searchParams.set("error", "انتهت صلاحية الرابط. اطلب رابطاً جديداً.");
  return NextResponse.redirect(target);
}
