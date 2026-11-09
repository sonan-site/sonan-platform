import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { BLOCK_LABEL, isBlockType } from "@/lib/programs/blocks";
import { now, toDateInput } from "@/lib/format";
import { GuideUpdates, type GuideUpdateRow } from "../guide-updates";
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
  const [programResult, blocksResult, admissionResult, tracksResult, guideResult, countsResult, othersResult] = await Promise.all([
    db.from("programs").select("slug").eq("id", id).maybeSingle(),
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
      .select("id, question, is_required, track_id, kind, options")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
    db
      .from("tracks")
      .select("id, name")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
    db
      .from("guide_updates")
      .select("id, entry_date, body")
      .eq("program_id", id)
      .is("deleted_at", null)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    // عدد من اختار كل خيار من أسئلة القائمة — لمن يقرأ المشاركين وحده، وتعذّره يُخفي العدّ.
    db.rpc("fn_admission_option_counts", { p_program_id: id }),
    // ما كُتب في «أخرى» مجمَّعاً — بالصلاحية نفسها، وتعذّره يُخفيه.
    db.rpc("fn_admission_other_answers", { p_program_id: id }),
  ]);

  if (blocksResult.error || !programResult.data) {
    return <ErrorState body="تعذّر جلب عناصر الصفحة." />;
  }

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
  const counts = countsResult.error ? null : (countsResult.data ?? []);
  const admission: AdmissionRow[] = (admissionResult.data ?? []).map((q) => ({
    id: q.id,
    question: q.question,
    required: q.is_required,
    kind: q.kind,
    options: q.options,
    counts: counts
      ? counts.filter((c) => c.question_id === q.id).map((c) => ({ option: c.option, answered: c.answered }))
      : null,
    others: othersResult.error
      ? null
      : (othersResult.data ?? []).filter((o) => o.question_id === q.id).map((o) => ({ text: o.text, answered: o.answered })),
    trackId: q.track_id,
    trackName: q.track_id ? (trackNames.get(q.track_id) ?? null) : null,
  }));

  // خطأ القراءة لا يُعرض سجلاً فارغاً — «لا تحديثات بعد» خبرٌ كاذب حينها.
  const guideRows: GuideUpdateRow[] | null = guideResult.error
    ? null
    : (guideResult.data ?? []).map((u) => ({ id: u.id, date: u.entry_date, body: u.body }));

  return (
    <>
      <PageBuilder
        programId={id}
        programSlug={programResult.data.slug}
        blocks={blocks}
        admission={admission}
        tracks={tracks}
      />
      <GuideUpdates
        programId={id}
        programSlug={programResult.data.slug}
        rows={guideRows}
        today={toDateInput(now())}
      />
    </>
  );
}
