import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { canSubmit, journeyProgress, neighbours, resolveDayNumber } from "@/lib/participants/journey";
import type { JourneyDay } from "@/lib/participants/journey";
import { JourneyView, type SpanPart, type TaskRow } from "./journey-view";

/** الحالات التي تتبع الخطة — مطابقة لـ`fn_follows_plan` في القاعدة. */
const FOLLOWS_PLAN = new Set(["registered", "memorizing", "qualified"]);

export default async function JourneyDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ participantId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { participantId } = await params;
  const { day } = await searchParams;

  const session = await getSession();
  if (session.status !== "active") {
    return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترى رحلتك." />;
  }

  const db = await createClient();

  // المشاركة للمستخدم نفسه أو لا شيء. `fn_plan_day_tasks` تحرس نفسها كذلك،
  // لكن الصفحة لا تُظهر عنواناً لمشاركةٍ لا تخصّه ثم تفشل في محتواها.
  const { data: participant, error: participantError } = await db
    .from("participants")
    .select("id, status, track_id, programs!inner(id, name), tracks(id, name)")
    .eq("id", participantId)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (participantError) return <ErrorState body="تعذّر جلب مشاركتك." />;
  if (!participant) notFound();

  const program = participant.programs as unknown as { id: string; name: string };
  const track = participant.tracks as unknown as { id: string; name: string } | null;

  if (!participant.track_id || !track) {
    return (
      <EmptyState
        kind="no-data"
        title="لم يُسنَد لك مسار بعد"
        body="الإدارة تُسنِد المسار بعد قبول التسجيل. يظهر واجبك هنا حين يُسنَد."
      />
    );
  }

  // من انتهت رحلته لا خطة تُقرأ له (`fn_follows_plan` تحصر السياسة)، فيُقال
  // له ذلك — لا «الخطة تُبنى قبل الانطلاق، عُد لاحقاً» لمن أنهى البرنامج.
  if (!FOLLOWS_PLAN.has(participant.status)) {
    return (
      <EmptyState
        kind="no-data"
        title="انتهت رحلتك في هذا البرنامج"
        body="سجلّك محفوظ. تابع إعلانات الجمعية للدورة القادمة."
      />
    );
  }

  const { data: plan, error: planError } = await db
    .from("plans")
    .select("id, name")
    .eq("track_id", participant.track_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (planError) return <ErrorState body="تعذّر جلب خطة مسارك." />;
  if (!plan) {
    return (
      <EmptyState
        kind="no-data"
        title="لا خطة لمسارك بعد"
        body="الخطة تُبنى قبل انطلاق البرنامج. عُد لاحقاً."
      />
    );
  }

  const [daysResult, doneResult, templateFieldsResult] = await Promise.all([
    db
      .from("plan_days")
      .select("id, day_number, day_type, day_template_id")
      .eq("plan_id", plan.id)
      .is("deleted_at", null)
      .order("day_number"),
    db
      .from("achievements")
      .select("plan_day_id")
      .eq("participant_id", participantId)
      .is("deleted_at", null),
    // القوالب التي لها حقل واحد على الأقل. قالبٌ بلا حقول ينتج يوماً لا يُرسَل،
    // ولو عُدّ يوم عمل لعلق المشارك عنده إلى الأبد.
    db
      .from("day_template_fields")
      .select("day_template_id")
      .is("deleted_at", null),
  ]);

  // **لا استعلام يبتلع خطأه.** فشل استعلام الإنجاز يجعل كل الأيام تبدو غير
  // مُرسَلة، فيُعرَض اليوم الأول قابلاً للإرسال ويُصدَم المشارك بـ«أُرسل سلفاً».
  if (daysResult.error || doneResult.error || templateFieldsResult.error) {
    return <ErrorState body="تعذّر جلب أيام الخطة." />;
  }

  const submittedDays = new Set((doneResult.data ?? []).map((a) => a.plan_day_id));
  const templatesWithFields = new Set(
    (templateFieldsResult.data ?? []).map((f) => f.day_template_id),
  );
  const days: JourneyDay[] = (daysResult.data ?? []).map((d) => ({
    id: d.id,
    dayNumber: d.day_number,
    dayType: d.day_type,
    submitted: submittedDays.has(d.id),
    hasWork: d.day_type === "normal" && templatesWithFields.has(d.day_template_id ?? ""),
  }));

  const requested = day && /^\d+$/.test(day) ? Number(day) : null;
  const shown = resolveDayNumber(days, requested);

  if (shown === null) {
    return (
      <EmptyState kind="no-data" title="الخطة بلا أيام" body="لم تُبنَ أيام خطة مسارك بعد." />
    );
  }

  const current = days.find((d) => d.dayNumber === shown)!;

  // ══ واجب اليوم — من الدالة وحدها ══
  const [tasksResult, unitCountResult] = await Promise.all([
    db.rpc("fn_plan_day_tasks", {
      p_participant_id: participantId,
      p_plan_day_id: current.id,
    }),
    db.rpc("fn_track_unit_count", { p_track_id: participant.track_id }),
  ]);

  if (tasksResult.error) return <ErrorState body="تعذّر جلب واجب اليوم." />;

  const rawTasks = tasksResult.data ?? [];
  // يفرّق «مسارٌ بلا مقاطع بعد» عن «أتممتَ مادة مسارك» — والعلامة واحدة فيهما.
  const trackHasContent = (unitCountResult.data ?? 0) > 0;

  // ══ المقاطع ونصوصها ══
  // النطاق العابر لفجوة يُعرَض مقطعين: «من ٤٠ إلى ٤٠، ومن ٨١ إلى ٨٢».
  // و«من ٤٠ إلى ٨٢» كذبٌ — بينهما أبوابٌ ليست من مساره (adr/0021).
  const spansByField = new Map<string, SpanPart[]>();
  const neededSequences = new Set<number>();

  await Promise.all(
    rawTasks.map(async (task) => {
      if (task.ordinal_start === null || task.ordinal_end === null) return;
      const { data: parts, error } = await db.rpc("fn_track_ordinal_span", {
        p_track_id: participant.track_id!,
        p_from: task.ordinal_start,
        p_to: task.ordinal_end,
      });
      if (error) throw new Error("تعذّر حساب نطاق الواجب.");
      const span = (parts ?? []).map((p) => ({
        from: p.from_sequence,
        to: p.to_sequence,
        fromLabel: "",
        toLabel: "",
      }));
      for (const p of span) {
        neededSequences.add(p.from);
        neededSequences.add(p.to);
      }
      spansByField.set(task.task_field_id, span);
    }),
  );

  const labels = new Map<number, string>();
  if (neededSequences.size > 0) {
    const { data: units } = await db
      .from("content_units")
      .select("sequence, label")
      .eq("program_id", program.id)
      .in("sequence", [...neededSequences])
      .is("deleted_at", null);
    for (const unit of units ?? []) labels.set(unit.sequence, unit.label);
  }

  const tasks: TaskRow[] = rawTasks.map((task) => ({
    fieldId: task.task_field_id,
    label: task.label,
    kind: task.kind,
    amount: Number(task.amount ?? 0),
    isDone: task.is_done,
    exhausted: task.kind === "ranged" && task.ordinal_start === null && trackHasContent,
    trackEmpty: task.kind === "ranged" && !trackHasContent,
    span: (spansByField.get(task.task_field_id) ?? []).map((p) => ({
      ...p,
      fromLabel: labels.get(p.from) ?? "",
      toLabel: labels.get(p.to) ?? "",
    })),
  }));

  let examName: string | null = null;
  if (current.dayType === "exam") {
    const { data: dayRow } = await db
      .from("plan_days")
      .select("exams(name)")
      .eq("id", current.id)
      .maybeSingle();
    const exam = dayRow?.exams as unknown as { name: string } | null;
    examName = exam?.name ?? "اختبار";
  }

  return (
    <JourneyView
      participantId={participantId}
      programName={program.name}
      trackName={track.name}
      planName={plan.name}
      day={current}
      totalDays={days.length}
      tasks={tasks}
      examName={examName}
      submittable={canSubmit(days, shown) && trackHasContent}
      progress={journeyProgress(days)}
      {...neighbours(days, shown)}
    />
  );
}
