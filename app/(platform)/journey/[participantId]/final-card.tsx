import { formatDateBoth, formatNumber, formatTime } from "@/lib/format";
import styles from "./journey.module.css";

/** النهائي في «رحلتي» (الدفعة د): من `fn_my_final` — والنتيجة لا تصل قبل نشرها. */
export type JourneyFinal = {
  examId: string;
  examName: string;
  qualified: boolean;
  sessionName: string | null;
  scheduledAt: string | null;
  location: string | null;
  absent: boolean;
  published: boolean;
  percent: number | null;
  outcome: string | null;
  place: number | null;
  prizeLabel: string | null;
  prizeValue: string | null;
};

const pct = (n: number) => `${formatNumber(n)}٪`;

function lines(f: JourneyFinal): string[] {
  if (f.published) {
    if (f.outcome === "absent") return ["غبت عن جلستك، فلم تُحتسب لك درجة."];
    const out = [f.outcome === "passed" ? `اجتزت بنسبة ${pct(f.percent ?? 0)}. مبارك.` : `نسبتك ${pct(f.percent ?? 0)} — لم تبلغ نسبة الاجتياز.`];
    if (f.place !== null) out.push(`${f.prizeLabel ?? `المركز ${formatNumber(f.place)}`}: ${f.prizeValue ?? ""}`.trim());
    return out;
  }
  if (!f.qualified) return ["لم تتأهل للاختبار النهائي. سجلّك محفوظ، وتابع إعلانات الجمعية للدورة القادمة."];
  if (f.absent) return ["سُجّل غيابك عن جلستك — تواصل مع إدارة البرنامج لجلسة تعويض."];
  if (f.sessionName && f.scheduledAt) {
    return [
      "تأهلت للاختبار النهائي.",
      `جلستك: ${f.sessionName} — ${formatDateBoth(f.scheduledAt)}، الساعة ${formatTime(f.scheduledAt)}${f.location ? ` — ${f.location}` : ""}.`,
    ];
  }
  return ["تأهلت للاختبار النهائي. يُعلن موعد جلستك ومكانها هنا."];
}

export function FinalCard({ final }: { final: JourneyFinal }) {
  return (
    <section className={styles.exam} aria-label={final.examName}>
      <p className={styles.examName}>{final.examName}</p>
      {lines(final).map((l) => (
        <p key={l}>{l}</p>
      ))}
    </section>
  );
}

/** صفوف الدالة إلى البطاقة. */
export function toFinals(
  rows: {
    exam_id: string;
    exam_name: string;
    qualified: boolean;
    session_name: string | null;
    scheduled_at: string | null;
    location: string | null;
    absent: boolean;
    published: boolean;
    percent: number | null;
    outcome: string | null;
    place: number | null;
    prize_label: string | null;
    prize_value: string | null;
  }[],
): JourneyFinal[] {
  return rows.map((r) => ({
    examId: r.exam_id,
    examName: r.exam_name,
    qualified: r.qualified,
    sessionName: r.session_name,
    scheduledAt: r.scheduled_at,
    location: r.location,
    absent: r.absent,
    published: r.published,
    percent: r.percent === null ? null : Number(r.percent),
    outcome: r.outcome,
    place: r.place,
    prizeLabel: r.prize_label,
    prizeValue: r.prize_value,
  }));
}
