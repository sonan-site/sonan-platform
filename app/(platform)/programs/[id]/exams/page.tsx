import { notFound } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { toDateInput } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import { kindAllowsExams } from "@/lib/programs/kinds";
import { ExamsView, type CriterionRow, type ExamSettings, type QuestionRow, type ResultRow } from "./exams-view";

/**
 * الاختبارات وبنك الأسئلة (`adr/0048`): تعريف كل اختبار بإعداداته المخصّصة،
 * ومعايير الخصم للتحكيم، والبنك بإدخاله واستيراده. `?page=` و`?q=` للبنك.
 */
export default async function ExamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam, q } = await searchParams;

  const authz = await authorizeRequest({
    permission: "exams.manage",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const search = (q ?? "").trim().slice(0, 100);

  const db = await createClient();
  let questionsQuery = db
    .from("questions")
    .select(
      "id, track_id, text, question_type, score, correct_answer_text, content_units(sequence), question_options(text, is_correct, sort_order, deleted_at)",
      { count: "exact" },
    )
    .eq("program_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + DEFAULT_PAGE_SIZE - 1);
  if (search) questionsQuery = questionsQuery.ilike("text", `%${search.replace(/[%_]/g, "")}%`);

  const [programResult, tracksResult, examsResult, criteriaResult, questionsResult, unitsResult] = await Promise.all([
    db.from("programs").select("id, kind").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.from("tracks").select("id, name").eq("program_id", id).is("deleted_at", null).order("sort_order"),
    db
      .from("exams")
      .select(
        "id, name, exam_type, stage, track_id, pass_percentage, question_count, entry_percentage, prerequisite_exam_id, seconds_per_question, max_skips, max_attempts, opens_at, closes_at, eligibility_at, judge_count, award_percentage",
      )
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("created_at"),
    db
      .from("deduction_criteria")
      .select("id, label, deduction_value")
      .eq("program_id", id)
      .is("question_id", null)
      .is("deleted_at", null)
      .order("sort_order"),
    questionsQuery,
    db
      .from("content_units")
      .select("sequence")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sequence", { ascending: false })
      .limit(1),
  ]);

  if (programResult.error || tracksResult.error || examsResult.error || criteriaResult.error || questionsResult.error) {
    return <ErrorState body="تعذّر جلب الاختبارات." />;
  }
  if (!programResult.data) notFound();
  if (!kindAllowsExams(programResult.data.kind)) {
    return <ErrorState title="لا اختبارات في هذا البرنامج" body="الاختبارات لبرامج المسابقة وحدها." />;
  }

  const exams: ExamSettings[] = (examsResult.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    examType: e.exam_type,
    stage: e.stage,
    trackId: e.track_id,
    passPercentage: Number(e.pass_percentage),
    questionCount: e.question_count,
    entryPercentage: e.entry_percentage === null ? null : Number(e.entry_percentage),
    prerequisiteExamId: e.prerequisite_exam_id,
    secondsPerQuestion: e.seconds_per_question,
    maxSkips: e.max_skips,
    maxAttempts: e.max_attempts,
    opensOn: e.opens_at ? toDateInput(e.opens_at) : "",
    closesOn: e.closes_at ? toDateInput(e.closes_at) : "",
    eligibilityOn: e.eligibility_at ? toDateInput(e.eligibility_at) : "",
    judgeCount: e.judge_count,
    awardPercentage: e.award_percentage === null ? null : Number(e.award_percentage),
  }));

  // نتائج كل اختبارٍ عن بعد — من دالةٍ تحرس الصلاحية وتشتقّ الأعلى.
  const remote = exams.filter((e) => e.examType === "remote");
  const resultSets = await Promise.all(remote.map((e) => db.rpc("fn_exam_results", { p_exam_id: e.id })));
  if (resultSets.some((r) => r.error)) return <ErrorState body="تعذّر جلب نتائج الاختبار." />;
  const results: ResultRow[] = remote.flatMap((e, i) =>
    (resultSets[i]!.data ?? []).map((r) => ({
      key: `${e.id}-${r.participant_id}`,
      examName: e.name,
      name: r.full_name,
      registrationNo: r.registration_no,
      trackId: r.track_id,
      attempts: r.attempts,
      open: r.open_attempt,
      bestPercent: r.best_percent === null ? null : Number(r.best_percent),
      passed: r.passed,
    })),
  );

  const criteria: CriterionRow[] = (criteriaResult.data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    value: Number(c.deduction_value),
  }));

  const questions: QuestionRow[] = (questionsResult.data ?? []).map((row) => {
    const options = (row.question_options ?? [])
      .filter((o) => o.deleted_at === null)
      .sort((a, b) => a.sort_order - b.sort_order);
    return {
      id: row.id,
      trackId: row.track_id,
      text: row.text,
      type: row.question_type,
      score: Number(row.score),
      answer: row.correct_answer_text,
      unit: row.content_units?.sequence ?? 0,
      options: options.map((o) => ({ text: o.text, correct: o.is_correct })),
    };
  });

  return (
    <ExamsView
      programId={id}
      tracks={tracksResult.data ?? []}
      exams={exams}
      criteria={criteria}
      questions={questions}
      questionTotal={questionsResult.count ?? 0}
      page={page}
      lastUnit={unitsResult.data?.[0]?.sequence ?? 0}
      results={results}
    />
  );
}
