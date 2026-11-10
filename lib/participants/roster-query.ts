/**
 * قائمة المشاركين في البرنامج (دَين `د-١٥` · `ق-٢٠`): البحث والتصفية والفرز والصفحة من الرابط
 * (`?q=` `?track=` `?status=` `?sort=` `?dir=` `?page=`).
 *
 * القائمة تُجلب كاملة (`fn_program_participants` محسوبةً في القاعدة) — فطلب المشارك في نموذج تغيير
 * المسار يحتاجها كلها — ثم تُصفّى وتُرتَّب وتُقسَّم هنا. وحدةٌ نقيّة تُختبر وحدها.
 */

type Param = string | string[] | undefined;

/** ما تحتاجه التصفية والفرز من صفّ المشارك. */
export type RosterItem = {
  name: string;
  registrationNo: string | null;
  trackId: string | null;
  trackName: string;
  status: string;
  joinedAt: string;
  doneDays: number;
  dayCount: number;
};

/** `none` بلا مسار، أو معرّف مسار. */
export const NO_TRACK = "none";

export type RosterSortKey = "name" | "track" | "progress";

export type RosterQuery = {
  words: string[];
  track: string | null;
  status: string | null;
  sort: { key: RosterSortKey; ascending: boolean } | null;
  page: number;
};

const MAX_SEARCH = 100;
const MAX_PAGE = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORT_KEYS: readonly RosterSortKey[] = ["name", "track", "progress"];

function first(value: Param): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** الأرقام الهندية والفارسية لاتينيةً — رقم التسجيل يُكتب بلوحةٍ عربية أحياناً. */
function latinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** `statuses` حالات البرنامج المعروفة — فلا تصل حالةٌ من الرابط لا يعرفها. */
export function parseRosterQuery(
  params: { q?: Param; track?: Param; status?: Param; sort?: Param; dir?: Param; page?: Param },
  statuses: readonly string[],
): RosterQuery {
  const words = latinDigits(first(params.q).trim().slice(0, MAX_SEARCH)).toLowerCase().split(/\s+/).filter(Boolean);

  const rawTrack = first(params.track).toLowerCase();
  const track = rawTrack === NO_TRACK || UUID.test(rawTrack) ? rawTrack : null;

  const rawStatus = first(params.status);
  const status = statuses.includes(rawStatus) ? rawStatus : null;

  const key = first(params.sort) as RosterSortKey;
  const sort = SORT_KEYS.includes(key) ? { key, ascending: first(params.dir) !== "desc" } : null;

  const requested = Math.floor(Number(first(params.page)));
  const page = Number.isFinite(requested) && requested >= 1 && requested <= MAX_PAGE ? requested : 1;

  return { words, track, status, sort, page };
}

/** كل كلمةٍ في الاسم أو رقم التسجيل — «محمد علي» تجد «محمد بن علي»، و`12` تجد `SN-1448-0012`. */
function matches<T extends RosterItem>(item: T, words: string[]): boolean {
  const hay = `${item.name} ${item.registrationNo ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

const collator = new Intl.Collator("ar");

/** نسبة الإنجاز للفرز — من لا خطة له في الذيل تصاعدياً. */
function progressOf(item: RosterItem): number {
  return item.dayCount > 0 ? item.doneDays / item.dayCount : -1;
}

/** يصفّي ويرتّب كل القائمة، ويُرجع الصفحة المطلوبة وعدد المطابِق. */
export function applyRosterQuery<T extends RosterItem>(
  items: readonly T[],
  query: RosterQuery,
  pageSize: number,
): { rows: T[]; total: number } {
  const filtered = items.filter(
    (item) =>
      matches(item, query.words) &&
      (query.track === null || (query.track === NO_TRACK ? item.trackId === null : item.trackId === query.track)) &&
      (query.status === null || item.status === query.status),
  );

  // بلا فرز ⇐ ترتيب القاعدة كما هو (الأحدث انضماماً أولاً). والفرز ثابت: المتساويان بترتيبهما.
  const sorted = query.sort ? [...filtered] : filtered;
  if (query.sort) {
    const { key, ascending } = query.sort;
    const dir = ascending ? 1 : -1;
    sorted.sort((a, b) => {
      const c =
        key === "name"
          ? collator.compare(a.name, b.name)
          : key === "track"
            ? collator.compare(a.trackName, b.trackName)
            : progressOf(a) - progressOf(b);
      return c * dir;
    });
  }

  const from = (query.page - 1) * pageSize;
  return { rows: sorted.slice(from, from + pageSize), total: sorted.length };
}
