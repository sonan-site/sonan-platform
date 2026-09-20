import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { programReadiness } from "@/lib/programs/readiness-server";
import { registrationState } from "@/lib/programs/registration";
import { ProgramView, type ProgramDetail } from "./program-view";

/**
 * نظرة عامة على البرنامج — **جاهزيته وحقائقه ودورة حياته**.
 *
 * المسارات والمادة والخطط والصفحة المعلنة لكلٍّ تبويبه (`adr/0029`): كانت
 * الستّة في عمود واحد، فلا يُعرف أين يبدأ العمل ولا أين ينتهي.
 */
export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // النطاق هنا **البرنامج نفسه**: دور محصور به يكفي لقراءته وتعديله.
  const authz = await authorizeRequest({
    permission: "programs.read",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (
    await authorizeRequest({ permission: "programs.write", programId: id, resourceProgramId: id })
  ).ok;

  const db = await createClient();
  const [programResult, ready] = await Promise.all([
    db
      .from("programs")
      .select(
        "id, name, slug, summary, status, kind, participant_label, capacity, registration_opens_at, registration_closes_at, passing_percentage, award_percentage",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    programReadiness(id),
  ]);

  if (programResult.error) return <ErrorState body="تعذّر جلب البرنامج." />;
  if (!programResult.data) notFound();
  if (!ready) return <ErrorState body="تعذّر حساب جاهزية البرنامج." />;

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
    kind: p.kind,
    passingPercentage: p.passing_percentage,
    awardPercentage: p.award_percentage,
    registration: registrationState({
      status: p.status,
      capacity: p.capacity,
      opensAt: p.registration_opens_at,
      closesAt: p.registration_closes_at,
      registeredCount: ready.participants,
    }),
  };

  return <ProgramView readinessItems={ready.items} program={program} canWrite={canWrite} />;
}
