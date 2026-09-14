import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { registrationStates } from "@/lib/programs/registration-server";
import { ProgramsView, type ProgramRow, type SectionRow } from "./programs-view";

export default async function ProgramsPage() {
  const authz = await authorizeRequest({ permission: "programs.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  // الإنشاء يشترط صلاحية عامة؛ والتعديل يكفيه نطاق البرنامج نفسه.
  const canWritePrograms = (
    await authorizeRequest({ permission: "programs.write", programId: null })
  ).ok;
  const canWriteSections = (await authorizeRequest({ permission: "sections.write" })).ok;

  const db = await createClient();
  const [sectionsResult, programsResult] = await Promise.all([
    db.from("sections").select("id, name, parent_id").is("deleted_at", null).order("sort_order"),
    db
      .from("programs")
      .select(
        "id, name, slug, kind, status, capacity, section_id, registration_opens_at, registration_closes_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (sectionsResult.error || programsResult.error) {
    return <ErrorState body="تعذّر جلب البرامج. أعد المحاولة." />;
  }

  const nameById = new Map((sectionsResult.data ?? []).map((s) => [s.id, s.name]));

  const sections: SectionRow[] = (sectionsResult.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    parentName: s.parent_id ? (nameById.get(s.parent_id) ?? null) : null,
  }));

  const states = await registrationStates(db, (programsResult.data ?? []).map((p) => p.id));
  const programs: ProgramRow[] = (programsResult.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    sectionName: nameById.get(p.section_id) ?? "—",
    slug: p.slug,
    kind: p.kind,
    capacity: p.capacity,
    // [BR-CAP-01] — من القاعدة لا من عدٍّ مكتوب صفراً.
    registration: states.get(p.id) ?? "closed",
  }));

  return (
    <ProgramsView
      sections={sections}
      programs={programs}
      canWriteSections={canWriteSections}
      canWritePrograms={canWritePrograms}
    />
  );
}
