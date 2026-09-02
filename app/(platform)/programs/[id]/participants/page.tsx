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
  const [programResult, participantsResult, tracksResult, requestsResult] = await Promise.all([
    db.from("programs").select("id, name").eq("id", id).is("deleted_at", null).maybeSingle(),
    db
      .from("participants")
      .select("id, user_id, track_id, status, joined_at, baseline_percentage")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("joined_at", { ascending: false }),
    db
      .from("tracks")
      .select("id, name")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
    db
      .from("track_change_requests")
      .select("id, participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage, status")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (programResult.error || participantsResult.error) {
    return <ErrorState body="تعذّر جلب المشاركين." />;
  }
  if (!programResult.data) notFound();

  const userIds = (participantsResult.data ?? []).map((p) => p.user_id);
  const { data: profiles } = await db
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
  const trackName = new Map((tracksResult.data ?? []).map((t) => [t.id, t.name]));

  const participants: ParticipantRow[] = (participantsResult.data ?? []).map((p) => ({
    id: p.id,
    name: nameByUser.get(p.user_id) ?? p.user_id.slice(0, 8),
    trackName: p.track_id ? (trackName.get(p.track_id) ?? "—") : "بلا مسار",
    status: p.status,
    joinedAt: p.joined_at,
    baseline: p.baseline_percentage === null ? null : Number(p.baseline_percentage),
  }));

  const nameByParticipant = new Map(participants.map((p) => [p.id, p.name]));

  // الطلبات مرشَّحة بمشاركي هذا البرنامج: السياسة تحصر ما يُقرأ، والترشيح هنا
  // يمنع خلط برنامجين في شاشة واحدة.
  const requests: ChangeRow[] = (requestsResult.data ?? [])
    .filter((r) => nameByParticipant.has(r.participant_id))
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
      participants={participants}
      requests={requests}
      tracks={tracksResult.data ?? []}
      canWrite={canWrite}
    />
  );
}
