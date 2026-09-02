import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { PlansView, type TrackPlanRow } from "./plans-view";

export default async function PlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [programResult, tracksResult] = await Promise.all([
    db.from("programs").select("id, name").eq("id", id).is("deleted_at", null).maybeSingle(),
    db
      .from("tracks")
      .select("id, name")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  if (programResult.error || tracksResult.error) {
    return <ErrorState body="تعذّر جلب المسارات." />;
  }
  if (!programResult.data) notFound();

  const tracks = tracksResult.data ?? [];
  const trackIds = tracks.map((t) => t.id);
  const noRows = ["00000000-0000-0000-0000-000000000000"];

  const plansResult = await db
    .from("plans")
    .select("id, track_id, name")
    .in("track_id", trackIds.length > 0 ? trackIds : noRows)
    .is("deleted_at", null);

  const plans = plansResult.data ?? [];

  // عدّ الأيام لكل خطة — رأسٌ بلا صفوف، فالعدّ لا يجرّ الأيام كلها.
  const counts = await Promise.all(
    plans.map(async (plan) => {
      const { count } = await db
        .from("plan_days")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id)
        .is("deleted_at", null);
      return { planId: plan.id, count: count ?? 0 };
    }),
  );
  const countByPlan = new Map(counts.map((c) => [c.planId, c.count]));
  const planByTrack = new Map(plans.map((p) => [p.track_id, p]));

  const rows: TrackPlanRow[] = tracks.map((track) => {
    const plan = planByTrack.get(track.id);
    return {
      trackId: track.id,
      trackName: track.name,
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      dayCount: plan ? (countByPlan.get(plan.id) ?? 0) : 0,
    };
  });

  return (
    <PlansView programId={id} programName={programResult.data.name} rows={rows} />
  );
}
