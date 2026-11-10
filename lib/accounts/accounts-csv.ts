import { cell } from "@/lib/csv/cell";
import { formatPhone } from "@/lib/profile/phone";
import { accountStatusOf, ACCOUNT_STATUS_LABEL } from "./list-query";

/**
 * ملف «المشاركون في المنصة» (الدفعة ٢): ما تعرضه القائمة بعد البحث والتصفية، بكل صفحاته.
 * UTF-8 ببادئة BOM ليفتحه Excel عربياً، والخلايا مأمونة من الصيغ (`lib/csv/cell.ts`) — الأسماء
 * يكتبها أصحابها. **بلا رقم هوية** (قرار الراعي في تصدير النتائج، ويسري هنا).
 *
 * الجوال مقروءاً (`+966 50 123 4567`) لا خاماً: Excel يقرأ `+966553088688` رقماً فيحذف «+»
 * ويعرضه علمياً، والمسافات تُبقيه نصاً. والتاريخ `YYYY-MM-DD` بتوقيت الرياض ليُفرز في Excel.
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

/** برامج الحساب كما في الشاشة: أسماؤها · «بلا برنامج» · «—» لمن لا نعرف. */
export function programsText(programs: string[], hasProgram: boolean | null): string {
  return programs.length > 0 ? programs.join(" · ") : hasProgram === false ? "بلا برنامج" : "—";
}

const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });

export function toAccountsCsv(rows: AccountCsvRow[]): string {
  const head = ["الاسم", "الجوال", "البرامج", "تاريخ إنشاء الحساب", "الحالة"];
  const lines = rows.map((r) =>
    [
      r.full_name,
      r.phone ? formatPhone(r.phone) : null,
      programsText(r.programs, r.has_program),
      isoDay.format(new Date(r.created_at)),
      ACCOUNT_STATUS_LABEL[accountStatusOf(r)],
    ]
      .map(cell)
      .join(","),
  );
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
