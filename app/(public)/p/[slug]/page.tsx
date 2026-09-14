import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { isBlockType } from "@/lib/programs/blocks";
import { registrationStates } from "@/lib/programs/registration-server";
import { BlockList, type BlockData, type PageBlock } from "./blocks";
import styles from "./blocks.module.css";

/**
 * صفحة البرنامج المعلن — رابط منشور مستقل، بلا حساب.
 *
 * لا شرط `status = 'published'` في هذا الملف: **RLS تحصره**. فلو نُسي الشرط هنا
 * لم يتسرّب شيء — وهذا معنى «القيد في الطبقة التي لا تُلتَفّ» (`platform.md §٧`).
 */

export const dynamic = "force-dynamic";

export default async function ProgramLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ registered?: string }>;
}) {
  const { slug } = await params;
  const { registered } = await searchParams;
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
    slug,
    programName: program.name,
    programSummary: program.summary,
    participantLabel: program.participant_label,
    // [BR-CAP-01]
    registration: (await registrationStates(db, [program.id])).get(program.id) ?? "closed",
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
        body={program.summary || "تفاصيل هذا البرنامج غير متاحة الآن."}
      />
    );
  }

  return (
    <>
      {/* بعد التسجيل يعود المتقدّم هنا: يُقال له إنه تمّ، وأين يجد واجبه. */}
      {registered === "1" ? (
        <p role="status" className={styles.registered}>
          تمّ تسجيلك في البرنامج. <Link href="/journey">افتح رحلتي</Link>
        </p>
      ) : null}
      <BlockList blocks={blocks} data={data} />
    </>
  );
}
