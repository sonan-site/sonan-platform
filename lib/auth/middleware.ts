import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * بوّابة المصادقة — **وظيفتها تجديد الجلسة والتحويل، لا الإنفاذ التفصيلي**.
 * `platform.md §٧`: «الـ middleware بوابة مصادقة فقط؛ الإنفاذ التفصيلي في الخادم».
 */

/** مسارات عامة لا تشترط جلسة. ما عداها محمي. */
const PUBLIC_PREFIXES = ["/sign-in", "/recover", "/activate", "/auth"];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser لا getSession: الأول يتحقّق من الرمز عند الخادم، والثاني يصدّق الكوكي.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isPublic && path !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
