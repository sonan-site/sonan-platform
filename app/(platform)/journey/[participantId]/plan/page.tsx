import { BookOpen, Check, ChevronDown, ExternalLink, Flag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyBail } from "@/components/shared/journey-bail";
import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { daysText, followsPlan, lastVisibleDay, pace, parseJourneyState, type JourneyState } from "@/lib/participants/journey";
import {
  dayStatus,
  daySummary,
  isPlanFilter,
  parsePlan,
  planWeeks,
  repetitionText,
  shortDate,
  shownDate,
  STATUS_LABEL,
  taskLines,
  type DayStatus,
  type PlanDay,
  type PlanFilter,
} from "@/lib/participants/plan-view";
import type { TrackShare } from "@/lib/plans/engine";
import { withStarts, type Material } from "@/lib/programs/material";
import { formatRegistrationNo } from "@/lib/programs/registration";
import styles from "./plan.module.css";

const FILTERS: { key: PlanFilter; label: string }[] = [
  { key: "all", label: "كل الأيام" },
  { key: "next", label: "القادمة" },
  { key: "late", label: "المتأخرة" },
];

/** «الخطة» — كل أيام خطة المسار، أسبوعاً أسبوعاً، ومحطات الاختبار بينها (`adr/0050`). عرضٌ لا رصد. */
export default async function JourneyPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ participantId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { participantId } = await params;
  const show = (await searchParams).show;
  const filter: PlanFilter = isPlanFilter(show) ? show : "all";

  const session = await getSession();
  if (session.status !== "active") return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترى خطتك." />;

  const db = await createClient();
  const { data: participant, error } = await db
    .from("participants")
    .select(
      "id, status, track_id, registration_no, programs!inner(id, name, slug, contact, registration_prefix, section_label, unit_singular, unit_one, unit_two, unit_few, unit_many), tracks(id, name, material_url)",
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
  const track = participant.tracks as unknown as { id: string; name: string; material_url: string | null } | null;
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
  if (!participant.track_id || !track) return bail("لم يُحدَّد مسارك", "تواصل مع إدارة البرنامج ليُحدَّد مسارك، وبعدها تظهر خطتك هنا.");
  if (!followsPlan(participant.status)) return bail("انتهت رحلتك في هذا البرنامج", "سجلّك محفوظ. تابع إعلانات الجمعية للدورة القادمة.");

  // الحال أولاً — قراءتها تسوّي ما مضى، فالتعثّر في الخطة بعدها كاملٌ إلى الآن (م٣).
  const stateResult = await db.rpc("fn_journey_state", { p_participant_id: participantId });
  if (stateResult.error) return <ErrorState body="تعذّر جلب حالك في الخطة." />;
  let state: JourneyState | null;
  try {
    state = parseJourneyState(stateResult.data);
  } catch {
    return <ErrorState body="تعذّر جلب حالك في الخطة." />;
  }
  if (!state) return bail("لا خطة لمسارك", "خطة مسارك ليست جاهزة.");

  const [planResult, milestonesResult, rangesResult, sectionsResult] = await Promise.all([
    db.rpc("fn_my_plan", { p_participant_id: participantId }),
    db.rpc("fn_my_milestones", { p_participant_id: participantId }),
    db
      .from("track_content_ranges")
      .select("from_sequence, to_sequence, sort_order")
      .eq("track_id", track.id)
      .is("deleted_at", null),
    db
      .from("material_sections")
      .select("id, name, unit_count")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (planResult.error) return <ErrorState body="تعذّر جلب خطتك." />;
  if (rangesResult.error || sectionsResult.error) return <ErrorState body="تعذّر جلب مادة مسارك." />;
  let days: PlanDay[];
  try {
    days = parsePlan(planResult.data ?? []);
  } catch {
    return <ErrorState body="تعذّر جلب خطتك." />;
  }

  const share: TrackShare = {
    id: track.id,
    name: track.name,
    ranges: (rangesResult.data ?? []).map((r) => ({ from: r.from_sequence, to: r.to_sequence, sortOrder: r.sort_order })),
  };
  const material: Material = {
    forms: {
      sectionLabel: program.section_label,
      singular: program.unit_singular,
      one: program.unit_one,
      two: program.unit_two,
      few: program.unit_few,
      many: program.unit_many,
    },
    sections: withStarts(sectionsResult.data ?? []),
  };

  const s = state;
  const statusOf = (d: PlanDay): DayStatus => dayStatus(d, s);
  // المحطات ميزةٌ ثانوية: تعذّرها يُخفيها ولا يُسقط الخطة.
  const milestones = (milestonesResult.data ?? []).map((m) => ({
    examId: m.exam_id,
    name: m.name,
    at: m.at,
    location: m.location,
    oral: m.exam_type === "oral",
  }));
  const weeks = planWeeks(days, statusOf, filter, milestones, { today: state.today, dueDays: state.dueDays });
  const p = pace(state);
  const base = `/journey/${participantId}/plan`;

  return (
    <div className={styles.page}>
      <section className={styles.summary} aria-label="ملخص الخطة">
        <div className={styles.summaryTop}>
          <h1 className={styles.title}>خطة {track.name}</h1>
          <span className={`${styles.pace} ${p.tone === "behind" ? styles.paceBehind : ""}`}>{state.stage === "not_started" ? `يبدأ ${shortDate(state.startDate)}` : p.text}</span>
        </div>
        <p className={styles.muted}>
          {daysText(state.dayCount)} · {program.name}
        </p>
        <span className={styles.bar} aria-hidden>
          <i style={{ inlineSize: `${Math.min(100, Math.max(0, state.progressPct))}%` }} />
        </span>
        <p className={styles.foot}>
          <span>أتممت {daysText(state.doneDays)}</span>
          <span>{formatPercent(state.progressPct / 100)}</span>
        </p>
        {/* كتاب المادة مرجعُ الخطة كلها لا يومٍ بعينه — موضعه الثابت هنا (قرار الراعي ٢٧ أكتوبر). */}
        {track.material_url ? (
          <a href={track.material_url} target="_blank" rel="noopener noreferrer" className={styles.material}>
            <BookOpen size={18} aria-hidden />
            <span>كتاب المادة (PDF)</span>
            <ExternalLink size={14} aria-hidden />
          </a>
        ) : null}
      </section>

      <div role="group" className={styles.filters} aria-label="عرض الأيام">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? base : `${base}?show=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={styles.filter}
            replace
            scroll={false}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {weeks.length === 0 ? (
        <p className={styles.empty}>{filter === "late"
            ? "لا أيام متأخرة — بارك الله فيك."
            : state.stage === "finished"
              ? "أتممت الخطة كلها — بارك الله فيك."
              : "لا أيام هنا."}</p>
      ) : (
        weeks.map((w) => (
          <section key={w.index} className={styles.week} aria-label={`الأسبوع ${formatNumber(w.index)}`}>
            <h2 className={styles.weekHead}>
              الأسبوع {formatNumber(w.index)}
              <span>
                {w.from && w.to ? `${shortDate(w.from)} – ${shortDate(w.to)} · ` : ""}
                {formatNumber(w.done)} من {formatNumber(w.total)}
              </span>
            </h2>
            <ul className={styles.days}>
              {w.items.map((item) =>
                item.kind === "milestone" ? (
                  <li key={`m-${item.milestone.examId}-${item.milestone.at}`} className={styles.milestone}>
                    <span className={styles.dot}>
                      <Flag size={16} aria-hidden />
                    </span>
                    <span className={styles.text}>
                      <b>{item.milestone.name}</b>
                      <span>
                        {formatDateTime(item.milestone.at)}
                        {item.milestone.oral && item.milestone.location ? ` · ${item.milestone.location}` : ""}
                      </span>
                    </span>
                  </li>
                ) : (
                  <li key={item.day.day}>
                    <DayRow
                      participantId={participantId}
                      day={item.day}
                      status={item.status}
                      summary={daySummary(item.day, share, material)}
                      lines={item.day.tasks.map((t) => ({
                        id: t.fieldId,
                        label: t.label,
                        text: taskLines(t, share, material).join("، "),
                        rep: repetitionText(t),
                      }))}
                      visible={s.stage !== "not_started" && item.day.day <= lastVisibleDay(s)}
                    />
                  </li>
                ),
              )}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function DayRow({
  participantId,
  day,
  status,
  summary,
  lines,
  visible,
}: {
  participantId: string;
  day: PlanDay;
  status: DayStatus;
  summary: string;
  lines: { id: string; label: string; text: string; rep: string | null }[];
  /** يومٌ تفتحه شاشة اليوم (مضى أو حاضر) — وما بعده يتوسّع هنا للاطلاع. */
  visible: boolean;
}) {
  const date = shownDate(day);
  const finished = status === "done" || status === "recovered" || status === "credited";
  const head = (
    <>
      <span className={`${styles.dot} ${styles[status] ?? ""}`}>{finished ? <Check size={15} aria-hidden /> : formatNumber(day.day)}</span>
      <span className={styles.text}>
        <b>اليوم {formatNumber(day.day)}</b>
        <span>{summary}</span>
      </span>
      <span className={styles.state}>
        {status === "ahead" && date ? `${shortDate(date)}${day.expected ? " · متوقَّع" : ""}` : STATUS_LABEL[status]}
      </span>
    </>
  );
  if (visible) {
    return (
      <Link
        href={status === "now" ? `/journey/${participantId}` : `/journey/${participantId}?day=${day.day}`}
        className={`${styles.row} ${status === "now" ? styles.rowNow : ""}`}
      >
        {head}
      </Link>
    );
  }
  return (
    <details className={styles.row}>
      <summary className={styles.rowHead}>
        {head}
        <ChevronDown size={16} aria-hidden className={styles.chev} />
      </summary>
      <ul className={styles.lines}>
        {lines.map((l) => (
          <li key={l.id}>
            <b>{l.label}</b> {l.text}
            {l.rep ? <span className={styles.rep}> · {l.rep}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
