import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { programReadiness } from "@/lib/programs/readiness-server";
import { TracksView, type TrackRow } from "./tracks-view";

/** تبويب المسارات — الخطوة الأولى، ومعها الإعداد السريع (`adr/0029`). */
export default async function TracksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authz = await authorizeRequest({
    permission: "programs.read",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (
    await authorizeRequest({ permission: "programs.write", programId: id, resourceProgramId: id })
  ).ok;

  const db = await createClient();
  const [tracksResult, usageResult, ready, plansResult, templatesResult] = await Promise.all([
    db
      .from("tracks")
      .select("id, name, description, capacity")
      .eq("program_id", id)
      // الترتيب الثاني يحسم التساوي: `sort_order` بلا قيد فريد، ومساران
      // برقمٍ واحد كانا يتبادلان مواضعهما بين طلبٍ وطلب.
      .order("sort_order")
      .order("created_at"),
    // ما يشغل كل مسار — ليُعطَّل زرّ حذفه بسببٍ مكتوب لا أن يُرفض بعد النقر.
    db.rpc("fn_track_usage", { p_program_id: id }),
    programReadiness(id),
    // الإعداد السريع يرفض أي خطةٍ أو شكل يوم ولو فارغين — فلا يُعرض زرّه لما سيُرفض.
    db.from("plans").select("id", { count: "exact", head: true }).eq("program_id", id).is("deleted_at", null),
    db.from("day_templates").select("id", { count: "exact", head: true }).eq("program_id", id).is("deleted_at", null),
  ]);

  if (tracksResult.error) return <ErrorState body="تعذّر جلب المسارات." />;

  const usage = new Map((usageResult.data ?? []).map((u) => [u.track_id, u]));

  const tracks: TrackRow[] = (tracksResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    capacity: t.capacity,
    participants: usage.get(t.id)?.live_participants ?? 0,
    plans: usage.get(t.id)?.plans ?? 0,
  }));

  // الشرط الذي تفرضه `fn_quick_setup`: لا مادة ولا حقول ولا خطة ولا شكل يوم.
  const canQuickSetup =
    ready !== null &&
    ready.input.contentUnits === 0 &&
    ready.input.taskFields === 0 &&
    plansResult.count === 0 &&
    templatesResult.count === 0;

  return (
    <TracksView programId={id} tracks={tracks} canWrite={canWrite} canQuickSetup={canQuickSetup} />
  );
}
