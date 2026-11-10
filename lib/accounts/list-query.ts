/**
 * ما يطلبه الرابط من «المشاركون في المنصة»: البحث والفرز والصفحة (`?q=` `?sort=` `?dir=` `?page=`).
 * الجدول الجامع يكتبها في الرابط، والصفحة تقرؤها هنا ثم تستعلم بها — وحدةٌ نقيّة تُختبر وحدها.
 */

export type AccountsSort = { column: "full_name" | "created_at"; ascending: boolean };

export type AccountsQuery = {
  /** كلمات الاسم، وكلٌّ منها يُطابَق وحده — «محمد علي» تجد «محمد بن علي». فارغةٌ إن كان البحث بالجوال. */
  nameWords: string[];
  /** أرقام الجوال بلا صفر البداية (`0553…` ⇐ `553…`) — تطابق المخزَّن `+966553…` وجزءه. */
  phoneDigits: string;
  sort: AccountsSort;
  page: number;
};

/** قيمة الرابط قد تتكرّر (`?q=a&q=b`) فتصل مصفوفة — يؤخذ أولها. */
type Param = string | string[] | undefined;

/** مفاتيح أعمدة الجدول القابلة للفرز ⇐ أعمدة `profiles`. ما سواها يُتجاهل. */
const SORT_COLUMNS: Record<string, AccountsSort["column"]> = {
  fullName: "full_name",
  joinedAt: "created_at",
};

/** الأحدث أولاً حين لا فرز — كما كانت القائمة. */
const DEFAULT_SORT: AccountsSort = { column: "created_at", ascending: false };

const MAX_SEARCH = 100;
/** أقل من ثلاثة أرقام (بعد صفر البداية) يطابق شريحةً واسعة — فيُعامل اسماً لا جوالاً. */
const MIN_PHONE_DIGITS = 3;

function first(value: Param): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** الأرقام الهندية والفارسية لاتينيةً: كثيرون يكتبون بلوحة عربية. */
function latinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function parseAccountsQuery(params: { q?: Param; sort?: Param; dir?: Param; page?: Param }): AccountsQuery {
  const raw = first(params.q).trim().slice(0, MAX_SEARCH);

  const compact = latinDigits(raw).replace(/[\s\-().+]/g, "");
  const digits = /^\d+$/.test(compact) ? compact.replace(/^0+/, "") : "";
  const phoneDigits = digits.length >= MIN_PHONE_DIGITS ? digits : "";

  // `%` `_` حروف مطابقة في `ilike` — فلا تبقى في كلمة.
  const nameWords = phoneDigits
    ? []
    : raw.replace(/[%_*\\]/g, " ").split(/\s+/).filter(Boolean);

  const key = first(params.sort);
  const column = key ? SORT_COLUMNS[key] : undefined;
  const sort: AccountsSort = column ? { column, ascending: first(params.dir) !== "desc" } : DEFAULT_SORT;

  const page = Math.max(1, Math.floor(Number(first(params.page))) || 1);

  return { nameWords, phoneDigits, sort, page };
}
