import { redirect } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/states";
import { parseAccountsQuery } from "@/lib/accounts/list-query";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { formatPhone } from "@/lib/profile/phone";
import { ParticipantsView, type AccountRow } from "./participants-view";

/** سقف ما تعيده PostgREST في الطلب الواحد — فيُجلب ما فوقه دفعاتٍ. */
const BATCH = 1000;

/**
 * «المشاركون في المنصة» — كل من له حساب، وبرامجه معه (`adr/0032`).
 *
 * منفصلٌ عن «الإدارة» بقصد: تلك لأصحاب الأدوار، وهذه لمن يستعمل المنصة. وقد
 * يجتمع الوصفان في شخص، فيظهر في القائمتين — والصفتان تجتمعان فعلاً.
 *
 * البحث والفرز والصفحة من الرابط (`?q=` `?sort=` `?dir=` `?page=`)، والقاعدة تُرجع
 * صفحةً واحدة بعددها الكلّي — فلا سقف على عدد الحسابات.
 */
export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authz = await authorizeRequest({ permission: "users.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (await authorizeRequest({ permission: "users.write" })).ok;
  const params = await searchParams;
  const { nameWords, phoneDigits, sort, page } = parseAccountsQuery(params);
  const from = (page - 1) * DEFAULT_PAGE_SIZE;

  const db = await createClient();
  let profilesQuery = db
    .from("profiles")
    .select("id, user_id, full_name, phone, created_at, deleted_at, purge_after", { count: "exact" })
    .order(sort.column, { ascending: sort.ascending })
    // ترتيبٌ ثانٍ ثابت: المتساويان في الاسم لا يتبادلان الصفحات.
    .order("id")
    .range(from, from + DEFAULT_PAGE_SIZE - 1);
  for (const word of nameWords) profilesQuery = profilesQuery.ilike("full_name", `%${word}%`);
  if (phoneDigits) profilesQuery = profilesQuery.like("phone", `%${phoneDigits}%`);

  const [profilesResult, withProgram] = await Promise.all([profilesQuery, countWithProgram(db)]);

  // صفحةٌ بعد آخر النتائج (رابطٌ محفوظ ثم حُذفت حسابات): PostgREST يرفضها (`PGRST103`)
  // أو يُرجعها فارغة — وكلاهما يوهم بخطأ أو بلا حسابات. فيُعاد إلى أولى الصفحات ببحثه وفرزه.
  const overshot =
    page > 1 && (profilesResult.error?.code === "PGRST103" || (!profilesResult.error && !profilesResult.data?.length));
  if (overshot) redirect(withoutPage(params));
  if (profilesResult.error) return <ErrorState body="تعذّر جلب الحسابات. أعد المحاولة." />;

  const profiles = profilesResult.data ?? [];
  // برامج الصفحة المعروضة وحدها — السياسات تحصرها ببرامج من يقرأ، فمنسّق برنامجٍ يرى مشاركيه وحدهم.
  const participationsResult = profiles.length
    ? await db
        .from("participants")
        .select("user_id, programs!inner(name)")
        .in("user_id", profiles.map((p) => p.user_id))
        .is("deleted_at", null)
    : { data: [], error: null };
  // تعذّر جلبها ⇐ «—» لا «بلا برنامج»: تلك تقول إنه لم يسجّل، وهي لا نعرفها.
  const programsKnown = !participationsResult.error;

  const programsOf = new Map<string, string[]>();
  for (const row of participationsResult.data ?? []) {
    // المشاركة تبقى بعد محو صاحبها بلا `user_id` — فلا برامج تُنسَب لأحد (`adr/0034`).
    if (!row.user_id) continue;
    const program = row.programs as unknown as { name: string };
    programsOf.set(row.user_id, [...(programsOf.get(row.user_id) ?? []), program.name]);
  }

  const rows: AccountRow[] = profiles.map((p) => ({
    id: p.id,
    userId: p.user_id,
    fullName: p.full_name,
    phone: p.phone ? formatPhone(p.phone) : "—",
    joinedAt: p.created_at,
    suspended: p.deleted_at !== null,
    // في السلّة ⇐ محذوف لا موقوف، فلا يُعرض عليه «أوقِف» ولا يُحسب حيّاً.
    purgeAfter: p.purge_after,
    programs: programsKnown ? (programsOf.get(p.user_id) ?? []) : null,
  }));

  return (
    <ParticipantsView
      rows={rows}
      total={profilesResult.count ?? rows.length}
      page={page}
      withProgram={withProgram}
      canWrite={canWrite}
    />
  );
}

/**
 * عدد من سجّل في برنامجٍ واحد على الأقل، عبر كل الحسابات لا الصفحة المعروضة.
 * لا رابط بين `profiles` و`participants` في القاعدة يُعدّ عليه، فيُجلب `user_id` وحده دفعاتٍ.
 */
async function countWithProgram(db: Awaited<ReturnType<typeof createClient>>): Promise<number | null> {
  const users = new Set<string>();
  // الحلقة يقودها العدد الكلّي من الدفعة الأولى، لا طول الدفعة — فلا يوقفها سقفٌ أصغر من `BATCH`.
  let total = Infinity;
  for (let from = 0; from < total; from += BATCH) {
    const { data, error, count } = await db
      .from("participants")
      .select("user_id", { count: from === 0 ? "exact" : undefined })
      .is("deleted_at", null)
      .not("user_id", "is", null)
      .order("id")
      .range(from, from + BATCH - 1);
    // عددٌ ناقص أسوأ من لا عدد — فيُسكت عنه.
    if (error || (from === 0 && count === null)) return null;
    if (from === 0) total = count ?? 0;
    for (const row of data) if (row.user_id) users.add(row.user_id);
  }
  return users.size;
}

/** الرابط نفسه ببحثه وفرزه، بلا رقم الصفحة. */
function withoutPage(params: Record<string, string | string[] | undefined>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) next.append(key, v);
  }
  const query = next.toString();
  return query ? `/participants?${query}` : "/participants";
}
