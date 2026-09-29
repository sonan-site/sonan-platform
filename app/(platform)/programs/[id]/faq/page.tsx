import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { FaqView, type FaqRow } from "./faq-view";

/**
 * تبويب الأسئلة الشائعة — مصدر عنصر «الأسئلة الشائعة» في الصفحة المعلنة.
 *
 * كان قسماً في شاشة بناء الصفحة بلا تعديلٍ ولا حذفٍ ولا ترتيب، فصار شاشته:
 * سؤالٌ واحدٌ قد يُعاد صوغه عشراً قبل أن يستقرّ.
 */
export default async function FaqTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const { data, error } = await db
    .from("help_entries")
    .select("id, question, answer, category, status")
    .eq("program_id", id)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");

  if (error) return <ErrorState body="تعذّر جلب الأسئلة الشائعة." />;

  const rows: FaqRow[] = (data ?? []).map((h) => ({
    id: h.id,
    question: h.question,
    answer: h.answer,
    category: h.category,
    published: h.status === "published",
  }));

  return <FaqView programId={id} rows={rows} />;
}
