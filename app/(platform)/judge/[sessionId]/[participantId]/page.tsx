import Link from "next/link";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { parseSheet } from "@/lib/exams/sheet";
import { canJudge } from "@/lib/exams/judge-access";
import { z } from "@/lib/validation/z";
import { SheetView } from "../../sheet-view";
import styles from "../../judge.module.css";

/** ورقة تقييم المحكّم لمشارك (`adr/0048`). */
export default async function JudgeSheetPage({
  params,
}: {
  params: Promise<{ sessionId: string; participantId: string }>;
}) {
  const { sessionId, participantId } = await params;
  if (!(await canJudge())) return <ErrorState title="غير مصرَّح" body="شاشة التحكيم لأعضاء لجان الاختبار." />;
  if (!z.object({ s: z.uuid(), p: z.uuid() }).safeParse({ s: sessionId, p: participantId }).success) {
    return <ErrorState body="ورقة غير معروفة." />;
  }

  const db = await createClient();
  const { data, error } = await db.rpc("fn_judge_sheet", { p_session_id: sessionId, p_participant_id: participantId });
  if (error) return <ErrorState body="تعذّر جلب الورقة — تحقّق أنك من لجنة الجلسة." />;
  let sheet;
  try {
    sheet = parseSheet(data);
  } catch {
    return <ErrorState body="تعذّرت قراءة الورقة." />;
  }

  return (
    <div className={styles.shell}>
      <p className={styles.back}>
        <Link href={`/judge/${sessionId}`}>مشاركو الجلسة</Link>
      </p>
      <SheetView sessionId={sessionId} participantId={participantId} judgeId={null} initial={sheet} />
    </div>
  );
}
