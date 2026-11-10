import { normalizeNationalId } from "@/lib/validation/identity";

/**
 * هل نصّ البحث رقمُ وثيقة؟ (الدفعة ٤ · `fn_account_by_identity`) — يُرجع الرقم مطبَّعاً أو `null`.
 *
 * رقم الوثيقة أرقامٌ وأحرف لاتينية من ٥ إلى ٢٠ خانة، والجوال أرقامٌ أيضاً — فيُفرَّق بينهما بما يكتبه
 * الناس: الجوال يبدأ بـ`0` أو `+` أو `966`، والهوية والإقامة بـ`1` أو `2`، والجواز بحرف. وأقلّ من ستّ
 * خاناتٍ لا يُبحث به: كل بحثٍ يُسجَّل، والكتابة حرفاً حرفاً لا تملأ السجلّ.
 */
const MIN_DOCUMENT = 6;

export function documentQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+") || trimmed.startsWith("00")) return null;
  const id = normalizeNationalId(trimmed);
  if (!/^[A-Z0-9]{5,20}$/.test(id) || id.length < MIN_DOCUMENT) return null;
  if (id.startsWith("0") || id.startsWith("966")) return null;
  return id;
}

type Rpc = (fn: "fn_account_by_identity", args: { p_national_id: string }) => PromiseLike<{
  data: string | null;
  error: unknown;
}>;

/**
 * الحساب الذي يطابق نصَّ البحث رقمَ وثيقة — لحامل `identities.read` وحده، وإلا `null` بلا طلب.
 * والدالة تفحص الصلاحية بنفسها وتُسجّل البحث؛ وتعذّرها يُعامَل كلا نتيجة، فيُكمل البحث بالاسم والجوال.
 */
export async function findByDocument(rpc: Rpc, rawQuery: string, canReadIdentities: boolean): Promise<string | null> {
  const id = canReadIdentities ? documentQuery(rawQuery) : null;
  if (!id) return null;
  const { data, error } = await rpc("fn_account_by_identity", { p_national_id: id });
  return error ? null : (data ?? null);
}
