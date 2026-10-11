import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { formatDateTime, formatNumber } from "@/lib/format";
import { canJudge } from "@/lib/exams/judge-access";
import styles from "./judge.module.css";

const STATUS = { scheduled: "لم تبدأ", in_progress: "جارية", closed: "أُقفلت" } as const;

/** جلسات المحكّم (`adr/0048`) — ما أُسند إليه وحده، بما اعتمده منها. */
export default async function JudgePage() {
  if (!(await canJudge())) return <ErrorState title="غير مصرَّح" body="شاشة التحكيم لأعضاء لجان الاختبار." />;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_judge_sessions");
  if (error) return <ErrorState body="تعذّر جلب جلساتك." />;
  const sessions = data ?? [];

  return (
    <div className={styles.shell}>
      <h1>التحكيم</h1>
      {sessions.length === 0 ? (
        <EmptyState kind="no-data" title="لا جلسات لك" body="تظهر هنا الجلسات التي تُسندها إليك إدارة الاختبارات." />
      ) : (
        <ul className={styles.list}>
          {sessions.map((s) => (
            <li key={s.session_id}>
              <Link
                href={`/judge/${s.session_id}`}
                className={`${styles.item} ${s.participants > 0 && s.approved === s.participants ? styles.itemDone : ""}`}
              >
                <span className={styles.itemName}>
                  {s.name} — {s.exam_name}
                </span>
                <span className={styles.muted}>
                  {formatDateTime(s.scheduled_at)}
                  {s.location ? ` · ${s.location}` : ""} · {STATUS[s.status]}
                </span>
                <span>
                  اعتمدتَ {formatNumber(s.approved)} من {formatNumber(s.participants)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
