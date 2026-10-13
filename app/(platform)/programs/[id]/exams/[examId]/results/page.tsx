import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { z } from "@/lib/validation/z";
import { ResultsView, type ResultRow, type TrackResults } from "./results-view";

/**
 * نتائج النهائي (`adr/0048` هـ · الدفعة د): لكل مسارٍ ترتيبه وتعادله وجوائزه من
 * صفحة البرنامج، ثم اعتماده (لقطةٌ مجمّدة) ثم نشره يوم الحفل. يدخلها مدير
 * الاختبارات أو ناشر نتائجها، وكل قراءةٍ من دالةٍ تحرس صلاحيتها.
 */
export default async function ResultsPage({ params }: { params: Promise<{ id: string; examId: string }> }) {
  const { id, examId } = await params;
  if (!z.uuid().safeParse(examId).success) notFound();

  const [manage, publish] = await Promise.all([
    authorizeRequest({ permission: "exams.manage", programId: id, resourceProgramId: id }),
    authorizeRequest({ permission: "exams.publish", programId: id, resourceProgramId: id }),
  ]);
  if (!manage.ok && !publish.ok) return <ErrorState title="غير مصرَّح" body={manage.message} />;

  const db = await createClient();
  const [examResult, programResult] = await Promise.all([
    db
      .from("exams")
      .select("id, name, exam_type, pass_percentage, award_percentage, sorted_at")
      .eq("id", examId)
      .eq("program_id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    db.from("programs").select("passing_percentage, award_percentage").eq("id", id).maybeSingle(),
  ]);
  const exam = examResult.data;
  if (!exam || exam.exam_type !== "oral") notFound();

  const overview = await db.rpc("fn_results_overview", { p_exam_id: examId });
  if (overview.error) return <ErrorState body="تعذّر جلب النتائج." />;

  const approvedIds = await db
    .from("exam_track_results")
    .select("id, track_id")
    .eq("exam_id", examId)
    .is("deleted_at", null);
  if (approvedIds.error) return <ErrorState body="تعذّر جلب النتائج." />;
  const approvedOf = new Map((approvedIds.data ?? []).map((a) => [a.track_id, a.id]));

  const tracks: TrackResults[] = [];
  for (const t of overview.data ?? []) {
    const frozen = approvedOf.get(t.track_id);
    let rows: ResultRow[];
    if (frozen) {
      // المعتمد يُعرض كما جُمِّد — لا كما يحسبه الحيّ الآن.
      const { data, error } = await db
        .from("exam_results")
        .select("participant_id, full_name, registration_no, percent, outcome, place, prize_label, prize_value")
        .eq("track_result_id", frozen)
        .order("place", { nullsFirst: false })
        .order("percent", { ascending: false, nullsFirst: false });
      if (error) return <ErrorState body="تعذّر جلب النتائج المعتمدة." />;
      rows = (data ?? []).map((r) => ({
        participantId: r.participant_id,
        name: r.full_name,
        registrationNo: r.registration_no,
        session: null,
        percent: r.percent === null ? null : Number(r.percent),
        outcome: r.outcome as ResultRow["outcome"],
        candidate: r.place !== null,
        place: r.place,
        prizeLabel: r.prize_label,
        prizeValue: r.prize_value,
        needsTiebreak: false,
        tieSize: 1,
      }));
    } else {
      const { data, error } = await db.rpc("fn_track_standings", { p_exam_id: examId, p_track_id: t.track_id });
      if (error) return <ErrorState body="تعذّر جلب الترتيب." />;
      rows = (data ?? []).map((r) => ({
        participantId: r.participant_id,
        name: r.full_name,
        registrationNo: r.registration_no,
        session: r.session_name,
        percent: r.percent === null ? null : Number(r.percent),
        outcome: r.outcome as ResultRow["outcome"],
        candidate: r.candidate,
        place: r.place,
        prizeLabel: r.prize_label,
        prizeValue: r.prize_value,
        needsTiebreak: r.needs_tiebreak,
        tieSize: r.tie_size ?? 1,
      }));
    }
    tracks.push({
      id: t.track_id,
      name: t.track_name,
      qualified: t.qualified,
      scored: t.scored,
      pending: t.pending,
      unassigned: t.unassigned,
      absent: t.absent,
      ties: t.ties,
      places: t.places,
      prizesProblem: t.prizes_problem,
      approvedAt: t.approved_at,
      publishedAt: t.published_at,
      changedPrizes: t.changed_prizes ?? false,
      rows,
    });
  }

  const program = programResult.data;
  const thresholdsDiffer =
    program !== null &&
    ((program.passing_percentage !== null && Number(program.passing_percentage) !== Number(exam.pass_percentage)) ||
      (program.award_percentage !== null &&
        exam.award_percentage !== null &&
        Number(program.award_percentage) !== Number(exam.award_percentage)));

  return (
    <>
      <p>
        <Link href={`/programs/${id}/exams/${examId}`}>{exam.name}</Link>
      </p>
      <ResultsView
        programId={id}
        examId={examId}
        examName={exam.name}
        sorted={exam.sorted_at !== null}
        passPercentage={Number(exam.pass_percentage)}
        awardPercentage={exam.award_percentage === null ? null : Number(exam.award_percentage)}
        thresholdsDiffer={thresholdsDiffer}
        canManage={manage.ok}
        canPublish={publish.ok}
        tracks={tracks}
      />
    </>
  );
}
