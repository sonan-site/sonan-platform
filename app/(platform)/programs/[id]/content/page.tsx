import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
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
  const unitLabel = new Map((unitsResult.data ?? []).map((u) => [u.sequence, u.label]));
  const templateFields = templateFieldsResult.data ?? [];

  const units: UnitRow[] = unitsResult.data ?? [];

  const trackRows: TrackRow[] = tracks.map((track) => ({
    id: track.id,
    name: track.name,
    unitCount: countByTrack.get(track.id) ?? 0,
    parts: (rangesResult.data ?? [])
      .filter((r) => r.track_id === track.id)
      .map((r) => ({ id: r.id, from: r.from_sequence, to: r.to_sequence })),
  }));

  const fieldRows: FieldRow[] = fields.map((f) => ({
    id: f.id,
    label: f.label,
    kind: f.kind,
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
  await Promise.all(
    trackRows.flatMap((track) =>
      templateRows.map(async (template) => {
        const tasks: PreviewTask[] = [];
        for (const field of template.fields) {
          const amount = Math.max(1, Math.round(field.amount));
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
          tasks.push({
            label: field.label,
            kind: "ranged",
            amount,
            parts: (data ?? []).map((p) => ({
              from: p.from_sequence,
              to: p.to_sequence,
              fromLabel: unitLabel.get(p.from_sequence) ?? "",
              toLabel: unitLabel.get(p.to_sequence) ?? "",
            })),
          });
        }
        previews[`${track.id}:${template.id}`] = tasks;
      }),
    ),
  );

  return (
    <ContentView
      programId={id}
      programName={programResult.data.name}
      units={units}
      tracks={trackRows}
      fields={fieldRows}
      templates={templateRows}
      previews={previews}
    />
  );
}
