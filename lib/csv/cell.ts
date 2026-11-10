import { formatPhone } from "@/lib/profile/phone";

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

/**
 * الجوال لخليّة CSV: مقروءاً (`+966 50 123 4567`) ومسبوقاً بعلامة الاتجاه LRM (U+200E).
 * Excel يقرأ `+9665…` رقماً فيحذف «+» ويعرضه علمياً، والورقة العربية تقلب مجموعات الأرقام
 * المفصولة بمسافات. والعلامة غير مرئية: تُثبت الاتجاه، ولا تبدأ الخليّة بـ«+» فلا تُقرأ رقماً ولا صيغة.
 */
export function csvPhone(e164: string | null | undefined): string | null {
  return e164 ? `‎${formatPhone(e164)}` : null;
}
