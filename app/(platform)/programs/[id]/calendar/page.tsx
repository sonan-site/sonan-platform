import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { now, toDateInput } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import type { EngineValues, TrackOverrides } from "@/lib/programs/engine-settings";
import { composeSchedule } from "@/lib/programs/schedule";
import { CalendarView, type TrackSettings } from "./calendar-view";
import { ScheduleSection } from "./schedule-section";

/**
 * التقويم وقواعد التقدّم (`adr/0038`): على البرنامج، ومخصّصةً لأي مسار.
 * `?scope=<مسار>` يفتح المسار، وبلا نطاق: البرنامج.
 */
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { id } = await params;
  const { scope } = await searchParams;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [programResult, tracksResult, exceptionsResult, deadlinesResult, scheduleResult] = await Promise.all([
    db
      .from("programs")
      .select(
        "id, start_date, work_days, daily_limit, credit_enabled, compensation_enabled, progress_measure, registration_opens_at, registration_closes_at",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    db
      .from("tracks")
      .select(
        "id, name, start_date, start_date_overridden, work_days, daily_limit, credit_enabled, compensation_enabled, progress_measure, exceptions_overridden",
      )
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
    db.from("calendar_exceptions").select("track_id, off_date").eq("program_id", id).is("deleted_at", null),
    db
      .from("deadline_history")
      .select("track_id, effective_from, deadline")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("effective_from"),
    db
      .from("program_schedule")
      .select("id, title, starts_on, ends_on, note")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("starts_on"),
  ]);

  if (
    programResult.error ||
    tracksResult.error ||
    exceptionsResult.error ||
    deadlinesResult.error ||
    scheduleResult.error
  ) {
    return <ErrorState body="تعذّر جلب الإعدادات." />;
  }
  if (!programResult.data) notFound();
  const p = programResult.data;

  const exceptionsFor = (trackId: string | null) =>
    (exceptionsResult.data ?? [])
      .filter((e) => e.track_id === trackId)
      .map((e) => e.off_date)
      .sort();
  const deadlinesFor = (trackId: string | null) =>
    (deadlinesResult.data ?? [])
      .filter((d) => d.track_id === trackId)
      .map((d) => ({ from: d.effective_from, time: d.deadline.slice(0, 5) }));

  const program: EngineValues = {
    startDate: p.start_date,
    workDays: p.work_days,
    exceptions: exceptionsFor(null),
    deadlines: deadlinesFor(null),
    dailyLimit: p.daily_limit,
    creditEnabled: p.credit_enabled,
    compensationEnabled: p.compensation_enabled,
    progressMeasure: p.progress_measure,
  };

  const tracks: TrackSettings[] = (tracksResult.data ?? []).map((t) => {
    const deadlines = deadlinesFor(t.id);
    const overrides: TrackOverrides = {
      start_date: t.start_date_overridden,
      work_days: t.work_days !== null,
      exceptions: t.exceptions_overridden,
      deadline: deadlines.length > 0,
      daily_limit: t.daily_limit !== null,
      credit_enabled: t.credit_enabled !== null,
      compensation_enabled: t.compensation_enabled !== null,
      progress_measure: t.progress_measure !== null,
    };
    return {
      id: t.id,
      name: t.name,
      overrides,
      values: {
        startDate: t.start_date,
        workDays: t.work_days ?? program.workDays,
        exceptions: exceptionsFor(t.id),
        deadlines,
        dailyLimit: t.daily_limit ?? program.dailyLimit,
        creditEnabled: t.credit_enabled ?? program.creditEnabled,
        compensationEnabled: t.compensation_enabled ?? program.compensationEnabled,
        progressMeasure: t.progress_measure ?? program.progressMeasure,
      },
    };
  });

  const current = tracks.find((t) => t.id === scope) ?? null;

  const today = toDateInput(now());
  // المواعيد للبرنامج كله — لا تُخصَّص لمسار، فتُعرض في نطاق البرنامج وحده.
  const schedule = composeSchedule(
    (scheduleResult.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      note: r.note,
    })),
    { opensAt: p.registration_opens_at, closesAt: p.registration_closes_at },
  );

  return (
    <>
      <CalendarView programId={id} today={today} program={program} tracks={tracks} current={current} />
      {current ? null : <ScheduleSection programId={id} today={today} entries={schedule} />}
    </>
  );
}
