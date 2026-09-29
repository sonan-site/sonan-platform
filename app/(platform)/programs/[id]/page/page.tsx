import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { BLOCK_LABEL, isBlockType } from "@/lib/programs/blocks";
import { PageBuilder, type AdmissionRow, type BlockRow } from "../page-builder";

/** تبويب الصفحة المعلنة — عناصرها وأسئلة القبول. والأسئلة الشائعة في تبويبها (`adr/0029`). */
export default async function PublicPageTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [blocksResult, admissionResult, tracksResult] = await Promise.all([
    db
      .from("page_blocks")
      .select("id, block_type, content, sort_order")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order")
      // الفاصل نفسه الذي يرتّب به `moveBlock` — وإلا اختلف الفهرس عند التساوي.
      .order("created_at"),
    db
      .from("admission_questions")
      .select("id, question, is_required, track_id")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
    db
      .from("tracks")
      .select("id, name")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  if (blocksResult.error) return <ErrorState body="تعذّر جلب عناصر الصفحة." />;

  const blocks: BlockRow[] = (blocksResult.data ?? [])
    .filter((b) => isBlockType(b.block_type))
    .map((b) => {
      const c = (b.content ?? {}) as Record<string, unknown>;
      const first = String(c["title"] ?? c["heading"] ?? c["text"] ?? "");
      return {
        id: b.id,
        type: b.block_type,
        summary: first.slice(0, 60) || BLOCK_LABEL[b.block_type],
        content: c,
      };
    });

  const tracks = (tracksResult.data ?? []).map((t) => ({ id: t.id, name: t.name }));
  const trackNames = new Map(tracks.map((t) => [t.id, t.name]));
  const admission: AdmissionRow[] = (admissionResult.data ?? []).map((q) => ({
    id: q.id,
    question: q.question,
    required: q.is_required,
    trackName: q.track_id ? (trackNames.get(q.track_id) ?? null) : null,
  }));

  return (
    <PageBuilder programId={id} blocks={blocks} admission={admission} tracks={tracks} />
  );
}
