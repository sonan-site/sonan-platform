import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { AskAdminView, type AnswerRow, type ReportRow } from "./ask-admin-view";
import type { UsageRow } from "./usage-table";

/**
 * تبويب المساعد (adr/0057) — تغذيته وتحسينه بلا عمل برمجي: أسئلةٌ بلا جواب، وإجاباتٌ أُبلغ عنها أو
 * ردّها الحارس، وكل جوابٍ يُكتب هنا يصير إجابةً معتمدة يقرؤها المساعد ويقلّد أسلوبها.
 */
export default async function AskTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authz = await authorizeRequest({ permission: "programs.write", programId: id, resourceProgramId: id });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [usage, reports, answers] = await Promise.all([
    db.rpc("fn_ask_usage", { p_program_id: id }),
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
  if (reports.error || answers.error) return <ErrorState body="تعذّر جلب بيانات المساعد." />;

  // العدّاد إحصاء: تعذّره يُخفي قسمه وحده، ويبقى ما بانتظار الجواب والإجابات المعتمدة.
  if (usage.error) console.error("ask: تعذّر جلب العدّاد", usage.error.message);
  const counts = usage.error ? null : (usage.data ?? []);
  const usageRows: UsageRow[] = (counts ?? []).map((c) => ({ outcome: c.outcome, today: c.today, last7: c.last_7, total: c.total }));
  const sum = (k: "today" | "last7" | "total") => usageRows.reduce((n, r) => n + r[k], 0);
  const totals: UsageRow = { outcome: "total", today: sum("today"), last7: sum("last7"), total: sum("total") };
  // «أسئلة اليوم» ما وصل النموذج: المردود بالحدّ يُعدّ في جدوله لا في الرأس، فمُغرِقٌ واحد لا يضخّمه.
  const reachedToday = usageRows.filter((r) => r.outcome !== "limited").reduce((n, r) => n + r.today, 0);

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
      usage={counts === null ? null : totals.total === 0 ? [] : [...usageRows, totals]}
      askedToday={reachedToday}
      students={(counts ?? []).reduce((n, c) => n + c.student_total, 0)}
      since={counts?.[0]?.first_day ?? null}
      reports={reportRows}
      answers={answerRows}
    />
  );
}
