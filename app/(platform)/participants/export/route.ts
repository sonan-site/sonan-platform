import { toAccountsCsv, type AccountCsvRow } from "@/lib/accounts/accounts-csv";
import { findByDocument } from "@/lib/accounts/identity-search";
import { accountsListArgs, parseAccountsQuery } from "@/lib/accounts/list-query";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";

/** ما تُرجعه `fn_export_accounts` لكل حساب. */
type ExportedAccount = Omit<AccountCsvRow, "has_program"> & { has_program: boolean };

/**
 * تصدير «المشاركون في المنصة» (الدفعة ٢): ما تعرضه القائمة بعد البحث والتصفية، بكل صفحاته.
 *
 * `fn_export_accounts` تفحص الصلاحية (`users.read` و`users.write`) وتقرأ في استعلامٍ واحد وتكتب
 * التدقيق في المعاملة نفسها — فلا ملف بلا سطرٍ في السجلّ. وبجلسة المستخدم لا بمفتاح الخدمة، فالملف
 * لا يحوي إلا ما تعرضه له الشاشة. والفحص هنا قبلها ليُرَدّ غير المصرَّح بلا رحلة.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const [read, write] = await Promise.all([
    authorizeRequest({ permission: "users.read" }),
    authorizeRequest({ permission: "users.write" }),
  ]);
  if (!read.ok || !write.ok) return new Response("غير مصرَّح", { status: 403 });
  const seesAllEnrolment = (await authorizeRequest({ permission: "participants.read" })).ok;
  const canReadIdentities = (await authorizeRequest({ permission: "identities.read" })).ok;

  const url = new URL(req.url);
  const query = parseAccountsQuery({
    q: url.searchParams.get("q") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    program: url.searchParams.get("program") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    dup: url.searchParams.get("dup") ?? undefined,
  });
  const db = await createClient();
  // معاملات الصفحة نفسها — فلا يختلف ما يُصدَّر عمّا يُعرض، والبحث برقم الوثيقة منها. والنافذة لا تعني الدالة.
  const documentUserId = await findByDocument((fn, a) => db.rpc(fn, a), url.searchParams.get("q") ?? "", canReadIdentities);
  const { args } = accountsListArgs(query, seesAllEnrolment, { limit: 0, offset: 0 }, documentUserId);

  const { data, error } = await db.rpc("fn_export_accounts", {
    p_name_words: args.p_name_words,
    p_phone: args.p_phone,
    p_program: args.p_program,
    p_status: args.p_status,
    p_sort: args.p_sort,
    p_desc: args.p_desc,
    p_duplicate: args.p_duplicate,
    p_user_id: args.p_user_id,
  });
  if (error) {
    return new Response(error.code === "42501" ? "غير مصرَّح" : "تعذّر التصدير — لم يُسلَّم ملف", {
      status: error.code === "42501" ? 403 : 500,
    });
  }

  const rows: AccountCsvRow[] = (data as unknown as ExportedAccount[]).map((r) => ({
    ...r,
    // لا مشاركة ظاهرة ⇐ «بلا برنامج» لمن يرى المشاركات كلها، و«لا نعرف» لغيره — كالشاشة.
    has_program: r.has_program ? true : seesAllEnrolment ? false : null,
  }));

  return new Response(toAccountsCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="accounts.csv"; filename*=UTF-8''${encodeURIComponent("الحسابات.csv")}`,
      "cache-control": "no-store",
    },
  });
}
