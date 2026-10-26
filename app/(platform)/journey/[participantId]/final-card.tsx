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

/**
 * حالة التأهل قبل حسم الفرز (خطة دليل المشارك · هـ): من `fn_my_eligibility` — القرار المسجَّل إن وُجد،
 * وإلا المحسوب **مبدئياً** بأسبابه. وبعد الحسم تحلّ محلّها `FinalCard`.
 */
export type JourneyEligibility = {
  examId: string;
  examName: string;
  eligible: boolean;
  decided: boolean;
  percent: number;
  entryPercentage: number | null;
  prerequisiteName: string | null;
  prerequisitePassed: boolean;
};

export function eligibilityLines(e: JourneyEligibility): string[] {
  if (e.eligible) {
    return e.decided
      ? ["تأهلت للاختبار النهائي. يُعلن موعد جلستك ومكانها هنا."]
      : ["تأهلت مبدئياً للاختبار النهائي. تُعتمد القوائم بعد الفرز، ويُعلن موعد جلستك ومكانها هنا."];
  }
  if (e.decided) return ["لم تتأهل للاختبار النهائي. لمراجعة القرار تواصل مع إدارة البرنامج."];
  const out = ["لم تتأهل مبدئياً للاختبار النهائي:"];
  if (e.entryPercentage !== null && e.percent < e.entryPercentage) {
    out.push(`لم تبلغ نسبة الإنجاز المطلوبة — أنجزت ${pct(e.percent)} من خطتك والمطلوب ${pct(e.entryPercentage)}.`);
  }
  if (!e.prerequisitePassed) {
    out.push(e.prerequisiteName ? `لم تجتز «${e.prerequisiteName}».` : "لم تجتز الاختبار السابق له.");
  }
  out.push("يُعتمد القرار بعد الفرز. ولمراجعته تواصل مع إدارة البرنامج.");
  return out;
}

export function EligibilityCard({ eligibility }: { eligibility: JourneyEligibility }) {
  return (
    <section className={styles.exam} aria-label={eligibility.examName}>
      <p className={styles.examName}>{eligibility.examName}</p>
      {eligibilityLines(eligibility).map((l) => (
        <p key={l}>{l}</p>
      ))}
    </section>
  );
}

/** صفوف الدالة إلى البطاقة. */
export function toEligibility(
  rows: {
    exam_id: string;
    exam_name: string;
    eligible: boolean;
    decided: boolean;
    percent: number;
    entry_percentage: number | null;
    prerequisite_name: string | null;
    prerequisite_passed: boolean;
  }[],
): JourneyEligibility[] {
  return rows.map((r) => ({
    examId: r.exam_id,
    examName: r.exam_name,
    eligible: r.eligible,
    decided: r.decided,
    percent: Number(r.percent),
    entryPercentage: r.entry_percentage === null ? null : Number(r.entry_percentage),
    prerequisiteName: r.prerequisite_name,
    prerequisitePassed: r.prerequisite_passed,
  }));
}
