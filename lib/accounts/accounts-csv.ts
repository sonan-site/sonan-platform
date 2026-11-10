import { cell } from "@/lib/exams/results-csv";
import { formatDateBoth } from "@/lib/format";

/**
 * ملف «المشاركون في المنصة» (الدفعة ٢): ما تعرضه القائمة بعد البحث والتصفية، بكل صفحاته.
 * UTF-8 ببادئة BOM ليفتحه Excel عربياً، والخلايا تُحصَّن من الصيغ بـ`cell` كملف النتائج —
 * الأسماء يكتبها أصحابها. **بلا رقم هوية** (قرار الراعي في تصدير النتائج، ويسري هنا).
 */
export type AccountCsvRow = {
  full_name: string;
  phone: string | null;
  programs: string[];
  /** `null` لا نعرف — لمن لا يرى المشاركات كلها، كما في الشاشة. */
  has_program: boolean | null;
  created_at: string;
  deleted_at: string | null;
  purge_after: string | null;
};

export function accountStatusLabel(r: { deleted_at: string | null; purge_after: string | null }): string {
  return r.purge_after ? "في سلّة المحذوفات" : r.deleted_at ? "موقوف" : "نشط";
}

export function toAccountsCsv(rows: AccountCsvRow[]): string {
  const head = ["الاسم", "الجوال", "البرامج", "تاريخ إنشاء الحساب", "الحالة"];
  const lines = rows.map((r) =>
    [
      r.full_name,
      r.phone,
      r.programs.length > 0 ? r.programs.join(" · ") : r.has_program === false ? "بلا برنامج" : "—",
      formatDateBoth(r.created_at),
      accountStatusLabel(r),
    ]
      .map(cell)
      .join(","),
  );
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
