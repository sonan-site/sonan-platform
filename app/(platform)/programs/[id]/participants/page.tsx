import { formatRegistrationNo } from "@/lib/programs/registration";
import { notFound, redirect } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/components/shared/data-table";
import { hrefWith, type FilterLink, type SearchParams } from "@/components/shared/filter-links";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { followsPlan } from "@/lib/participants/journey";
import { applyRosterQuery, NO_TRACK, parseRosterQuery } from "@/lib/participants/roster-query";
import { authorizeRequest } from "@/lib/permissions/server";
import { PARTICIPANT_STATUS_LABEL, statusesOf } from "@/lib/programs/kinds";
import {
  ParticipantsView,
  type ChangeRow,
  type ParticipantRow,
} from "./participants-view";

/** سقف `fn_program_participants` للطلب الواحد — فتُجلب القائمة دفعاتٍ بعددها الكلّي. */
const ROSTER_BATCH = 500;

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * المشاركون كلهم دفعاتٍ: كانت دفعةً واحدة بسقف ٥٠٠ تُقصّ بصمت، والبرنامج يتّسع لأكثر (دَين `د-١٥`).
 * والقائمة كلها لازمة: نموذج طلب تغيير المسار يختار منها، والتصفية والفرز عليها.
 */
async function fetchRoster(db: Db, programId: string) {
  const { data: first, error } = await db.rpc("fn_program_participants", {
    p_program_id: programId,
    p_limit: ROSTER_BATCH,
    p_offset: 0,
  });
  if (error) return { data: null, error };
  const all = [...(first ?? [])];
  const total = Number(first?.[0]?.total ?? 0);
  while (all.length < total) {
    const { data, error: more } = await db.rpc("fn_program_participants", {
      p_program_id: programId,
      p_limit: ROSTER_BATCH,
      p_offset: all.length,
    });
    if (more) return { data: null, error: more };
    if (!data?.length) break;
    all.push(...data);
  }
  return { data: all, error: null };
}

