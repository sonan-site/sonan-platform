import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { loadPublicProgram } from "@/lib/programs/public-page-server";
import { BlockList } from "./blocks";
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

  let loaded;
  try {
    loaded = await loadPublicProgram(db, slug);
  } catch {
    return <ErrorState body="تعذّر جلب الصفحة. أعد المحاولة." />;
  }
  if (!loaded) notFound();
  const { blocks, data } = loaded;
  const program = { name: loaded.name, summary: loaded.summary };

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
