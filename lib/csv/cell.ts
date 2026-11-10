/**
 * خليّة CSV مأمونة — مشتركةٌ بين ملفات التصدير (النتائج، الحسابات).
 *
 * ما يبدأ بما يجعله صيغةً في Excel (`= + - @` أو جدولة) يُسبق بفاصلةٍ عليا فلا يُنفَّذ — الأسماء
 * يكتبها أصحابها. والجوال الدولي (`+9665…` أو `+966 50 123 4567`) أرقامٌ لا صيغة، فيبقى كما هو.
 */
export function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d ]{8,20}$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
