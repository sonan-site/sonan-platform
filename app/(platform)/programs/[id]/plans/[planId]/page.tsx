import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { fromPayload, type PlanField, type PlanPayload, type TrackShare } from "@/lib/plans/engine";
import { withStarts, type Material } from "@/lib/programs/material";
import { parseMapping } from "@/lib/plans/import";
import type { SavedMapping } from "./import-panel";
import { PlanEditor, type TemplateOption, type VersionRow } from "./plan-view";

/**
 * محرّر الخطة (`adr/0036` · `0037`): أيامٌ مرقّمة، وفي كل يوم قيمةٌ لكل حقل.
 * يُحرَّر في المتصفح ويُحفظ كاملاً بـ`fn_save_plan` — فالفحص والقفل والنسخة في
 * موضع واحد.
 */
export default async function PlanPage({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [planResult, programResult, fieldsResult, tracksResult, plansResult, sectionsResult, versionsResult, templatesResult] =
    await Promise.all([
      db
        .from("plans")
        .select("id, program_id, track_id, name, day_count")
        .eq("id", planId)
        .eq("program_id", id)
        .is("deleted_at", null)
        .maybeSingle(),
      db
        .from("programs")
        .select("id, name, section_label, unit_singular, unit_one, unit_two, unit_few, unit_many")
        .eq("id", id)
        .maybeSingle(),
      db
        .from("task_fields")
        .select(
          "id, label, kind, sort_order, is_base, is_constrained, is_material_linked, is_required, count_unit, default_repetition",
        )
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sort_order"),
      db.from("tracks").select("id, name").eq("program_id", id).is("deleted_at", null).order("sort_order"),
      db.from("plans").select("id, track_id").eq("program_id", id).is("deleted_at", null),
      db
        .from("material_sections")
        .select("id, name, unit_count")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at"),
      db
        .from("plan_versions")
        .select("id, version_number, note, created_at")
        .eq("plan_id", planId)
        .is("deleted_at", null)
        .order("version_number", { ascending: false })
        .limit(30),
      db
        .from("day_templates")
        .select("id, name, day_template_fields(task_field_id, base_amount, deleted_at)")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("name"),
    ]);

  if (planResult.error || fieldsResult.error || tracksResult.error) return <ErrorState body="تعذّر جلب الخطة." />;
  if (!planResult.data || !programResult.data) notFound();
  const plan = planResult.data;
  const program = programResult.data;

  // **القيم صفحاتٍ لا دفعة:** واجهة REST تقطع عند ألف صفّ بصمت، وخطة سنةٍ بثلاثة
  // حقول تتجاوزها — فيُحفظ بعدها ما نقص منها كأنه حُذف.
  const PAGE = 1000;
  const rows: {
    day_number: number;
    task_field_id: string;
    amount: number | null;
    from_sequence: number | null;
    to_sequence: number | null;
    value: number | null;
    repetition: number | null;
  }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("plan_values")
      .select("day_number, task_field_id, amount, from_sequence, to_sequence, value, repetition")
      .eq("plan_id", planId)
      .is("deleted_at", null)
      .order("day_number")
      .order("task_field_id")
      .range(from, from + PAGE - 1);
    if (error) return <ErrorState body="تعذّر جلب قيم الخطة." />;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  const locked = await db.rpc("fn_plan_locked_through", { p_plan_id: planId });
  // القفل لا يُفترض صفراً إن تعذّرت قراءته: المحرّر يفتح حينها أياماً أتمّها مشاركون.
  if (locked.error) return <ErrorState body="تعذّر جلب الأيام المقفلة." />;

  // المسارات التي تستعمل الخطة: مسارها إن كانت مخصّصة، وإلا كل مسار بلا مخصّصة.
  const customTracks = new Set((plansResult.data ?? []).filter((p) => p.track_id).map((p) => p.track_id));
  const users = (tracksResult.data ?? []).filter((t) =>
    plan.track_id ? t.id === plan.track_id : !customTracks.has(t.id),
  );

  const { data: ranges } = await db
    .from("track_content_ranges")
    .select("track_id, from_sequence, to_sequence, sort_order")
    .in("track_id", users.length > 0 ? users.map((t) => t.id) : ["00000000-0000-0000-0000-000000000000"])
    .is("deleted_at", null);

  const tracks: TrackShare[] = users.map((t) => ({
    id: t.id,
    name: t.name,
    ranges: (ranges ?? [])
      .filter((r) => r.track_id === t.id)
      .map((r) => ({ from: r.from_sequence, to: r.to_sequence, sortOrder: r.sort_order })),
  }));

  const fields: PlanField[] = (fieldsResult.data ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    kind: f.kind,
    isBase: f.is_base,
    isConstrained: f.is_constrained,
    isMaterialLinked: f.is_material_linked,
    isRequired: f.is_required,
    countUnit: f.count_unit,
    defaultRepetition: f.default_repetition,
    sortOrder: f.sort_order,
  }));

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

  const payload: PlanPayload = {
    day_count: plan.day_count,
    values: rows.map((v) => ({
      day: v.day_number,
      field_id: v.task_field_id,
      ...(v.amount !== null ? { amount: v.amount } : {}),
      ...(v.from_sequence !== null ? { from: v.from_sequence } : {}),
      ...(v.to_sequence !== null ? { to: v.to_sequence } : {}),
      ...(v.value !== null ? { value: Number(v.value) } : {}),
      ...(v.repetition !== null ? { repetition: v.repetition } : {}),
    })),
  };
  const initial = fromPayload(payload);

  const versions: VersionRow[] = (versionsResult.data ?? []).map((v) => ({
    id: v.id,
    number: v.version_number,
    note: v.note,
    at: v.created_at,
  }));

  const templates: TemplateOption[] = (templatesResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    fields: (t.day_template_fields ?? [])
      .filter((f) => f.deleted_at === null)
      .map((f) => ({ fieldId: f.task_field_id, amount: Number(f.base_amount) })),
  }));

  const { data: mappingRows } = await db
    .from("plan_import_mappings")
    .select("id, name, mapping")
    .eq("program_id", id)
    .is("deleted_at", null)
    .order("name");
  const mappings: SavedMapping[] = (mappingRows ?? []).flatMap((m) => {
    const mapping = parseMapping(m.mapping);
    return mapping ? [{ id: m.id, name: m.name, mapping }] : [];
  });

  const ownerTrack = plan.track_id ? (tracksResult.data ?? []).find((t) => t.id === plan.track_id) : null;

  return (
    <PlanEditor
      // نسخةٌ جديدة (حفظ أو رجوع) تُعيد بناء المحرّر على قيمها، فلا تبقى في الحالة قيمٌ قديمة.
      key={versions[0]?.id ?? "none"}
      programId={id}
      plan={{ id: plan.id, name: plan.name, scope: ownerTrack ? `مخصّصة لـ«${ownerTrack.name}»` : "الخطة الافتراضية" }}
      initial={initial}
      fields={fields}
      tracks={tracks}
      material={material}
      lockedThrough={locked.data ?? 0}
      versions={versions}
      templates={templates}
      programName={program.name}
      mappings={mappings}
    />
  );
}
