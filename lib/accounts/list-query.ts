/**
 * ما يطلبه الرابط من «المشاركون في المنصة»: البحث والتصفية والفرز والصفحة
 * (`?q=` `?program=` `?status=` `?sort=` `?dir=` `?page=`).
 * الجدول الجامع يكتبها في الرابط، والصفحة تقرؤها هنا ثم تستعلم بها — وحدةٌ نقيّة تُختبر وحدها.
 */

export type AccountsSort = { column: "full_name" | "created_at"; ascending: boolean };

export const ACCOUNT_STATUSES = ["active", "suspended", "bin"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "نشط",
  suspended: "موقوف",
  bin: "في سلّة المحذوفات",
};

/** حالة الحساب من عموديه — في السلّة قبل الموقوف، كما تعرضه الشاشة وتصفّيه الدالة. */
export function accountStatusOf(r: { deleted_at: string | null; purge_after: string | null }): AccountStatus {
  return r.purge_after ? "bin" : r.deleted_at ? "suspended" : "active";
}

/**
 * التكرار المحتمل (الدفعة ٣): «مكرّر محتمل» بالميلاد مع الاسم أو الجوال، و«جوال مشترك» بميلادٍ آخر —
 * منفصلين، فالجوال المشترك أغلبه إخوة (٥٤ مقابل ٢٦ يوم ١٠ نوفمبر).
 */
export const ACCOUNT_DUPLICATES = ["identity", "phone"] as const;
export type AccountDuplicate = (typeof ACCOUNT_DUPLICATES)[number];
export const ACCOUNT_DUPLICATE_LABEL: Record<AccountDuplicate, string> = {
  identity: "مكرّر محتمل",
  phone: "جوال مشترك",
};

/** `none` بلا برنامج، أو معرّف برنامج. */
export const NO_PROGRAM = "none";

export type AccountsQuery = {
  /** كلمات الاسم، وكلٌّ منها يُطابَق وحده — «محمد علي» تجد «محمد بن علي». فارغةٌ إن كان البحث بالجوال. */
  nameWords: string[];
  /** أرقام الجوال بلا صفر البداية (`0553…` ⇐ `553…`) — تطابق المخزَّن `+966553…` وجزءه. */
  phoneDigits: string;
  /** `none` أو معرّف برنامج، أو `null` للكل. */
  program: string | null;
  status: AccountStatus | null;
  duplicate: AccountDuplicate | null;
  sort: AccountsSort;
  page: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
const MAX_PAGE = 100_000;
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

/**
 * معاملات `fn_accounts_list` من الرابط — للصفحة والتصدير معاً، فلا يختلف ما يُصدَّر عمّا يُعرض.
 * ومن لا يرى المشاركات كلها لا يُصفّي بـ«بلا برنامج»: قد تعني عنده «في برنامجٍ لا أراه».
 */
export function accountsListArgs(
  query: AccountsQuery,
  seesAllEnrolment: boolean,
  window: { limit: number; offset: number },
  /** حسابٌ وجده البحث برقم الوثيقة (الدفعة ٤) — يحلّ محلّ البحث بالاسم والجوال. */
  documentUserId: string | null = null,
) {
  const program = query.program === NO_PROGRAM && !seesAllEnrolment ? null : query.program;
  return {
    program,
    args: {
      p_name_words: documentUserId ? [] : query.nameWords,
      p_phone: documentUserId ? undefined : query.phoneDigits || undefined,
      p_user_id: documentUserId ?? undefined,
      p_program: program ?? undefined,
      p_status: query.status ?? undefined,
      p_sort: query.sort.column,
      p_desc: !query.sort.ascending,
      p_limit: window.limit,
      p_offset: window.offset,
      p_duplicate: query.duplicate ?? undefined,
    },
  };
}

export function parseAccountsQuery(params: {
  q?: Param;
  sort?: Param;
  dir?: Param;
  page?: Param;
  program?: Param;
  status?: Param;
  dup?: Param;
}): AccountsQuery {
  const raw = first(params.q).trim().slice(0, MAX_SEARCH);

  const compact = latinDigits(raw).replace(/[\s\-().+]/g, "");
  const digits = /^\d+$/.test(compact) ? compact.replace(/^0+/, "") : "";
  const phoneDigits = digits.length >= MIN_PHONE_DIGITS ? digits : "";

  // الدالة تطابق بـ`strpos` لا `ilike` — فـ`%` و`_` حرفان كغيرهما.
  const nameWords = phoneDigits ? [] : raw.split(/\s+/).filter(Boolean);

  const key = first(params.sort);
  const column = key ? SORT_COLUMNS[key] : undefined;
  const sort: AccountsSort = column ? { column, ascending: first(params.dir) !== "desc" } : DEFAULT_SORT;

  // سقفٌ يُبقي الإزاحة في مدى `int` — `?page=1e12` أو `Infinity` يعود إلى الأولى.
  const requested = Math.floor(Number(first(params.page)));
  const page = Number.isFinite(requested) && requested >= 1 && requested <= MAX_PAGE ? requested : 1;

  // ما لا يُعرف يُتجاهل — فلا تصل قيمةٌ من الرابط إلى الدالة إلا مما تفهمه.
  const rawProgram = first(params.program).toLowerCase();
  const program = rawProgram === NO_PROGRAM || UUID.test(rawProgram) ? rawProgram : null;
  const rawStatus = first(params.status);
  const status = (ACCOUNT_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as AccountStatus) : null;

  const rawDup = first(params.dup);
  const duplicate = (ACCOUNT_DUPLICATES as readonly string[]).includes(rawDup) ? (rawDup as AccountDuplicate) : null;

  return { nameWords, phoneDigits, program, status, duplicate, sort, page };
}
