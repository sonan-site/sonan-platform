import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { registrationState } from "@/lib/programs/registration";
import { ProgramView, type ProgramDetail, type TrackRow } from "./program-view";

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // النطاق هنا **البرنامج نفسه**: دور محصور به يكفي لقراءته وتعديله.
  const authz = await authorizeRequest({
    permission: "programs.read",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (
    await authorizeRequest({
      permission: "programs.write",
      programId: id,
      resourceProgramId: id,
    })
  ).ok;

  const db = await createClient();
  const [programResult, tracksResult] = await Promise.all([
    db
      .from("programs")
      .select(
        "id, name, slug, summary, status, participant_label, capacity, registration_opens_at, registration_closes_at, passing_percentage, award_percentage",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    db
      .from("tracks")
      .select("id, name, description, capacity")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  if (programResult.error || tracksResult.error) {
    return <ErrorState body="تعذّر جلب البرنامج. أعد المحاولة." />;
  }
  if (!programResult.data) notFound();

  const p = programResult.data;

  const program: ProgramDetail = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    summary: p.summary,
    status: p.status,
    participantLabel: p.participant_label,
    capacity: p.capacity,
    opensAt: p.registration_opens_at,
    closesAt: p.registration_closes_at,
    passingPercentage: Number(p.passing_percentage),
    awardPercentage: Number(p.award_percentage),
    // [BR-CAP-01]
    registration: registrationState({
      status: p.status,
      capacity: p.capacity,
      opensAt: p.registration_opens_at,
      closesAt: p.registration_closes_at,
      registeredCount: 0,
    }),
  };

  const tracks: TrackRow[] = (tracksResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    capacity: t.capacity,
  }));

  return <ProgramView program={program} tracks={tracks} canWrite={canWrite} />;
}
