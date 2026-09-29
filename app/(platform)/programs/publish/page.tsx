import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { isProgramKind } from "@/lib/programs/kinds";
import { PublishView, type PublishRow } from "./publish-view";

/**
 * «نشر البرامج» — موضعٌ واحد لكل ما يراه الزائر: النشر والرابط والترتيب،
 * ومنه إلى صفحة كل برنامج وأسئلته.
 *
 * وكانت هذه الأعمال متفرّقة: النشر في شاشة البرنامج، والترتيب غير موجود أصلاً،
 * والصفحة والأسئلة في تبويبين لا يُعرفان إلا بفتح البرنامج.
 */
export default async function PublishPage() {
  const authz = await authorizeRequest({ permission: "programs.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  // الترتيب يمسّ الواجهة كلها، فيشترط صلاحيةً عامة لا نطاق برنامج.
  const canOrder = (await authorizeRequest({ permission: "programs.write", programId: null })).ok;

  const db = await createClient();
  // نداءٌ واحد لكل البرامج: الحالة وما ينقص للنشر معاً (الهجرة ٠٥٠).
  const { data, error } = await db.rpc("fn_programs_publish_state");
  if (error) return <ErrorState body="تعذّر جلب حالة النشر. أعد المحاولة." />;

  const rows: PublishRow[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    kind: isProgramKind(p.kind) ? p.kind : "competition",
    status: p.status,
    sortOrder: p.sort_order,
    registration: p.registration_state,
    missing: p.missing ?? [],
  }));

  return <PublishView rows={rows} canOrder={canOrder} />;
}
