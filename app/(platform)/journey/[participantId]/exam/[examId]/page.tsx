import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { ExamRunner } from "./exam-runner";
import styles from "./exam.module.css";

/**
 * الاختبار عن بعد للمشارك (`adr/0048`): التعليمات ثم المحاولة. والبوّابة
 * والمحاولات من `fn_my_exams` — المصدر نفسه الذي يرفض به البدء.
 */
export default async function ExamPage({ params }: { params: Promise<{ participantId: string; examId: string }> }) {
  const { participantId, examId } = await params;

  const session = await getSession();
  if (session.status !== "active") {
    return <ErrorState title="غير مصرَّح" body="سجّل الدخول لتدخل اختبارك." />;
  }

  const db = await createClient();
  const { data, error } = await db.rpc("fn_my_exams", { p_participant_id: participantId });
  if (error) return <ErrorState body="تعذّر جلب الاختبار." />;
  const exam = (data ?? []).find((e) => e.exam_id === examId);
  if (!exam) notFound();

  return (
    <div className={styles.shell}>
      <p className={styles.back}>
        <Link href={`/journey/${participantId}`}>رحلتي</Link>
      </p>
      <ExamRunner
        examId={examId}
        name={exam.name}
        questionCount={exam.question_count}
        secondsPerQuestion={exam.seconds_per_question}
        maxSkips={exam.max_skips}
        maxAttempts={exam.max_attempts}
        attempts={exam.attempts}
        passPercentage={Number(exam.pass_percentage)}
        bestPercent={exam.best_percent === null ? null : Number(exam.best_percent)}
        passed={exam.passed}
        openAttemptId={exam.open_attempt_id}
        blockers={exam.blockers ?? []}
      />
    </div>
  );
}
