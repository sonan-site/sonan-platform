import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { z } from "@/lib/validation/z";
import { OralView, type EligibilityRow, type EvaluationRow, type ScoreRow, type SessionCard } from "./oral-view";

/**
 * الاختبار الشفهي (`adr/0048`): الفرز، والجلسات بلجانها ومشاركيها وحال
 * تحكيمهم، والدرجات. كل قراءةٍ من دالةٍ تحرس صلاحية `exams.manage`.
 */
export default async function OralExamPage({ params }: { params: Promise<{ id: string; examId: string }> }) {
  const { id, examId } = await params;
  if (!z.uuid().safeParse(examId).success) notFound();

  const authz = await authorizeRequest({ permission: "exams.manage", programId: id, resourceProgramId: id });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const { data: exam } = await db
    .from("exams")
    .select("id, name, exam_type, judge_count, entry_percentage, eligibility_at")
    .eq("id", examId)
    .eq("program_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!exam || exam.exam_type !== "oral") notFound();

  const [eligibility, sessionsResult, tracksResult, candidates, scores] = await Promise.all([
    db.rpc("fn_final_eligibility", { p_exam_id: examId }),
    db
      .from("exam_sessions")
      .select("id, name, scheduled_at, location, status, session_judges(user_id, deleted_at), session_participants(participant_id, sort_order, deleted_at)")
      .eq("exam_id", examId)
      .is("deleted_at", null)
      .order("scheduled_at"),
    db.from("tracks").select("id, name").eq("program_id", id).is("deleted_at", null).order("sort_order"),
    db.rpc("fn_exam_judge_candidates", { p_program_id: id }),
    db.rpc("fn_final_scores", { p_exam_id: examId }),
  ]);
  if (eligibility.error || sessionsResult.error || tracksResult.error || candidates.error || scores.error) {
    return <ErrorState body="تعذّر جلب الاختبار النهائي." />;
  }

  const sessionsRaw = sessionsResult.data ?? [];
  const evaluations = await Promise.all(sessionsRaw.map((s) => db.rpc("fn_session_evaluations", { p_session_id: s.id })));
  if (evaluations.some((e) => e.error)) return <ErrorState body="تعذّر جلب حال التحكيم." />;

  const names = new Map((eligibility.data ?? []).map((r) => [r.participant_id, r.full_name]));
  for (const s of scores.data ?? []) names.set(s.participant_id, s.full_name);

  const rows: EligibilityRow[] = (eligibility.data ?? []).map((r) => ({
    participantId: r.participant_id,
    name: r.full_name,
    registrationNo: r.registration_no,
    trackId: r.track_id,
    status: r.status,
    percent: Number(r.percent),
    prerequisitePassed: r.prerequisite_passed,
    eligible: r.eligible,
  }));

  const sessions: SessionCard[] = sessionsRaw.map((s, i) => ({
    id: s.id,
    name: s.name,
    scheduledAt: s.scheduled_at,
    location: s.location,
    status: s.status,
    judges: (s.session_judges ?? []).filter((j) => j.deleted_at === null).map((j) => j.user_id),
    participants: (s.session_participants ?? [])
      .filter((p) => p.deleted_at === null)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ id: p.participant_id, name: names.get(p.participant_id) ?? "—", order: p.sort_order })),
    evaluations: (evaluations[i]!.data ?? []).map(
      (e): EvaluationRow => ({
        participantId: e.participant_id,
        judgeId: e.judge_id,
        judgeName: e.judge_name,
        evaluated: e.evaluated,
        total: e.total,
        approved: e.approved,
        retroactive: e.retroactive,
      }),
    ),
  }));

  const scoreRows: ScoreRow[] = (scores.data ?? []).map((s) => ({
    participantId: s.participant_id,
    name: s.full_name,
    registrationNo: s.registration_no,
    trackId: s.track_id,
    session: s.session_name,
    judges: s.judges,
    approved: s.approved,
    percent: s.percent === null ? null : Number(s.percent),
  }));

  return (
    <>
      <p>
        <Link href={`/programs/${id}/exams`}>الاختبارات</Link>
      </p>
      <OralView
        programId={id}
        examId={examId}
        examName={exam.name}
        entryPercentage={exam.entry_percentage === null ? null : Number(exam.entry_percentage)}
        judgeCount={exam.judge_count ?? 0}
        eligibilityAt={exam.eligibility_at}
        tracks={tracksResult.data ?? []}
        eligibility={rows}
        sessions={sessions}
        candidates={(candidates.data ?? []).map((c) => ({ id: c.user_id, name: c.full_name }))}
        scores={scoreRows}
      />
    </>
  );
}
