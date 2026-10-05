import { notFound } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { rangeText, withStarts, type Material } from "@/lib/programs/material";
import {
  ContentView,
  type FieldRow,
  type PreviewTask,
  type TemplateRow,
  type TrackRow,
  type UnitRow,
} from "./content-view";

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: rawPage } = await searchParams;
  const page = rawPage && /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;

  // الإعداد يشترط الكتابة لا القراءة: صفحة كلها نماذج تعديل.
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  // **صفحةٌ من المادة لا كلها.** واجهة REST تقطع عند ألف صفّ بصمت، والمادة
  // قد تبلغ آلافاً — فكان العدد والنطاق المعروضان يكذبان بعد الألف.
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const [
    programResult,
    unitsResult,
    tracksResult,
    fieldsResult,
    templatesResult,
    firstUnit,
    lastUnit,
    sectionsResult,
    unsectionedResult,
  ] =
    await Promise.all([
      db
        .from("programs")
        .select("id, name, section_label, unit_singular, unit_one, unit_two, unit_few, unit_many")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle(),
      db
        .from("content_units")
        .select("id, sequence, label, section_id", { count: "exact" })
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sequence")
        .range(from, from + DEFAULT_PAGE_SIZE - 1),
      db
        .from("tracks")
        .select("id, name")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sort_order"),
      db
        .from("task_fields")
        .select(
          "id, label, kind, sort_order, is_base, is_constrained, is_material_linked, is_required, count_unit, default_repetition",
        )
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sort_order"),
      db
        .from("day_templates")
        .select("id, name")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("name"),
      db
        .from("content_units")
        .select("sequence")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sequence")
        .limit(1)
        .maybeSingle(),
      db
        .from("content_units")
        .select("sequence")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sequence", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("material_sections")
        .select("id, name, unit_count")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at"),
      db
        .from("content_units")
        .select("id", { count: "exact", head: true })
        .eq("program_id", id)
        .is("deleted_at", null)
        .is("section_id", null),
    ]);

  if (programResult.error || unitsResult.error || sectionsResult.error) {
    return <ErrorState body="تعذّر جلب المادة." />;
  }
  if (!programResult.data) notFound();

  const program = programResult.data;
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
  const sectioned = material.sections.length > 0;
  // نصّ النطاق بالباب ورقمه — في المادة المقسّمة وحدها. وبلا أبواب تبقى الأرقام ونصوص الوحدات.
  const partText = (from: number, to: number) => (sectioned ? rangeText(material, from, to) : "");

  const tracks = tracksResult.data ?? [];
  const templates = templatesResult.data ?? [];
  const fields = fieldsResult.data ?? [];
  const trackIds = tracks.map((t) => t.id);
  const templateIds = templates.map((t) => t.id);
  const noRows = ["00000000-0000-0000-0000-000000000000"];

  const [rangesResult, templateFieldsResult, countsResult] = await Promise.all([
    db
      .from("track_content_ranges")
      .select("id, track_id, from_sequence, to_sequence, sort_order")
      .in("track_id", trackIds.length > 0 ? trackIds : noRows)
      .is("deleted_at", null)
      .order("sort_order"),
    db
      .from("day_template_fields")
      .select("day_template_id, task_field_id, base_amount, sort_order")
      .in("day_template_id", templateIds.length > 0 ? templateIds : noRows)
      .is("deleted_at", null)
      .order("sort_order"),
    // عدد وحدات كل مسار من الدالة القاعدية — لا يُحسب هنا، فالفجوات تُعالَج هناك.
    Promise.all(
      trackIds.map(async (trackId) => {
        const { data } = await db.rpc("fn_track_unit_count", { p_track_id: trackId });
        return { trackId, count: data ?? 0 };
      }),
    ),
  ]);

  const countByTrack = new Map(countsResult.map((c) => [c.trackId, c.count]));
  const templateFields = templateFieldsResult.data ?? [];

  const units: UnitRow[] = (unitsResult.data ?? []).map((u) => ({
    id: u.id,
    sequence: u.sequence,
    label: u.label,
    sectioned: u.section_id !== null,
  }));

  const trackRows: TrackRow[] = tracks.map((track) => ({
    id: track.id,
    name: track.name,
    unitCount: countByTrack.get(track.id) ?? 0,
    parts: (rangesResult.data ?? [])
      .filter((r) => r.track_id === track.id)
      .map((r) => ({
        id: r.id,
        from: r.from_sequence,
        to: r.to_sequence,
        text: partText(r.from_sequence, r.to_sequence),
      })),
  }));

  const fieldRows: FieldRow[] = fields.map((f) => ({
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

  const templateRows: TemplateRow[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    fields: templateFields
      .filter((tf) => tf.day_template_id === t.id)
      .map((tf) => ({
        fieldId: tf.task_field_id,
        label: fields.find((f) => f.id === tf.task_field_id)?.label ?? "—",
        kind: fields.find((f) => f.id === tf.task_field_id)?.kind ?? "counted",
        amount: Number(tf.base_amount),
      })),
  }));

  /**
   * ══ المعاينة: يوم المشارك الأول ══
   *
   * تُحسَب **بدوالّ القاعدة نفسها** التي تخدم شاشة المشارك — لا بمنطق موازٍ
   * هنا. فما يراه المُعِدّ في المعاينة هو ما سيراه المشارك حرفياً، ولا ينحرف
   * أحدهما عن الآخر بتعديل في موضع واحد.
   *
   * واليوم الأول يبدأ من الرتبة ١ دائماً، فلا يحتاج مشاركاً ولا إنجازاً.
   */
  const previews: Record<string, PreviewTask[]> = {};
  const neededSequences = new Set<number>();
  await Promise.all(
    trackRows.flatMap((track) =>
      templateRows.map(async (template) => {
        const tasks: PreviewTask[] = [];
        for (const field of template.fields) {
          const amount = Math.max(1, Math.round(field.amount));
          // النطاق الصريح لا مقدار له في شكل اليوم — يُدخل في الخطة وحدها.
          if (field.kind === "explicit") continue;
          if (field.kind === "counted") {
            tasks.push({ label: field.label, kind: "counted", amount, parts: [] });
            continue;
          }
          if (track.unitCount === 0) {
            tasks.push({ label: field.label, kind: "ranged", amount, parts: [] });
            continue;
          }
          const { data } = await db.rpc("fn_track_ordinal_span", {
            p_track_id: track.id,
            p_from: 1,
            p_to: Math.min(amount, track.unitCount),
          });
          const parts = (data ?? []).map((p) => ({
            from: p.from_sequence,
            to: p.to_sequence,
            fromLabel: "",
            toLabel: "",
            text: partText(p.from_sequence, p.to_sequence),
          }));
          for (const part of parts) {
            neededSequences.add(part.from);
            neededSequences.add(part.to);
          }
          tasks.push({ label: field.label, kind: "ranged", amount, parts });
        }
        previews[`${track.id}:${template.id}`] = tasks;
      }),
    ),
  );

  // النصوص للأرقام التي تعرضها المعاينة وحدها — لا للمادة كلها.
  if (neededSequences.size > 0 && !sectioned) {
    const { data: labelled } = await db
      .from("content_units")
      .select("sequence, label")
      .eq("program_id", id)
      .in("sequence", [...neededSequences])
      .is("deleted_at", null);
    const unitLabel = new Map((labelled ?? []).map((u) => [u.sequence, u.label ?? ""]));
    for (const tasks of Object.values(previews)) {
      for (const task of tasks) {
        for (const part of task.parts) {
          part.fromLabel = unitLabel.get(part.from) ?? "";
          part.toLabel = unitLabel.get(part.to) ?? "";
        }
      }
    }
  }

  return (
    <ContentView
      programId={id}
      material={material}
      unsectioned={sectioned ? (unsectionedResult.count ?? 0) : 0}
      units={units}
      unitSummary={{
        count: unitsResult.count ?? 0,
        first: firstUnit.data?.sequence ?? null,
        last: lastUnit.data?.sequence ?? null,
      }}
      unitPage={page}
      tracks={trackRows}
      fields={fieldRows}
      templates={templateRows}
      previews={previews}
    />
  );
}
