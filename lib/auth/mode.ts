/**
 * وضع الجلسة — أي تجربةٍ يرى الداخل: المشارك أم الإدارة (`adr/0032`).
 *
 * **الحساب واحد والصفتان تجتمعان**، والباب الذي دخل منه هو ما يحدّد ما يراه.
 * فمن دخل من `/admin` يرى شاشات العمل، ومن دخل من `/sign-in` يرى رحلته —
 * ولمن يجمعهما مفتاحٌ في الرأس ينتقل به.
 *
 * **وهذا ترتيبٌ للتجربة لا حاجزٌ أمني:** الصلاحيات في الأدوار وسياسات القاعدة،
 * والوضع لا يمنح أحداً شيئاً ولا يمنعه ممّا يملك.
 */

export const MODE_COOKIE = "sonan.mode";

export type SessionMode = "participant" | "staff";

export function isSessionMode(value: unknown): value is SessionMode {
  return value === "participant" || value === "staff";
}

/**
 * الوضع المعمول به: ما اختاره الباب، وإلا فما يليق بالحساب.
 *
 * الجلسة القائمة قبل البوابتين، أو الداخل برابطٍ خارجي، لا كوكي له — فلا
 * يُترك بلا تجربة: صاحب الدور إلى الإدارة، وغيره إلى المشاركة.
 */
export function resolveMode(cookie: string | undefined, hasRole: boolean): SessionMode {
  if (isSessionMode(cookie)) return cookie;
  return hasRole ? "staff" : "participant";
}

/** المسارات التي لا معنى لها في وضع المشارك — شاشات عمل الإدارة. */
const STAFF_PREFIXES = ["/programs", "/team", "/participants", "/settings", "/audit"];

export function isStaffPath(path: string): boolean {
  return STAFF_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** الباب الذي يُردّ إليه غير الداخل — بحسب ما كان قاصداً. */
export function gateFor(path: string): "/admin" | "/sign-in" {
  return isStaffPath(path) ? "/admin" : "/sign-in";
}
