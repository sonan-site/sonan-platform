/**
 * تجميع الأسئلة الشائعة بمجموعاتها — منطقٌ خالص.
 *
 * صفحة مسابقة سنن تجمع أسئلتها في ستّ مجموعات («عن المسابقة» · «التسجيل» …)،
 * وكانت المنصة تعرضها قائمةً مسطّحة واحدة.
 */

export type FaqItem = { id: string; question: string; answer: string; category: string };

/**
 * المجموعات **بترتيب ظهورها** لا أبجدياً: الإدارة رتّبت الأسئلة، فترتيبُ
 * المجموعة موضعُ أول سؤالٍ فيها. وما لا مجموعة له يتقدّم بلا عنوان — فلا
 * يُخترع له اسمٌ («عام») لم تكتبه الإدارة.
 */
export function groupFaq<T extends FaqItem>(items: readonly T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category.trim();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const blank = groups.get("");
  groups.delete("");
  return [...(blank ? ([["", blank]] as [string, T[]][]) : []), ...groups.entries()];
}
