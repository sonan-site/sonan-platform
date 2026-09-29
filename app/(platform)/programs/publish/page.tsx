import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
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
  /**
   * **يكفي أن يقرأ برنامجاً واحداً** — كما في قائمة البرامج: منسّقُ برنامجٍ
   * محصورٍ به يصل من التبويب نفسه، فلا يُفتح له باب ثم يُقال «غير مصرَّح».
   * والدالة تُرشّح برامجه وحدها.
   */
  const session = await getSession();
  const readScopes =
    session.status === "active" ? session.permissions.get("programs.read") : undefined;
  if (!readScopes) {
    return <ErrorState title="غير مصرَّح" body="لا تملك صلاحية لهذا الإجراء." />;
  }

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
    // الكتابة بنطاق البرنامج، فتأتي مع صفّه لا تُحسب في الشاشة.
    canWrite: p.can_write,
  }));

  return <PublishView rows={rows} canOrder={canOrder} />;
}
