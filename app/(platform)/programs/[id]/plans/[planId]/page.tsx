import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { PlanView, type DayRow, type ExamRow } from "./plan-view";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [programResult, planResult, templatesResult, examsResult, tracksResult] = await Promise.all([
    db.from("programs").select("id, name").eq("id", id).is("deleted_at", null).maybeSingle(),
    db
      .from("plans")
      .select("id, name, track_id, tracks!inner(id, name, program_id)")
      .eq("id", planId)
      .is("deleted_at", null)
      .maybeSingle(),
    db
      .from("day_templates")
      .select("id, name")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("name"),
    db
      .from("exams")
      .select("id, name, exam_type, stage, track_id")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("name"),
    db
      .from("tracks")
      .select("id, name")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  if (programResult.error || planResult.error) return <ErrorState body="تعذّر جلب الخطة." />;
  if (!programResult.data || !planResult.data) notFound();

  // الخطة تحت برنامجها لا تحت أي برنامج: مسار مطابق وإلا فالعنوان مُلفَّق.
  const track = planResult.data.tracks as unknown as {
    id: string;
    name: string;
    program_id: string;
  };
  if (track.program_id !== id) notFound();

  const daysResult = await db
    .from("plan_days")
    .select("id, day_number, day_type, day_template_id, amount_multiplier, exam_id")
    .eq("plan_id", planId)
    .is("deleted_at", null)
    .order("day_number");

  if (daysResult.error) return <ErrorState body="تعذّر جلب أيام الخطة." />;

  const templates = templatesResult.data ?? [];
  const exams = examsResult.data ?? [];
  const examName = new Map(exams.map((e) => [e.id, e.name]));

  const days: DayRow[] = (daysResult.data ?? []).map((d) => ({
    id: d.id,
    dayNumber: d.day_number,
    dayType: d.day_type,
    templateId: d.day_template_id,
    multiplier: Number(d.amount_multiplier),
    examName: d.exam_id ? (examName.get(d.exam_id) ?? "—") : null,
  }));

  const trackName = new Map((tracksResult.data ?? []).map((t) => [t.id, t.name]));
  const examRows: ExamRow[] = exams.map((e) => ({
    id: e.id,
    name: e.name,
    examType: e.exam_type,
    stage: e.stage,
    trackName: e.track_id ? (trackName.get(e.track_id) ?? "—") : null,
  }));

  return (
    <PlanView
      programId={id}
      programName={programResult.data.name}
      planId={planId}
      planName={planResult.data.name}
      trackName={track.name}
      days={days}
      templates={templates}
      exams={examRows}
      tracks={tracksResult.data ?? []}
    />
  );
}