export default async function ParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const authz = await authorizeRequest({
    permission: "participants.read",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (
    await authorizeRequest({
      permission: "participants.write",
      programId: id,
      resourceProgramId: id,
    })
  ).ok;

  // جاهزية المسار الهدف (خطة ومادة) تُقرأ بصلاحية البرامج. بدونها لا تنبيه —
  // لا «بلا خطة» كاذبة لمن لا يرى الخطط أصلاً.
  const canReadPrograms = (
    await authorizeRequest({ permission: "programs.read", programId: id, resourceProgramId: id })
  ).ok;

  const db = await createClient();
  // المشاركون صفّاً لكل واحد، بأسمائهم وأيامهم وموعدهم وتعثّرهم، محسوبين في القاعدة (الهجرة ٠٦٧).
  // كانت الشاشة تجلب إنجاز البرنامج كله فتبلغ سقف الألف صفّ بعد ثمانين مشاركاً.
  const [programResult, participantsResult, tracksResult, requestsResult, plansResult, rangesResult] =
    await Promise.all([
    db.from("programs").select("id, name, kind, registration_prefix").eq("id", id).is("deleted_at", null).maybeSingle(),
    fetchRoster(db, id),
    // المؤرشَفة معها: طلبٌ قديم إلى مسارٍ أُرشف يبقى باسمه لا «—».
    db
      .from("tracks")
      .select("id, name, deleted_at")
      .eq("program_id", id)
      .order("sort_order"),
    db
      .from("track_change_requests")
      .select(
        "id, participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage, status, participants!inner(program_id)",
      )
      .eq("participants.program_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    canReadPrograms
      ? db.from("plans").select("track_id, day_count").eq("program_id", id).is("deleted_at", null)
      : Promise.resolve({ data: null }),
    canReadPrograms
      ? db
          .from("track_content_ranges")
          .select("track_id, tracks!inner(program_id)")
          .eq("tracks.program_id", id)
          .is("deleted_at", null)
      : Promise.resolve({ data: null }),
  ]);

  if (programResult.error || participantsResult.error) {
    return <ErrorState body="تعذّر جلب المشاركين." />;
  }
  if (!programResult.data) notFound();

  const allTracks = tracksResult.data ?? [];
  const trackName = new Map(allTracks.map((t) => [t.id, t.name]));
  // الخطة الافتراضية (بلا مسار) تكفي كل مسار، والمخصّصة لمسارها (adr/0038) — وخطةٌ بلا أيام لا تُعَدّ.
  const livePlans = (plansResult.data ?? []).filter((r) => r.day_count > 0);
  const hasDefaultPlan = livePlans.some((r) => r.track_id === null);
  const withPlan = plansResult.data ? new Set(livePlans.map((r) => r.track_id)) : null;
  const withContent = rangesResult.data ? new Set(rangesResult.data.map((r) => r.track_id)) : null;

  const participants: ParticipantRow[] = (participantsResult.data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name ?? "مشارك محذوف",
    registrationNo: formatRegistrationNo(programResult.data?.registration_prefix ?? null, p.registration_no),
    trackId: p.track_id,
    trackName: p.track_id ? (trackName.get(p.track_id) ?? "—") : "بلا مسار",
    hasTrack: p.track_id !== null,
    status: p.status,
    joinedAt: p.joined_at,
    baseline: p.baseline_percentage === null ? null : Number(p.baseline_percentage),
    dayCount: p.day_count,
    doneDays: p.done_days,
    dueDays: p.due_days,
    stumbledDays: p.stumbled_days,
    compensatedDays: p.compensated_days,
    priorDoneDays: p.prior_done_days,
    creditedDays: p.credited_days,
    followsPlan: followsPlan(p.status),
  }));

  const nameByParticipant = new Map(participants.map((p) => [p.id, p.name]));

  // المحتسب داخلٌ في المتمّ ومصدره أيامه في المسار السابق — فلا يُعدّ مرتين في السجلّ.
  const recordDays = new Map(participants.map((p) => [p.id, p.doneDays - p.creditedDays + p.priorDoneDays]));

  // ما يُحمل لكل طلبٍ معلَّق لو قُبل الآن (ش٢) — لمن يقرأ المشاركين، والطلبات المعلَّقة قليلة.
  const pending = (requestsResult.data ?? []).filter((r) => r.status === "pending");
  const previews = new Map(
    await Promise.all(
      pending.map(async (r) => {
        const { data } = await db.rpc("fn_track_change_carry_preview", { p_request_id: r.id });
        const row = data?.[0];
        return [r.id, row?.carry ? { units: row.credited_units, days: row.credited_days, dayCount: row.day_count } : null] as const;
      }),
    ),
  );
  const approved = (requestsResult.data ?? []).filter((r) => r.status === "approved");

  const requests: ChangeRow[] = (requestsResult.data ?? [])
    .map((r) => ({
      id: r.id,
      participantName: nameByParticipant.get(r.participant_id) ?? "—",
      fromTrack: trackName.get(r.from_track_id) ?? "—",
      toTrack: trackName.get(r.to_track_id) ?? "—",
      direction: r.direction,
      reason: r.reason,
      baseline: Number(r.baseline_percentage),
      status: r.status,
      recordDays: recordDays.get(r.participant_id) ?? 0,
      // عاد إلى مسارٍ خرج منه سابقاً: يُكمل من حيث توقّف، لا من أوله.
      returning: approved.some(
        (a) => a.participant_id === r.participant_id && a.from_track_id === r.to_track_id,
      ),
      targetHasPlan: withPlan ? hasDefaultPlan || withPlan.has(r.to_track_id) : null,
      targetHasContent: withContent ? withContent.has(r.to_track_id) : null,
      carry: previews.get(r.id) ?? null,
    }));

  // البحث والتصفية والفرز والصفحة من الرابط (`ق-٢٠`) — على القائمة كاملة.
  const path = `/programs/${id}/participants`;
  const statuses = statusesOf(programResult.data.kind);
  const query = parseRosterQuery(sp, statuses);
  const { rows, total } = applyRosterQuery(participants, query, DEFAULT_PAGE_SIZE);
  // صفحةٌ بعد آخر النتائج (رابطٌ محفوظ ثم تغيّرت القائمة) ⇐ أولى الصفحات ببحثها وتصفيتها.
  if (query.page > 1 && rows.length === 0) redirect(hrefWith(path, sp));

  const liveTracks = allTracks.filter((t) => t.deleted_at === null).map(({ id, name }) => ({ id, name }));
  const trackLinks: FilterLink[] = [
    { label: "كل المسارات", href: hrefWith(path, sp, { track: null }), current: query.track === null },
    ...liveTracks.map((t) => ({ label: t.name, href: hrefWith(path, sp, { track: t.id }), current: query.track === t.id })),
    // «بلا مسار» لا تُعرض إلا إن وُجد من لا مسار له — أو كانت مختارة.
    ...(participants.some((p) => !p.hasTrack) || query.track === NO_TRACK
      ? [{ label: "بلا مسار", href: hrefWith(path, sp, { track: NO_TRACK }), current: query.track === NO_TRACK }]
      : []),
  ];
  // الحالات الموجودة فعلاً في القائمة — لا خيار يُرجع فراغاً دائماً.
  const present = new Set(participants.map((p) => p.status));
  const statusLabel = (s: string) => PARTICIPANT_STATUS_LABEL[s as keyof typeof PARTICIPANT_STATUS_LABEL] ?? s;
  const statusLinks: FilterLink[] = [
    { label: "كل الحالات", href: hrefWith(path, sp, { status: null }), current: query.status === null },
    ...statuses
      .filter((s) => present.has(s) || query.status === s)
      .map((s) => ({ label: statusLabel(s), href: hrefWith(path, sp, { status: s }), current: query.status === s })),
  ];
  const activeFilters = [
    query.track === NO_TRACK
      ? { key: "track", label: "المسار: بلا مسار" }
      : query.track
        ? { key: "track", label: `المسار: ${trackName.get(query.track) ?? "مسارٌ واحد"}` }
        : null,
    query.status ? { key: "status", label: `الحالة: ${statusLabel(query.status)}` } : null,
  ].filter((f) => f !== null);

  return (
    <ParticipantsView
      programId={id}
      kind={programResult.data.kind}
      participants={participants}
      pageRows={rows}
      total={total}
      page={query.page}
      trackLinks={trackLinks}
      statusLinks={statusLinks}
      activeFilters={activeFilters}
      requests={requests}
      tracks={liveTracks}
      canWrite={canWrite}
    />
  );
}
