import { Flag } from "lucide-react";
import { notFound } from "next/navigation";
import { JourneyBail } from "@/components/shared/journey-bail";
import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { formatDate, formatDateTime, formatNumber, formatPercent, nowIso, toDateInput } from "@/lib/format";
import { afterDaysText, daysLeftText, daysUntil, followsPlan, pace, parseJourneyState, type JourneyState } from "@/lib/participants/journey";
import { HEAT_LABEL, heatRange, heatWeeks, nextExam, type HeatKind } from "@/lib/participants/progress-view";
import { countPhrase, type Material } from "@/lib/programs/material";
import { formatRegistrationNo } from "@/lib/programs/registration";
import styles from "./progress.module.css";

const WEEKDAYS = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const LEGEND: HeatKind[] = ["done", "recovered", "stumbled", "exempt", "rest", "pending"];
const R = 40;
const C = 2 * Math.PI * R;

/** سبتُ الأسبوع في عمود الخريطة: «10 أكتوبر» — أوضح من «−٣». */
const shortDay = (iso: string) => formatDate(iso).replace(/\s*\d{4}$/, "");

/** «إنجازي» — التقدّم والأيام المتتالية والتعثّر وخريطة الالتزام والاختبار القادم (`adr/0050`). */
export default async function JourneyProgressPage({ params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  const session = await getSession();
  if (session.status !== "active") return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترى إنجازك." />;

  const db = await createClient();
  const { data: participant, error } = await db
    .from("participants")
    .select(
      "id, status, track_id, registration_no, programs!inner(id, name, slug, contact, registration_prefix, section_label, unit_singular, unit_one, unit_two, unit_few, unit_many), tracks(id, name)",
    )
    .eq("id", participantId)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return <ErrorState body="تعذّر جلب مشاركتك." />;
  if (!participant) notFound();

  const program = participant.programs as unknown as {
    id: string;
    name: string;
    slug: string;
    contact: string;
    registration_prefix: string | null;
    section_label: string | null;
    unit_singular: string | null;
    unit_one: string | null;
    unit_two: string | null;
    unit_few: string | null;
    unit_many: string | null;
  };
  const track = participant.tracks as unknown as { id: string; name: string } | null;
  const bail = (title: string, body: string) => (
    <JourneyBail
      title={title}
      body={body}
      programName={program.name}
      programSlug={program.slug}
      contact={program.contact}
      registrationNo={formatRegistrationNo(program.registration_prefix, participant.registration_no)}
    />
  );
  if (!participant.track_id || !track) return bail("لم يُحدَّد مسارك", "تواصل مع إدارة البرنامج ليُحدَّد مسارك، وبعدها يظهر إنجازك هنا.");
  if (!followsPlan(participant.status)) return bail("انتهت رحلتك في هذا البرنامج", "سجلّك محفوظ. تابع إعلانات الجمعية للدورة القادمة.");

  // الحال أولاً — قراءتها تسوّي ما مضى، فالأرشيف بعدها كاملٌ إلى الآن (م٣).
  const stateResult = await db.rpc("fn_journey_state", { p_participant_id: participantId });
  if (stateResult.error) return <ErrorState body="تعذّر جلب حالك في الخطة." />;
  let state: JourneyState | null;
  try {
    state = parseJourneyState(stateResult.data);
  } catch {
    return <ErrorState body="تعذّر جلب حالك في الخطة." />;
  }
  if (!state) return bail("لا خطة لمسارك", "خطة مسارك ليست جاهزة.");

  const range = heatRange(state.today);
  const [statsResult, calendarResult, archiveResult, milestonesResult] = await Promise.all([
    db.rpc("fn_my_stats", { p_participant_id: participantId }),
    db.rpc("fn_my_calendar", { p_participant_id: participantId, p_from: range.from, p_to: range.to }),
    db
      .from("commitment_archive")
      .select("calendar_date, status, compensated_at")
      .eq("participant_id", participantId)
      .eq("track_id", state.trackId)
      .eq("plan_id", state.planId)
      .is("deleted_at", null)
      .gte("calendar_date", range.from)
      .lte("calendar_date", range.to),
    db.rpc("fn_my_milestones", { p_participant_id: participantId }),
  ]);
  if (statsResult.error || !statsResult.data?.[0]) return <ErrorState body="تعذّر جلب إحصاءاتك." />;
  const stats = statsResult.data[0];

  // الخريطة والاختبار القادم ثانويّان: تعذّرهما يُخفيهما ولا يُسقط الصفحة.
  const weeks =
    calendarResult.error || archiveResult.error
      ? null
      : heatWeeks({
          calendar: (calendarResult.data ?? []).map((c) => ({ date: c.calendar_date, isProgramDay: c.is_program_day })),
          archive: (archiveResult.data ?? []).map((a) => ({
            date: a.calendar_date,
            status: a.status,
            compensated: a.compensated_at !== null,
          })),
          today: state.today,
          startDate: state.startDate,
          completedToday: state.completedToday,
        });
  const now = nowIso();
  const exam = nextExam(milestonesResult.data ?? [], now);
  // الأيام إلى الاختبار بتاريخ الرياض لا بالساعات — «اليوم» لما موعده اليوم (ح١).
  const examIn = exam ? daysUntil(state.today, toDateInput(exam.at)) : 0;

  const material: Material = {
    forms: {
      sectionLabel: program.section_label,
      singular: program.unit_singular,
      one: program.unit_one,
      two: program.unit_two,
      few: program.unit_few,
      many: program.unit_many,
    },
    sections: [],
  };
  const pct = Math.min(100, Math.max(0, state.progressPct));
  // لا «100٪» قبل الختم: النسبة تُقرَّب إلى الأدنى (ح٥).
  const shownPct = Math.floor(pct);
  const p = pace(state);
  const stumbled = stats.stumbled_days;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>إنجازي</h1>

      <section className={styles.ring} aria-label="الإنجاز">
        <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden>
          <circle className={styles.track} cx="50" cy="50" r={R} />
          <circle className={styles.fill} cx="50" cy="50" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
        </svg>
        <div className={styles.ringText}>
          <span className={styles.big}>{formatPercent(shownPct / 100)}</span>
          <span>
            {formatNumber(state.doneDays)} من {afterDaysText(state.dayCount)}
          </span>
          {state.measure === "units" && state.shareSize > 0 ? (
            <span className={styles.muted}>
              {countPhrase(material, state.progressUnits)} من {formatNumber(state.shareSize)}
            </span>
          ) : null}
          <span className={`${styles.pace} ${p.tone === "behind" ? styles.paceBehind : ""}`}>{p.text}</span>
        </div>
      </section>

      <section className={styles.kpis} aria-label="المؤشرات">
        <div className={styles.kpi}>
          <span>أيامٌ متتالية</span>
          <b>{formatNumber(stats.streak)}</b>
          <small>{stats.streak > 0 ? "بلا تعثّر حتى اليوم" : state.doneDays === 0 ? "تبدأ بإتمام يومك الأول" : "تبدأ من جديد بإتمام يومك"}</small>
        </div>
        <div className={styles.kpi}>
          <span>في موعدها</span>
          <b>
            {formatNumber(stats.on_time)} <small>من {formatNumber(state.doneDays)}</small>
          </b>
          <small>أتممتها قبل نهاية رصد موعدها</small>
        </div>
        <div className={styles.kpi}>
          <span>أيام التعثّر</span>
          <b>{formatNumber(stumbled)}</b>
          <small>
            {stumbled === 0
              ? "لا تعثّر — بارك الله فيك"
              : stats.compensated_days > 0
                ? `عُوِّض منها ${formatNumber(stats.compensated_days)}`
                : "أيامٌ فات موعدها قبل إتمامها"}
          </small>
        </div>
        <div className={styles.kpi}>
          <span>مجموع التكرار</span>
          <b>{formatNumber(Number(stats.reps))}</b>
          <small>في الأيام المُتمّة</small>
        </div>
      </section>

      {weeks ? (
        <section className={styles.heatBox} aria-label="التزامك في أربعة أسابيع">
          <h2 className={styles.h2}>التزامك في أربعة أسابيع</h2>
          <div className={styles.heat}>
            <span />
            {WEEKDAYS.map((d) => (
              <span key={d} className={styles.wd}>
                {d}
              </span>
            ))}
            {weeks.map((week, i) => (
              <div key={week[0]?.date ?? i} className={styles.heatRow}>
                <span className={styles.wd}>{week[0] ? shortDay(week[0].date) : ""}</span>
                {week.map((c) => (
                  <i
                    key={c.date}
                    role="img"
                    className={`${styles.cell} ${styles[c.kind] ?? ""} ${c.today ? styles.today : ""}`}
                    title={`${formatDate(c.date)} · ${HEAT_LABEL[c.kind]}${c.today ? " · اليوم" : ""}`}
                    aria-label={`${formatDate(c.date)}: ${HEAT_LABEL[c.kind]}${c.today ? "، اليوم" : ""}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <ul className={styles.legend}>
            {LEGEND.map((k) => (
              <li key={k}>
                <i className={`${styles.cell} ${styles[k] ?? ""}`} aria-hidden />
                {HEAT_LABEL[k]}
              </li>
            ))}
            <li>
              <i className={`${styles.cell} ${styles.today}`} aria-hidden />
              اليوم
            </li>
          </ul>
        </section>
      ) : null}

      {exam ? (
        <section className={styles.next} aria-label="الاختبار القادم">
          <span className={styles.nextIcon}>
            <Flag size={20} aria-hidden />
          </span>
          <span className={styles.nextText}>
            <b>{exam.name}</b>
            <span>
              {formatDateTime(exam.at)}
              {exam.exam_type === "oral" && exam.location ? ` · ${exam.location}` : ""}
              {examIn > 0 ? ` · بقي ${daysLeftText(examIn)}` : " · اليوم"}
            </span>
          </span>
        </section>
      ) : null}
    </div>
  );
}
