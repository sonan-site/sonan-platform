import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import {
  ContentView,
  type FieldRow,
  type RangeRow,
  type TemplateRow,
  type UnitRow,
} from "./content-view";

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // الإعداد يشترط الكتابة لا القراءة: صفحة كلها نماذج تعديل.
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [programResult, unitsResult, tracksResult, fieldsResult, templatesResult] =
    await Promise.all([
      db.from("programs").select("id, name").eq("id", id).is("deleted_at", null).maybeSingle(),
      db
        .from("content_units")
        .select("id, sequence, label")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sequence"),
      db
        .from("tracks")
        .select("id, name")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sort_order"),
      db
        .from("task_fields")
        .select("id, label, kind, sort_order")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("sort_order"),
      db
        .from("day_templates")
        .select("id, name")
        .eq("program_id", id)
        .is("deleted_at", null)
        .order("name"),
    ]);

  if (programResult.error || unitsResult.error) {
    return <ErrorState body="تعذّر جلب المادة." />;
  }
  if (!programResult.data) notFound();

  const trackIds = (tracksResult.data ?? []).map((t) => t.id);
  const templateIds = (templatesResult.data ?? []).map((t) => t.id);
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
      .select("day_template_id, task_field_id, base_amount")
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

  const trackName = new Map((tracksResult.data ?? []).map((t) => [t.id, t.name]));
  const fieldLabel = new Map((fieldsResult.data ?? []).map((f) => [f.id, f.label]));
  const countByTrack = new Map(countsResult.map((c) => [c.trackId, c.count]));

  const units: UnitRow[] = unitsResult.data ?? [];

  const ranges: RangeRow[] = (rangesResult.data ?? []).map((r) => ({
    id: r.id,
    trackId: r.track_id,
    trackName: trackName.get(r.track_id) ?? "—",
    from: r.from_sequence,
    to: r.to_sequence,
    sortOrder: r.sort_order,
  }));

  const fields: FieldRow[] = (fieldsResult.data ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    kind: f.kind,
    sortOrder: f.sort_order,
  }));

  const templates: TemplateRow[] = (templatesResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    fields: (templateFieldsResult.data ?? [])
      .filter((tf) => tf.day_template_id === t.id)
      .map((tf) => ({
        label: fieldLabel.get(tf.task_field_id) ?? "—",
        amount: Number(tf.base_amount),
      })),
  }));

  return (
    <ContentView
      programId={id}
      programName={programResult.data.name}
      units={units}
      unitCount={units.length}
      ranges={ranges}
      fields={fields}
      templates={templates}
      tracks={(tracksResult.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        unitCount: countByTrack.get(t.id) ?? 0,
      }))}
    />
  );
}
