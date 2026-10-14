import { gateFor } from "@/lib/auth/mode";
import { DEFAULT_LANDING, safeNext } from "@/lib/auth/safe-next";

/** صفحات الدخول — لا تكون وجهةً بعد الدخول، فلا تدور التحويلات. */
const AUTH_SCREENS = ["/sign-in", "/sign-up", "/recover", "/admin"];

export function isAuthScreen(path: string): boolean {
  return AUTH_SCREENS.includes(path);
}

/**
 * حكم البوّابة في الوسيط — خالصٌ فيُختبر (رحلة التسجيل ت٢). يُرجع العنوان الداخلي
 * الذي يُحوَّل إليه (مساراً باستعلامه)، أو `null` فيمضي الطلب.
 *
 * - **الزائر على صفحةٍ محمية** يُردّ إلى الباب الذي يليق بها، **ووجهته المسار باستعلامه**
 *   (`?day=3` لا يضيع) — ولا يُحمل استعلام الطلب نفسه إلى عنوان الباب.
 * - **الداخل على صفحة دخول** يُردّ إلى `next` إن كانت آمنةً وليست صفحة دخول، وإلا إلى اللوحة.
 */
export function gateRedirect(input: { path: string; search: string; signedIn: boolean; isPublic: boolean }): string | null {
  const { path, search, signedIn, isPublic } = input;
  if (!signedIn && !isPublic) {
    const next = safeNext(`${path}${search}`);
    return `${gateFor(path)}?next=${encodeURIComponent(next)}`;
  }
  if (signedIn && isAuthScreen(path)) {
    const wanted = safeNext(new URLSearchParams(search).get("next"));
    return isAuthScreen(wanted.split("?")[0] ?? "") ? DEFAULT_LANDING : wanted;
  }
  return null;
}
