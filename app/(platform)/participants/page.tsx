import { redirect } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/states";
import { ACCOUNT_STATUS_LABEL, accountsListArgs, NO_PROGRAM, parseAccountsQuery } from "@/lib/accounts/list-query";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { formatPhone } from "@/lib/profile/phone";
import { ParticipantsView, type AccountRow, type FilterLink } from "./participants-view";

type Params = Record<string, string | string[] | undefined>;

/**
 * «المشاركون في المنصة» — كل من له حساب، وبرامجه معه (`adr/0032`).
 *
 * منفصلٌ عن «الإدارة» بقصد: تلك لأصحاب الأدوار، وهذه لمن يستعمل المنصة. وقد
 * يجتمع الوصفان في شخص، فيظهر في القائمتين — والصفتان تجتمعان فعلاً.
 *
 * البحث والتصفية والفرز والصفحة من الرابط (`lib/accounts/list-query.ts`)، و`fn_accounts_list`
 * تُرجع صفحةً واحدة بعددها الكلّي وبرامج كل حساب، بصلاحية من يطلب — فلا سقف على عدد الحسابات.
 */
export default async function ParticipantsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const authz = await authorizeRequest({ permission: "users.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (await authorizeRequest({ permission: "users.write" })).ok;
  // من يقرأ مشاركي بعض البرامج دون غيرها لا يرى مشاركات غيرها — فـ«بلا برنامج» عنده قد تعني
  // «في برنامجٍ لا أراه». فلا يُعرض له مرشّحاً ولا عدداً ولا وصفاً، لئلا يُحذف مشاركٌ على ظنّ.
  const seesAllEnrolment = (await authorizeRequest({ permission: "participants.read" })).ok;
  const params = await searchParams;
  const query = parseAccountsQuery(params);
  const { status, page } = query;
  const { program, args } = accountsListArgs(query, seesAllEnrolment, {
    limit: DEFAULT_PAGE_SIZE,
    offset: (page - 1) * DEFAULT_PAGE_SIZE,
  });

  const db = await createClient();
  const [listResult, enrolledResult, programsResult] = await Promise.all([
    db.rpc("fn_accounts_list", args),
    // رأس الشاشة: من في برنامجٍ على الأقل عبر كل الحسابات — العدد الكلّي لصفٍّ واحد يكفي.
    seesAllEnrolment ? db.rpc("fn_accounts_list", { p_program: "any", p_limit: 1 }) : null,
    db.from("programs").select("id, name").is("deleted_at", null).order("created_at"),
  ]);
  if (listResult.error) return <ErrorState body="تعذّر جلب الحسابات. أعد المحاولة." />;

  const data = listResult.data ?? [];
  // صفحةٌ بعد آخر النتائج (رابطٌ محفوظ ثم حُذفت حسابات) تُرجع فارغة فتوهم بلا حسابات —
  // فيُعاد إلى أولى الصفحات ببحثه وتصفيته وفرزه.
  if (page > 1 && data.length === 0) redirect(hrefWith(params, {}));

  const rows: AccountRow[] = data.map((p) => ({
    id: p.id,
    userId: p.user_id,
    fullName: p.full_name,
    phone: p.phone ? formatPhone(p.phone) : "—",
    joinedAt: p.created_at,
    suspended: p.deleted_at !== null,
    // في السلّة ⇐ محذوف لا موقوف، فلا يُعرض عليه «أوقِف» ولا يُحسب حيّاً.
    purgeAfter: p.purge_after,
    programs: p.programs,
    // لا مشاركة ظاهرة ⇐ «بلا برنامج» لمن يرى المشاركات كلها، و«لا نعرف» لغيره.
    hasProgram: p.has_program ? true : seesAllEnrolment ? false : null,
  }));

  // عددٌ ناقص أسوأ من لا عدد — فإن تعذّر سُكت عنه.
  const withProgram =
    !enrolledResult || enrolledResult.error ? null : Number(enrolledResult.data?.[0]?.total ?? 0);

  // تعذّر جلب البرامج ⇐ لا مرشّح برامج، لا «كل البرامج» وحدها كأن لا برامج.
  const programs = programsResult.data ?? [];
  const programLinks: FilterLink[] = programsResult.error
    ? []
    : [
        { label: "كل البرامج", href: hrefWith(params, { program: null }), current: program === null },
        ...programs.map((g) => ({
          label: g.name,
          href: hrefWith(params, { program: g.id }),
          current: program === g.id,
        })),
        ...(seesAllEnrolment
          ? [{ label: "بلا برنامج", href: hrefWith(params, { program: NO_PROGRAM }), current: program === NO_PROGRAM }]
          : []),
      ];
  const statusLinks: FilterLink[] = [
    { label: "كل الحالات", href: hrefWith(params, { status: null }), current: status === null },
    ...(Object.entries(ACCOUNT_STATUS_LABEL) as [keyof typeof ACCOUNT_STATUS_LABEL, string][]).map(
      ([key, label]) => ({ label, href: hrefWith(params, { status: key }), current: status === key }),
    ),
  ];

  // وسوم التصفية النشطة في الجدول بأبعادها — تُزال بنقرة، ويقول الفراغ «لا نتيجة» لا «لا حسابات».
  const active = [
    program === NO_PROGRAM
      ? { key: "program", label: "البرنامج: بلا برنامج" }
      : program
        ? { key: "program", label: `البرنامج: ${programs.find((g) => g.id === program)?.name ?? "برنامجٌ واحد"}` }
        : null,
    status ? { key: "status", label: `الحالة: ${ACCOUNT_STATUS_LABEL[status]}` } : null,
  ].filter((f) => f !== null);

  return (
    <ParticipantsView
      rows={rows}
      total={Number(data[0]?.total ?? 0)}
      page={page}
      withProgram={withProgram}
      programLinks={programLinks}
      statusLinks={statusLinks}
      activeFilters={active}
      // التصدير لحامل تعديل الحسابات وحده: الملف يُنسخ ويُرسل، والشاشة لا.
      exportHref={canWrite ? hrefWith(params, {}, "/participants/export") : null}
      canWrite={canWrite}
    />
  );
}

/** الرابط نفسه ببحثه وتصفيته وفرزه، مع ما يُبدَّل، وبلا رقم الصفحة — فالتصفية تبدأ من أولها. */
function hrefWith(params: Params, patch: Record<string, string | null>, path = "/participants"): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || key in patch || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) next.append(key, v);
  }
  for (const [key, value] of Object.entries(patch)) if (value) next.set(key, value);
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}
