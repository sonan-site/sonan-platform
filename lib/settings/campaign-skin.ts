/**
 * جلد الحملة خارج واجهتها (خطة ألوان الحملة · الاتجاه أ) — منطقٌ خالص.
 *
 * الجلد يتبع برنامج `home.featured_program`: إطفاء المفتاح يعيد كل شيء لهوية المنصة كما ينقضي
 * `adr/0045`. والقرار من المسار في العميل لا في التخطيط — التخطيط لا يُعاد عند التنقّل داخله
 * فيعلق قراره (مراجعة الخطة ح١).
 */

export type CampaignSkin = "campaign";

const REGISTER = /^\/p\/([^/?#]+)\/register(?:[/?#]|$)/;

/** صفحة تسجيل برنامج الحملة — لا بادئةٌ تطابق `/p/<slug>-other`. */
export function skinForPath(path: string, featured: string | null): CampaignSkin | null {
  if (!featured) return null;
  const m = REGISTER.exec(path);
  return m?.[1] === featured ? "campaign" : null;
}

/**
 * صفحات الدخول بوجهتها: `next` محلّيٌّ (يبدأ بـ`/` لا `//`) إلى صفحة تسجيل الحملة. الجلد لا يغيّر
 * التحويل — يقرأ الوجهة فقط، وحارسها في الصفحات كما هو.
 */
export function skinForNext(next: string | null | undefined, featured: string | null): CampaignSkin | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return skinForPath(next, featured);
}
