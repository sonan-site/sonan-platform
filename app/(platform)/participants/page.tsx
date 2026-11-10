import { redirect } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/states";
import {
  ACCOUNT_DUPLICATE_LABEL,
  ACCOUNT_STATUS_LABEL,
  accountsListArgs,
  NO_PROGRAM,
  parseAccountsQuery,
} from "@/lib/accounts/list-query";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { findByDocument } from "@/lib/accounts/identity-search";
import { formatPhone } from "@/lib/profile/phone";
import { hrefWith, type FilterLink, type SearchParams } from "@/components/shared/filter-links";
import { ParticipantsView, type AccountRow } from "./participants-view";

/**
 * «المشاركون في المنصة» — كل من له حساب، وبرامجه معه (`adr/0032`).
 *
 * منفصلٌ عن «الإدارة» بقصد: تلك لأصحاب الأدوار، وهذه لمن يستعمل المنصة. وقد
 * يجتمع الوصفان في شخص، فيظهر في القائمتين — والصفتان تجتمعان فعلاً.
 *
 * البحث والتصفية والفرز والصفحة من الرابط (`lib/accounts/list-query.ts`)، و`fn_accounts_list`
 * تُرجع صفحةً واحدة بعددها الكلّي وبرامج كل حساب، بصلاحية من يطلب — فلا سقف على عدد الحسابات.
 */
export default async function ParticipantsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const authz = await authorizeRequest({ permission: "users.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (await authorizeRequest({ permission: "users.write" })).ok;
  // من يقرأ مشاركي بعض البرامج دون غيرها لا يرى مشاركات غيرها — فـ«بلا برنامج» عنده قد تعني
  // «في برنامجٍ لا أراه». فلا يُعرض له مرشّحاً ولا عدداً ولا وصفاً، لئلا يُحذف مشاركٌ على ظنّ.
  const seesAllEnrolment = (await authorizeRequest({ permission: "participants.read" })).ok;
  // البحث برقم الوثيقة لحامل «عرض أرقام الهويات كاملة» وحده (الدفعة ٤) — لغيره يكشف ما يخفيه القناع.
  const canReadIdentities = (await authorizeRequest({ permission: "identities.read" })).ok;
  const params = await searchParams;
  const query = parseAccountsQuery(params);
  const { status, duplicate, page } = query;

  const db = await createClient();
  const rawQuery = typeof params.q === "string" ? params.q : "";
  const documentUserId = await findByDocument((fn, a) => db.rpc(fn, a), rawQuery, canReadIdentities);
  const { program, args } = accountsListArgs(
    query,
    seesAllEnrolment,
    { limit: DEFAULT_PAGE_SIZE, offset: (page - 1) * DEFAULT_PAGE_SIZE },
    documentUserId,
  );

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
  if (page > 1 && data.length === 0) redirect(hrefWith("/participants", params));

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
    // `?? []`: كودٌ يسبق هجرته لا يُسقط الشاشة — بلا علامةٍ فقط.
    sameIdentity: p.same_identity ?? [],
    samePhone: p.same_phone ?? [],
  }));

  // عددٌ ناقص أسوأ من لا عدد — فإن تعذّر سُكت عنه.
  const withProgram =
    !enrolledResult || enrolledResult.error ? null : Number(enrolledResult.data?.[0]?.total ?? 0);

  // تعذّر جلب البرامج ⇐ لا مرشّح برامج، لا «كل البرامج» وحدها كأن لا برامج.
  const programs = programsResult.data ?? [];
  const programLinks: FilterLink[] = programsResult.error
    ? []
    : [
        { label: "كل البرامج", href: hrefWith("/participants", params, { program: null }), current: program === null },
        ...programs.map((g) => ({
          label: g.name,
          href: hrefWith("/participants", params, { program: g.id }),
          current: program === g.id,
        })),
        ...(seesAllEnrolment
          ? [{ label: "بلا برنامج", href: hrefWith("/participants", params, { program: NO_PROGRAM }), current: program === NO_PROGRAM }]
          : []),
      ];
  const statusLinks: FilterLink[] = [
    { label: "كل الحالات", href: hrefWith("/participants", params, { status: null }), current: status === null },
    ...(Object.entries(ACCOUNT_STATUS_LABEL) as [keyof typeof ACCOUNT_STATUS_LABEL, string][]).map(
      ([key, label]) => ({ label, href: hrefWith("/participants", params, { status: key }), current: status === key }),
    ),
  ];

  const duplicateLinks: FilterLink[] = [
    { label: "الكل", href: hrefWith("/participants", params, { dup: null }), current: duplicate === null },
    ...(Object.entries(ACCOUNT_DUPLICATE_LABEL) as [keyof typeof ACCOUNT_DUPLICATE_LABEL, string][]).map(
      ([key, label]) => ({ label, href: hrefWith("/participants", params, { dup: key }), current: duplicate === key }),
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
    duplicate ? { key: "dup", label: `التكرار: ${ACCOUNT_DUPLICATE_LABEL[duplicate]}` } : null,
  ].filter((f) => f !== null);

  return (
    <ParticipantsView
      rows={rows}
      total={Number(data[0]?.total ?? 0)}
      page={page}
      withProgram={withProgram}
      programLinks={programLinks}
      statusLinks={statusLinks}
      duplicateLinks={duplicateLinks}
      foundByDocument={documentUserId !== null}
      canSearchDocuments={canReadIdentities}
      activeFilters={active}
      // التصدير لحامل تعديل الحسابات وحده: الملف يُنسخ ويُرسل، والشاشة لا.
      exportHref={canWrite ? hrefWith("/participants/export", params) : null}
      canWrite={canWrite}
    />
  );
}
