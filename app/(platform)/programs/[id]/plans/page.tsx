import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { kindAllowsExams } from "@/lib/programs/kinds";
import { PlansView, type ExamRow, type PlanSummary, type TrackPlanRow } from "./plans-view";

/**
 * الخطط (`adr/0036` · `0038`): خطة افتراضية للبرنامج يرثها كل مسار، وخطة
 * مخصّصة لأي مسار تحلّ محلّها فيه. ولكل خطة ملاحظاتها على كل مسار يستعملها.
 */
export default async function PlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [programResult, tracksResult, plansResult, examsResult] = await Promise.all([
    db.from("programs").select("id, name, kind").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.from("tracks").select("id, name").eq("program_id", id).is("deleted_at", null).order("sort_order"),
    db.from("plans").select("id, track_id, name, day_count").eq("program_id", id).is("deleted_at", null),
    db
      .from("exams")
      .select("id, name, exam_type, stage, track_id, question_count")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("created_at"),
  ]);

  if (programResult.error || tracksResult.error || plansResult.error) {
    return <ErrorState body="تعذّر جلب الخطط." />;
  }
  if (!programResult.data) notFound();

  const tracks = tracksResult.data ?? [];
  const plans = plansResult.data ?? [];

  // ملاحظات كل خطة على كل مسار يستعملها، والأيام المقفلة — من القاعدة لا من حسابٍ موازٍ.
  let summaries: PlanSummary[];
  try {
    summaries = await Promise.all(
    plans.map(async (plan): Promise<PlanSummary> => {
      const [issues, locked] = await Promise.all([
        db.rpc("fn_plan_issues", { p_plan_id: plan.id }),
        db.rpc("fn_plan_locked_through", { p_plan_id: plan.id }),
      ]);
      // ملاحظةٌ أو قفلٌ تعذّرت قراءته لا يُعرض «سليمة» ولا «غير مقفل».
      if (issues.error || locked.error) throw new Error("plan summary unavailable");
      const rows = issues.data ?? [];
      return {
        id: plan.id,
        trackId: plan.track_id,
        name: plan.name,
        dayCount: plan.day_count,
        lockedThrough: locked.data ?? 0,
        issues: rows.map((r) => ({
          trackId: r.track_id,
          severity: r.severity === "error" ? "error" : "warning",
          message: r.message,
        })),
      };
    }),
  );
  } catch {
    return <ErrorState body="تعذّر فحص الخطط." />;
  }

  const defaultPlan = summaries.find((s) => s.trackId === null) ?? null;
  const customByTrack = new Map(summaries.filter((s) => s.trackId).map((s) => [s.trackId, s]));

  const rows: TrackPlanRow[] = tracks.map((track) => {
    const custom = customByTrack.get(track.id) ?? null;
    const plan = custom ?? defaultPlan;
    const issues = (plan?.issues ?? []).filter((i) => i.trackId === null || i.trackId === track.id);
    return {
      trackId: track.id,
      trackName: track.name,
      custom,
      planId: plan?.id ?? null,
      dayCount: plan?.dayCount ?? 0,
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message),
    };
  });

  const exams: ExamRow[] = (examsResult.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    type: e.exam_type,
    stage: e.stage,
    trackName: tracks.find((t) => t.id === e.track_id)?.name ?? null,
    questionCount: e.question_count,
  }));

  return (
    <PlansView
      programId={id}
      defaultPlan={defaultPlan}
      rows={rows}
      tracks={tracks}
      exams={kindAllowsExams(programResult.data.kind) ? exams : null}
    />
  );
}
