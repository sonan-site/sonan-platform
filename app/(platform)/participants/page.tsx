import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { formatPhone } from "@/lib/profile/phone";
import { ParticipantsView, type AccountRow } from "./participants-view";

/**
 * «المشاركون في المنصة» — كل من له حساب، وبرامجه معه (`adr/0032`).
 *
 * منفصلٌ عن «الإدارة» بقصد: تلك لأصحاب الأدوار، وهذه لمن يستعمل المنصة. وقد
 * يجتمع الوصفان في شخص، فيظهر في القائمتين — والصفتان تجتمعان فعلاً.
 */
export default async function ParticipantsPage() {
  const authz = await authorizeRequest({ permission: "users.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (await authorizeRequest({ permission: "users.write" })).ok;

  const db = await createClient();
  const [profilesResult, participationsResult] = await Promise.all([
    db
      .from("profiles")
      .select("id, user_id, full_name, phone, created_at, deleted_at")
      .order("created_at", { ascending: false })
      .limit(500),
    // السياسات تحصر ما يُقرأ ببرامج من يقرأ — فمنسّق برنامجٍ يرى مشاركيه وحدهم.
    db
      .from("participants")
      .select("user_id, programs!inner(name)")
      .is("deleted_at", null),
  ]);

  if (profilesResult.error) return <ErrorState body="تعذّر جلب الحسابات. أعد المحاولة." />;

  const programsOf = new Map<string, string[]>();
  for (const row of participationsResult.data ?? []) {
    const program = row.programs as unknown as { name: string };
    programsOf.set(row.user_id, [...(programsOf.get(row.user_id) ?? []), program.name]);
  }

  const rows: AccountRow[] = (profilesResult.data ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    fullName: p.full_name,
    phone: p.phone ? formatPhone(p.phone) : "—",
    joinedAt: p.created_at,
    suspended: p.deleted_at !== null,
    programs: programsOf.get(p.user_id) ?? [],
  }));

  return <ParticipantsView rows={rows} canWrite={canWrite} />;
}
