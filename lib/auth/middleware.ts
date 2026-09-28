import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { gateFor } from "./mode";

/**
 * بوّابة المصادقة — **وظيفتها تجديد الجلسة والتحويل، لا الإنفاذ التفصيلي**.
 * `platform.md §٧`: «الـ middleware بوابة مصادقة فقط؛ الإنفاذ التفصيلي في الخادم».
 */

/** مسارات عامة لا تشترط جلسة. ما عداها محمي. */
const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/recover", "/activate", "/auth", "/p/"];

/**
 * الجذر هو المتجر العام: طبقة تسويقية لا تشترط حساباً (adr/0004). والشروط
 * والخصوصية تُقرأ قبل الموافقة عليها، فلا تشترط حساباً كذلك (adr/0028).
 */
const PUBLIC_EXACT = new Set(["/", "/terms", "/privacy", "/admin"]);

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  /**
   * المسار في ترويسة الطلب — **التخطيطات لا تعرف مسارها** في Next، وبوابة
   * الإدارة تحتاجه لتُخفي شرائح المشاركين عن شاشة العمل (`adr/0032`).
   */
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers } });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // `getClaims` لا `getSession`: الأول يتحقّق من توقيع الرمز، والثاني يصدّق الكوكي.
  // ولا `getUser`: البوّابة تمرّ بكل طلب — حتى الجلب المسبق للروابط — و`getUser`
  // رحلةٌ إلى خدمة المصادقة في كل مرّة. الفحص الحيّ (الإيقاف والصلاحيات) في
  // الخادم والقاعدة، لا هنا.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ?? null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    // **الباب بحسب الوجهة** (`adr/0032`): من قصد شاشة عمل يُردّ إلى بوابة الإدارة.
    url.pathname = gateFor(path);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const isAuthScreen = ["/sign-in", "/sign-up", "/recover", "/admin"].includes(path);
  if (user && isAuthScreen) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
