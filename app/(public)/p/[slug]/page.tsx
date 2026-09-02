import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { isBlockType } from "@/lib/programs/blocks";
import { registrationState } from "@/lib/programs/registration";
import { BlockList, type BlockData, type PageBlock } from "./blocks";

/**
 * صفحة البرنامج المعلن — رابط منشور مستقل، بلا حساب.
 *
 * لا شرط `status = 'published'` في هذا الملف: **RLS تحصره**. فلو نُسي الشرط هنا
 * لم يتسرّب شيء — وهذا معنى «القيد في الطبقة التي لا تُلتَفّ» (`platform.md §٧`).
 */

export const dynamic = "force-dynamic";

export default async function ProgramLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = await createClient();

  const { data: program, error } = await db
    .from("programs")
    .select(
      "id, name, summary, status, capacity, participant_label, registration_opens_at, registration_closes_at",
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return <ErrorState body="تعذّر جلب الصفحة. أعد المحاولة." />;
  if (!program) notFound();

  const [blocksResult, tracksResult, faqResult] = await Promise.all([
    db
      .from("page_blocks")
      .select("id, block_type, content")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("sort_order"),
    db
      .from("tracks")
      .select("id, name, description, capacity")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("sort_order"),
    db
      .from("help_entries")
      .select("id, question, answer")
      .eq("program_id", program.id)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const blocks: PageBlock[] = (blocksResult.data ?? [])
    .filter((b) => isBlockType(b.block_type))
    .map((b) => ({ id: b.id, type: b.block_type, content: b.content }));

  const data: BlockData = {
    programName: program.name,
    programSummary: program.summary,
    participantLabel: program.participant_label,
    // [BR-CAP-01]
    registration: registrationState({
      status: program.status,
      capacity: program.capacity,
      opensAt: program.registration_opens_at,
      closesAt: program.registration_closes_at,
      registeredCount: 0,
    }),
    tracks: tracksResult.data ?? [],
    faq: faqResult.data ?? [],
    // المرفقات تُوصَل عند بناء رفع الصور. حتى ذلك الحين عنصر الصورة يُتخطّى.
    attachments: new Map<string, string>(),
  };

  if (blocks.length === 0) {
    return (
      <EmptyState
        kind="no-data"
        title={program.name}
        body={
          program.summary ||
          "لم تُبنَ صفحة هذا البرنامج بعد. تابع إعلانات الجمعية."
        }
      />
    );
  }

  return <BlockList blocks={blocks} data={data} />;
}
