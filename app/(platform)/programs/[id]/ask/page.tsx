import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { AskAdminView, type AnswerRow, type ReportRow } from "./ask-admin-view";

/**
 * تبويب المساعد (adr/0057) — تغذيته وتحسينه بلا عمل برمجي: أسئلةٌ بلا جواب، وإجاباتٌ أُبلغ عنها أو
 * ردّها الحارس، وكل جوابٍ يُكتب هنا يصير إجابةً معتمدة يقرؤها المساعد ويقلّد أسلوبها.
 */
export default async function AskTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authz = await authorizeRequest({ permission: "programs.write", programId: id, resourceProgramId: id });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [overview, reports, answers] = await Promise.all([
    db.rpc("fn_ask_overview", { p_program_id: id }),
    db
      .from("ask_reports")
      .select("id, kind, audience, question, answer, status, created_at")
      .eq("program_id", id)
      .eq("status", "open")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("ask_answers")
      .select("id, question, answer, status, origin, created_at")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (overview.error || reports.error || answers.error) return <ErrorState body="تعذّر جلب بيانات المساعد." />;

  const o = overview.data?.[0];
  const reportRows: ReportRow[] = (reports.data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind === "flagged" || r.kind === "blocked" ? r.kind : "unanswered",
    student: r.audience === "student",
    question: r.question,
    answer: r.answer,
    createdAt: r.created_at,
  }));
  const answerRows: AnswerRow[] = (answers.data ?? []).map((a) => ({
    id: a.id,
    question: a.question,
    answer: a.answer,
    published: a.status === "published",
  }));

  return (
    <AskAdminView
      programId={id}
      askedToday={o?.asked_24h ?? 0}
      reports={reportRows}
      answers={answerRows}
    />
  );
}
