import { isNationalId, normalizeNationalId } from "@/lib/validation/identity";

/**
 * البحث برقم الوثيقة (الدفعة ٤ · `fn_account_by_identity`): **وضعٌ صريح** يختاره حامل `identities.read`
 * (`?by=doc`) لا تخمينٌ من شكل النصّ — فأرقام الوثائق أرقامٌ كالجوال، و١٧٧ من ٦٦٤ يوم ١٠ نوفمبر أرقامٌ
 * بلا حرفٍ وبغير شكل الهوية السعودية، فلا يفرّقها شكلٌ. والوضع الصريح لا يملأ السجلّ بكتابة اسمٍ أو جوال.
 *
 * وبعد البحث يُحوَّل الرابط إلى الحساب نفسه (`?account=`) — فالفرز والتصفية والتصدير لا تبحث ثانيةً
 * ولا تُسجّل ثانيةً.
 */
export const DOCUMENT_MODE = "doc";

/** الرقم مطبَّعاً إن صلح رقمَ وثيقة (٥–٢٠ خانة، أرقامٌ وأحرف لاتينية)، وإلا `null`. */
export function documentQuery(raw: string): string | null {
  const id = normalizeNationalId(raw.trim());
  return isNationalId(id) ? id : null;
}

type Rpc = (fn: "fn_account_by_identity", args: { p_national_id: string }) => PromiseLike<{
  data: string | null;
  error: { message: string } | null;
}>;

/**
 * الحساب الذي رقم وثيقته هذا — `undefined` إن لم يصلح رقماً (فلا بحث ولا سجلّ)، و`null` إن لم يوجد.
 * والدالة تفحص الصلاحية بنفسها وتُسجّل البحث؛ وتعذّرها يُقال في سجلّ الخادم ويُعامَل كلا نتيجة.
 */
export async function findByDocument(rpc: Rpc, rawQuery: string): Promise<string | null | undefined> {
  const id = documentQuery(rawQuery);
  if (!id) return undefined;
  const { data, error } = await rpc("fn_account_by_identity", { p_national_id: id });
  if (error) {
    console.error("fn_account_by_identity:", error.message);
    return null;
  }
  return data ?? null;
}
