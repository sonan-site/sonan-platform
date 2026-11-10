import { toAccountsCsv, type AccountCsvRow } from "@/lib/accounts/accounts-csv";
import { accountsListArgs, parseAccountsQuery } from "@/lib/accounts/list-query";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";

/** سقف الدالة للصفحة الواحدة — فيُجمع الملف صفحاتٍ. */
const BATCH = 1000;

/**
 * تصدير «المشاركون في المنصة» (الدفعة ٢): ما تعرضه القائمة بعد البحث والتصفية، بكل صفحاته.
 *
 * **لحامل تعديل الحسابات وحده** (قرار الراعي): أرقام الجوالات في ملفٍ تُنسخ وتُرسل، لا كرؤيتها في الشاشة.
 * وبجلسة المستخدم لا بمفتاح الخدمة — فالملف لا يحوي إلا ما تعرضه له الشاشة. **ويُدقَّق قبل التسليم:**
 * إن تعذّر التدقيق لم يُسلَّم ملف.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const [read, write] = await Promise.all([
    authorizeRequest({ permission: "users.read" }),
    authorizeRequest({ permission: "users.write" }),
  ]);
  if (!read.ok || !write.ok) return new Response("غير مصرَّح", { status: 403 });
  const seesAllEnrolment = (await authorizeRequest({ permission: "participants.read" })).ok;

  const url = new URL(req.url);
  const query = parseAccountsQuery({
    q: url.searchParams.get("q") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    program: url.searchParams.get("program") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });

  const db = await createClient();
  const rows: AccountCsvRow[] = [];
  let program: string | null = null;
  for (let offset = 0, total = Infinity; offset < total; offset += BATCH) {
    const built = accountsListArgs(query, seesAllEnrolment, { limit: BATCH, offset });
    program = built.program;
    const { data, error } = await db.rpc("fn_accounts_list", built.args);
    if (error) return new Response("تعذّر التصدير", { status: 500 });
    if (!data.length) break;
    total = Number(data[0]!.total);
    for (const r of data) {
      rows.push({
        full_name: r.full_name,
        phone: r.phone,
        programs: r.programs,
        has_program: r.has_program ? true : seesAllEnrolment ? false : null,
        created_at: r.created_at,
        deleted_at: r.deleted_at,
        purge_after: r.purge_after,
      });
    }
  }

  const { error: auditError } = await db.rpc("fn_write_audit", {
    p_action: "accounts_exported",
    p_entity_table: "profiles",
    p_after: {
      count: rows.length,
      q: query.nameWords.join(" ") || query.phoneDigits || null,
      program,
      status: query.status,
    },
  });
  if (auditError) return new Response("تعذّر تسجيل التصدير — لم يُسلَّم الملف", { status: 500 });

  return new Response(toAccountsCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="accounts.csv"; filename*=UTF-8''${encodeURIComponent("الحسابات.csv")}`,
      "cache-control": "no-store",
    },
  });
}
