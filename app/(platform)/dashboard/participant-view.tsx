import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import {
  dutyCompletion,
  dutyHeadline,
  dutyOpens,
  dutyState,
  type DutyRow,
} from "@/lib/dashboard/duties";
import { formatNumber, formatPercent, formatRelative } from "@/lib/format";
import styles from "./dashboard.module.css";

/**
 * لوحة وضع المشارك: **سطر الحسم لكل مشاركة، ورابطٌ واحد**.
 *
 * ولا تُعاد هنا شاشة الرحلة: تلك تعرض اليوم وواجباته ومقاديره وأزراره. وحصّة
 * اللوحة أين هو الآن، وهل ينتظره شيء — وحالةٌ واحدة تقولها اللوحة ولا تقولها
 * الرحلة: أنّه أتمّ أيام خطته كلها.
 */

function Body({ row }: { row: DutyRow }) {
  const state = dutyState(row);
  return (
    <>
      <span className={styles.dutyProgram}>
        {row.programName}
        {row.trackName ? ` · ${row.trackName}` : null}
      </span>
      <strong className={styles.dutyHeadline}>{dutyHeadline(row)}</strong>

      {row.submittedDays > 0 ? (
        <span className={styles.dutyMeta}>
          <span>
            أرسلتَ {formatNumber(row.submittedDays)} من {formatNumber(row.workDays)}
          </span>
          <span>الإتمام {formatPercent(dutyCompletion(row))}</span>
          {row.lastSubmittedAt ? <span>آخر إرسال {formatRelative(row.lastSubmittedAt)}</span> : null}
        </span>
      ) : null}

      {state === "not_ready" ? (
        <span className={styles.dutyNote}>
          {row.trackName
            ? "خطة مسارك ليست جاهزة بعدُ، فلا يوم يُفتح لك."
            : "لم يُحدَّد مسارك بعدُ، فلا يوم يُفتح لك."}
          {row.contact ? ` جهة التواصل: ${row.contact}` : " راجع إدارة البرنامج."}
        </span>
      ) : null}

      {state === "working" && row.programStatus !== "published" ? (
        <span className={styles.dutyNote}>
          البرنامج مغلق الآن. أكمِل ما بقي لك، وسجلّك محفوظ على كل حال.
        </span>
      ) : null}

      {row.proposedTrack ? (
        <span className={styles.dutyNote}>
          تقترح الإدارة نقلك إلى مسار {row.proposedTrack} — القرار عندها، وستُخبَر به.
        </span>
      ) : null}
    </>
  );
}

export function ParticipantView({ duties }: { duties: DutyRow[] }) {
  if (duties.length === 0) {
    return (
      <EmptyState
        kind="no-data"
        title="لست مشاركاً في أي برنامج"
        body="تصفّح البرامج المعلنة وسجّل في أحدها، ثم يظهر واجبك اليومي هنا."
        action={<Link href="/">تصفّح البرامج</Link>}
      />
    );
  }

  return (
    <>
      {duties.map((row) =>
        dutyOpens(row) ? (
          <Link
            key={row.participantId}
            href={`/journey/${row.participantId}`}
            className={styles.duty}
          >
            <Body row={row} />
          </Link>
        ) : (
          // مسارٌ لا يُبدأ به: البطاقة تُخبر ولا تَعِد بشاشةٍ لا شيء فيها.
          <div key={row.participantId} className={styles.duty}>
            <Body row={row} />
          </div>
        ),
      )}
    </>
  );
}
