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
  const [tracksResult, ready] = await Promise.all([
    db
      .from("tracks")
      .select("id, name, description, capacity")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
    programReadiness(id),
  ]);

  if (tracksResult.error) return <ErrorState body="تعذّر جلب المسارات." />;

  const tracks: TrackRow[] = (tracksResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    capacity: t.capacity,
  }));

  // الشرط نفسه الذي تفرضه `fn_quick_setup`: لا مادة ولا واجبات ولا أشكال.
  const canQuickSetup =
    ready !== null &&
    ready.input.contentUnits === 0 &&
    ready.input.taskFields === 0 &&
    ready.input.templatesWithFields === 0;

  return (
    <TracksView programId={id} tracks={tracks} canWrite={canWrite} canQuickSetup={canQuickSetup} />
  );
}
