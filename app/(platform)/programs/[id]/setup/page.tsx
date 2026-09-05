import { notFound, redirect } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { SetupView } from "./setup-view";

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [programResult, tracksResult, unitsResult] = await Promise.all([
    db.from("programs").select("id, name").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.from("tracks").select("id, name").eq("program_id", id).is("deleted_at", null),
    db
      .from("content_units")
      .select("id", { count: "exact", head: true })
      .eq("program_id", id)
      .is("deleted_at", null),
  ]);

  if (programResult.error || tracksResult.error) {
    return <ErrorState body="تعذّر جلب البرنامج." />;
  }
  if (!programResult.data) notFound();

  // البرنامج المُعَدّ لا يُعرَض له الإعداد السريع: زرٌّ يفتح شاشةً ترفض
  // وعدٌ كاذب. يُحوَّل إلى الشاشة التفصيلية.
  if ((unitsResult.count ?? 0) > 0) redirect(`/programs/${id}/content`);

  return (
    <SetupView
      programId={id}
      programName={programResult.data.name}
      tracks={tracksResult.data ?? []}
    />
  );
}
