import { cell, csvPhone } from "@/lib/csv/cell";
import { accountStatusOf, ACCOUNT_DUPLICATE_LABEL, ACCOUNT_STATUS_LABEL } from "./list-query";

/**
 * ملف «المشاركون في المنصة» (الدفعة ٢): ما تعرضه القائمة بعد البحث والتصفية، بكل صفحاته.
 * UTF-8 ببادئة BOM ليفتحه Excel عربياً، والخلايا مأمونة من الصيغ (`lib/csv/cell.ts`) — الأسماء
 * يكتبها أصحابها. **بلا رقم هوية** (قرار الراعي في تصدير النتائج، ويسري هنا).
 *
 * الجوال مقروءاً بعلامة اتجاهه (`csvPhone`) لا خاماً، والتاريخ `YYYY-MM-DD` بتوقيت الرياض ليُفرز في Excel.
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
  /** له نظيرٌ بالاسم والميلاد · بالجوال (الدفعة ٣). */
  same_identity: boolean;
  same_phone: boolean;
};

/** علامتا التكرار نصاً: «مكرّر محتمل» · «جوال مشترك» · أو فارغ. */
export function duplicateText(r: { same_identity: boolean; same_phone: boolean }): string {
  return [
    r.same_identity ? ACCOUNT_DUPLICATE_LABEL.identity : null,
    r.same_phone ? ACCOUNT_DUPLICATE_LABEL.phone : null,
  ]
    .filter((x) => x !== null)
    .join(" · ");
}

/** برامج الحساب كما في الشاشة: أسماؤها · «بلا برنامج» · «—» لمن لا نعرف. */
export function programsText(programs: string[], hasProgram: boolean | null): string {
  return programs.length > 0 ? programs.join(" · ") : hasProgram === false ? "بلا برنامج" : "—";
}

const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });

export function toAccountsCsv(rows: AccountCsvRow[]): string {
  const head = ["الاسم", "الجوال", "البرامج", "تاريخ إنشاء الحساب", "الحالة", "التكرار"];
  const lines = rows.map((r) =>
    [
      r.full_name,
      csvPhone(r.phone),
      programsText(r.programs, r.has_program),
      isoDay.format(new Date(r.created_at)),
      ACCOUNT_STATUS_LABEL[accountStatusOf(r)],
      duplicateText(r),
    ]
      .map(cell)
      .join(","),
  );
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
