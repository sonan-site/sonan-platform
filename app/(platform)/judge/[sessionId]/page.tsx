import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { formatNumber } from "@/lib/format";
import { canJudge } from "@/lib/exams/judge-access";
import { z } from "@/lib/validation/z";
import styles from "../judge.module.css";

/** مشاركو الجلسة بترتيب دخولهم، وحال تقييم المحكّم لكلٍّ — تقييمه هو. */
export default async function JudgeSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!(await canJudge())) return <ErrorState title="غير مصرَّح" body="شاشة التحكيم لأعضاء لجان الاختبار." />;
  if (!z.uuid().safeParse(sessionId).success) return <ErrorState body="جلسة غير معروفة." />;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_judge_session", { p_session_id: sessionId });
  if (error) return <ErrorState body="تعذّر جلب الجلسة — تحقّق أنك من لجنتها." />;
  const rows = data ?? [];

  return (
    <div className={styles.shell}>
      <p className={styles.back}>
        <Link href="/judge">جلساتي</Link>
      </p>
      <h1>المشاركون</h1>
      {rows.length === 0 ? (
        <EmptyState kind="no-data" title="لا مشاركين بعد" body="يظهرون هنا حين تُسندهم الإدارة إلى الجلسة." />
      ) : (
        <ol className={styles.list}>
          {rows.map((r) => (
            <li key={r.participant_id}>
              <Link
                href={`/judge/${sessionId}/${r.participant_id}`}
                className={`${styles.item} ${r.approved ? styles.itemDone : ""}`}
              >
                <span className={styles.itemName}>
                  {formatNumber(r.sort_order)}. {r.full_name}
                </span>
                <span className={styles.muted}>
                  {r.track_name ?? ""}
                  {r.registration_no !== null ? ` · رقم ${formatNumber(r.registration_no)}` : ""}
                </span>
                <span>
                  {r.approved
                    ? "اعتمدتَه"
                    : r.evaluated > 0
                      ? `قيّمت ${formatNumber(r.evaluated)} من ${formatNumber(r.total)}`
                      : "لم تبدأ"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
