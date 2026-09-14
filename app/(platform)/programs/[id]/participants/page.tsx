import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import {
  ParticipantsView,
  type ChangeRow,
  type ParticipantRow,
} from "./participants-view";

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  const db = await createClient();
  // المشاركون صفّاً لكل واحد، بأسمائهم وعدّ أيامهم، محسوبين في القاعدة (الهجرة ٠٢٩).
  // كانت الشاشة تجلب إنجاز البرنامج كله فتبلغ سقف الألف صفّ بعد ثمانين مشاركاً.
  const [programResult, participantsResult, tracksResult, requestsResult] = await Promise.all([
    db.from("programs").select("id, name, kind").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.rpc("fn_program_participants", { p_program_id: id, p_limit: 500, p_offset: 0 }),
    db
      .from("tracks")
      .select("id, name")
      .eq("program_id", id)
      .is("deleted_at", null)
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
  ]);

  if (programResult.error || participantsResult.error) {
    return <ErrorState body="تعذّر جلب المشاركين." />;
  }
  if (!programResult.data) notFound();

  const trackName = new Map((tracksResult.data ?? []).map((t) => [t.id, t.name]));

  const participants: ParticipantRow[] = (participantsResult.data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name ?? "—",
    trackName: p.track_id ? (trackName.get(p.track_id) ?? "—") : "بلا مسار",
    status: p.status,
    joinedAt: p.joined_at,
    baseline: p.baseline_percentage === null ? null : Number(p.baseline_percentage),
    submittedDays: p.submitted_days,
    workDays: p.work_days,
  }));

  const nameByParticipant = new Map(participants.map((p) => [p.id, p.name]));

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
    }));

  return (
    <ParticipantsView
      programId={id}
      programName={programResult.data.name}
      kind={programResult.data.kind}
      participants={participants}
      requests={requests}
      tracks={tracksResult.data ?? []}
      canWrite={canWrite}
    />
  );
}
