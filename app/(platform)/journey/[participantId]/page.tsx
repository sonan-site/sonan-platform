import { formatRegistrationNo } from "@/lib/programs/registration";
import { notFound } from "next/navigation";
import { JourneyBail } from "@/components/shared/journey-bail";
import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { now, toDateInput, toTimeInput } from "@/lib/format";
import {
  canMark,
  canUndo,
  defaultDay,
  followsPlan,
  lastViewableDay,
  lastVisibleDay,
  pace,
  parseJourneyState,
  resolveDay,
  type JourneyState,
} from "@/lib/participants/journey";
import { countedText, spanParts, type TrackShare } from "@/lib/plans/engine";
import { withStarts, type Material } from "@/lib/programs/material";
import { weekRange, weekStrip } from "@/lib/participants/progress-view";
import { EligibilityCard, FinalCard, toEligibility, toFinals } from "./final-card";
import { JourneyView, type ArchiveRow, type TaskRow } from "./journey-view";

export default async function JourneyDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ participantId: string }>;
  searchParams: Promise<{ day?: string; joined?: string }>;
}) {
  const { participantId } = await params;
  const { day, joined } = await searchParams;

  const session = await getSession();
  if (session.status !== "active") {
    return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترى رحلتك." />;
  }

  const db = await createClient();

  // المشاركة للمستخدم نفسه أو لا شيء. دوالّ المحرّك تحرس نفسها كذلك، لكن
  // الصفحة لا تُظهر عنواناً لمشاركةٍ لا تخصّه ثم تفشل في محتواها.
  const { data: participant, error: participantError } = await db
    .from("participants")
    .select(
      "id, status, track_id, registration_no, programs!inner(id, name, slug, contact, registration_prefix, section_label, unit_singular, unit_one, unit_two, unit_few, unit_many), tracks(id, name)",
    )
    .eq("id", participantId)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (participantError) return <ErrorState body="تعذّر جلب مشاركتك." />;
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
  // «رحلتي» تُدخل صاحب المشاركة الواحدة إلى هنا مباشرة — فرابطها في المخرج يدور به (ر١).
  const { count: participations } = await db
    .from("participants")
    // بالربط نفسه الذي تعدّ به «رحلتي» — فلا يختلف العددان فيدور الرابط (المراجعة ١).
    .select("id, programs!inner(id)", { count: "exact", head: true })
    .eq("user_id", session.userId)
    .is("deleted_at", null);
  const bail = (title: string, body: string) => (
    <JourneyBail
      title={title}
      body={body}
      programName={program.name}
      programSlug={program.slug}
      contact={program.contact}
      registrationNo={formatRegistrationNo(program.registration_prefix, participant.registration_no)}
      listLink={(participations ?? 0) > 1}
    />
  );

  if (!participant.track_id || !track) {
    return bail("لم يُحدَّد مسارك", "تواصل مع إدارة البرنامج ليُحدَّد مسارك، وبعدها يظهر واجبك هنا.");
  }
  // من انتهت رحلته لا يُرصد له شيء، فيُقال له ذلك — لا «تواصل مع الإدارة» لمن أنهى البرنامج.
  // النهائي: تأهّله وجلسته، ونتيجته بعد نشرها (الدفعة د). تعذّره يُخفي بطاقته ولا يُسقط الصفحة.
  const finalResult = await db.rpc("fn_my_final", { p_participant_id: participantId });
  const finals = toFinals(finalResult.data ?? []);
  // حالة التأهل بين لحظة الأهلية وحسم الفرز (خطة دليل المشارك · هـ) — تعذّرها يُخفيها كذلك.
  const eligibilityResult = await db.rpc("fn_my_eligibility", { p_participant_id: participantId });
  const eligibility = toEligibility(eligibilityResult.data ?? []);

  // من انتهت رحلته يرى نتيجته أولاً — ثم المخرج.
  if (!followsPlan(participant.status)) {
    return (
      <>
        {eligibility.map((e) => (
          <EligibilityCard key={e.examId} eligibility={e} />
        ))}
        {finals.map((f) => (
          <FinalCard key={f.examId} final={f} />
        ))}
        {bail("انتهت رحلتك في هذا البرنامج", "سجلّك محفوظ. تابع إعلانات الجمعية للدورة القادمة.")}
      </>
    );
  }

  // ══ الحال — وقراءتها تسوّي ما مضى أولاً، فالأرشيف بعدها كاملٌ إلى الآن (adr/0041) ══
  const stateResult = await db.rpc("fn_journey_state", { p_participant_id: participantId });
  if (stateResult.error) return <ErrorState body="تعذّر جلب حالك في الخطة." />;
  let state: JourneyState | null;
  try {
    state = parseJourneyState(stateResult.data);
  } catch {
    return <ErrorState body="تعذّر جلب حالك في الخطة." />;
  }
  if (!state) return bail("لا خطة لمسارك", "خطة مسارك ليست جاهزة.");

  const requested = day && /^\d+$/.test(day) ? Number(day) : null;
  const shown = resolveDay(state, requested);

  const week = weekRange(state.today);
  const [tasksResult, rangesResult, sectionsResult, archiveResult, recordResult, examsResult, calendarResult] = await Promise.all([
    db.rpc("fn_day_tasks", { p_participant_id: participantId, p_day: shown }),
    db
      .from("track_content_ranges")
      .select("from_sequence, to_sequence, sort_order")
      .eq("track_id", state.trackId)
      .is("deleted_at", null),
    db
      .from("material_sections")
      .select("id, name, unit_count")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    db
      .from("commitment_archive")
      .select("id, plan_id, calendar_date, status, plan_day, completed_days, compensated_at")
      .eq("participant_id", participantId)
      // سجلّ مساره الحالي — وبه تُعدّ أيام تعثّره فوقه، فلا يختلف العدّ عن القائمة.
      .eq("track_id", state.trackId)
      .is("deleted_at", null)
      .order("calendar_date", { ascending: false })
      .limit(400),
    // أيامه في مساراتٍ قبل هذا — تبقى ظاهرة بعد نقله (adr/0027).
    db.rpc("fn_participant_record", { p_participant_id: participantId }),
    // اختباراته عن بعد بموانعها (adr/0048) — من الدالة التي يرفض بها البدء.
    db.rpc("fn_my_exams", { p_participant_id: participantId }),
    // أيام الأسبوع وراحته لشريط الأسبوع (المرحلة ب · ب١) — تعذّره يُخفي الشريط وحده.
    db.rpc("fn_my_calendar", { p_participant_id: participantId, p_from: week.from, p_to: week.to }),
  ]);

  // **لا استعلام يبتلع خطأه.** نصيبٌ فارغ يجعل كل نطاقٍ «بعد آخر نصيب المسار».
  if (tasksResult.error) return <ErrorState body="تعذّر جلب واجب اليوم." />;
  if (rangesResult.error || sectionsResult.error) return <ErrorState body="تعذّر جلب مادة مسارك." />;
  if (archiveResult.error || recordResult.error) return <ErrorState body="تعذّر جلب سجلّ التزامك." />;
  const priorDays = (recordResult.data ?? []).filter((r) => !r.is_current).reduce((sum, r) => sum + r.done_days, 0);

  const share: TrackShare = {
    id: state.trackId,
    name: track.name,
    ranges: (rangesResult.data ?? []).map((r) => ({ from: r.from_sequence, to: r.to_sequence, sortOrder: r.sort_order })),
  };
  // المادة المقسّمة تُعرض بالباب ورقمه فيه (adr/0039)، وغيرها بالأرقام.
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

  const rawTasks = tasksResult.data ?? [];
  const spans = rawTasks.map((t) =>
    t.kind === "counted"
      ? [{ text: countedText(t.value, t.count_unit), from: null, to: null }]
      : t.kind === "explicit" && t.is_material_linked && (t.ord_from === null || t.ord_to === null)
        ? [{ text: "خارج نصيب مسارك", from: null, to: null }]
        : spanParts(t.is_material_linked, share, material, t.ord_from, t.ord_to),
  );

  // أوائل الوحدات («إنما الأعمال بالنيات…») لطرفَي كل مقطع — إن كُتبت.
  const needed = new Set<number>();
  for (const parts of spans) {
    for (const p of parts) {
      if (p.from !== null) needed.add(p.from);
      if (p.to !== null) needed.add(p.to);
    }
  }
  const labels = new Map<number, string>();
  if (needed.size > 0) {
    const { data: units } = await db
      .from("content_units")
      .select("sequence, label")
      .eq("program_id", program.id)
      .in("sequence", [...needed])
      .is("deleted_at", null);
    for (const unit of units ?? []) if (unit.label) labels.set(unit.sequence, unit.label);
  }

  const clock = toTimeInput(now());
  const s = state;
  const tasks: TaskRow[] = rawTasks.map((t, i) => ({
    fieldId: t.task_field_id,
    label: t.label,
    isRequired: t.is_required,
    lines: (spans[i] ?? []).map((p) => ({
      text: p.text,
      fromLabel: p.from !== null ? (labels.get(p.from) ?? null) : null,
      toLabel: p.to !== null && p.to !== p.from ? (labels.get(p.to) ?? null) : null,
    })),
    repetition: t.repetition,
    count: t.count,
    markedAt: t.marked_at,
    undoable: t.marked_at !== null && canUndo(s, shown, toDateInput(t.marked_at), clock),
  }));

  const archive: ArchiveRow[] = (archiveResult.data ?? []).map((a) => ({
    id: a.id,
    date: a.calendar_date,
    status: a.status,
    planDay: a.plan_day,
    completedDays: a.completed_days,
    compensated: a.compensated_at !== null,
  }));

  // الشريط من أرشيف **خطته** وحدها — فلا يفتح يوماً من خطةٍ سابقة (مراجعة الخطة ر٤). والقائمة
  // بالمسار كما كانت، فيبقى عدّ التعثّر فوقها مطابقاً لما تعدّه الحال.
  const strip = calendarResult.error
    ? null
    : weekStrip({
        calendar: (calendarResult.data ?? []).map((c) => ({ date: c.calendar_date, isProgramDay: c.is_program_day })),
        archive: (archiveResult.data ?? [])
          .filter((a) => a.plan_id === s.planId)
          .map((a) => ({
            date: a.calendar_date,
            status: a.status,
            compensated: a.compensated_at !== null,
            planDay: a.plan_day,
            completedDays: a.completed_days ?? [],
          })),
        today: state.today,
        // «قبل بدايتك» حتى يومه الأول في الحكم — لا بداية البرنامج (مراجعة ش١ ١).
        startDate: state.judgeStart,
        completedToday: state.completedToday,
        lastVisible: lastVisibleDay(state),
      });

  return (
    <JourneyView
      week={strip}
      todayDay={defaultDay(s)}
      participantId={participantId}
      justJoined={joined === "1"}
      registrationNo={formatRegistrationNo(program.registration_prefix, participant.registration_no)}
      programName={program.name}
      trackName={track.name}
      state={state}
      pace={pace(state)}
      day={shown}
      lastDay={lastVisibleDay(state)}
      maxDay={lastViewableDay(state)}
      markable={canMark(state, shown, clock)}
      tasks={tasks}
      archive={archive}
      priorDays={priorDays}
      // الاختبار ميزةٌ ثانوية في يوم الحفظ: تعذّرها يُخفي بطاقتها ولا يُسقط الرحلة.
      examsUnavailable={examsResult.error !== null}
      finals={finals}
      eligibility={eligibility}
      serverClock={clock}
      exams={(examsResult.data ?? []).map((e) => ({
        id: e.exam_id,
        name: e.name,
        opensAt: e.opens_at,
        closesAt: e.closes_at,
        attempts: e.attempts,
        maxAttempts: e.max_attempts,
        bestPercent: e.best_percent === null ? null : Number(e.best_percent),
        passed: e.passed,
        open: e.open_attempt_id !== null,
        blocker: e.blockers?.[0] ?? null,
      }))}
    />
  );
}
