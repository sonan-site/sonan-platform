import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { toCsv } from "@/lib/exams/results-csv";
import { z } from "@/lib/validation/z";

/**
 * تصدير النتائج المعتمدة للتكريم والصرف (الدفعة د · م٨): بجلسة المستخدم لا بمفتاح
 * الخدمة، والدالة تحرس الصلاحية وتُدقِّق التصدير وتحذف الجوالين لمن لا يقرأ
 * المشاركين. بلا هوية (قرار الراعي).
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; examId: string }> }) {
  const { id, examId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(examId).success) {
    return new Response("غير موجود", { status: 404 });
  }
  const [manage, publish] = await Promise.all([
    authorizeRequest({ permission: "exams.manage", programId: id, resourceProgramId: id }),
    authorizeRequest({ permission: "exams.publish", programId: id, resourceProgramId: id }),
  ]);
  if (!manage.ok && !publish.ok) return new Response("غير مصرَّح", { status: 403 });

  const db = await createClient();
  const { data: exam } = await db.from("exams").select("id").eq("id", examId).eq("program_id", id).maybeSingle();
  if (!exam) return new Response("غير موجود", { status: 404 });
  const { data, error } = await db.rpc("fn_export_results", { p_exam_id: examId });
  if (error) return new Response("تعذّر التصدير", { status: 500 });

  const body = toCsv(data ?? []);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="results.csv"; filename*=UTF-8''${encodeURIComponent("نتائج-النهائي.csv")}`,
      "cache-control": "no-store",
    },
  });
}
