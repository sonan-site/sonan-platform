import { cell, csvPhone } from "@/lib/csv/cell";

/**
 * ملف النتائج للتكريم والصرف (الدفعة د): UTF-8 ببادئة BOM ليفتحه Excel عربياً،
 * وكل خليةٍ تبدأ بما يجعلها صيغةً (`= + - @` أو جدولة) تُسبق بفاصلةٍ عليا
 * فلا تُنفَّذ — الأسماء يكتبها المشاركون.
 */
export type ExportRow = {
  track_name: string;
  place: number | null;
  full_name: string;
  registration_no: number | null;
  percent: number | string | null;
  outcome: string;
  prize_label: string | null;
  prize_value: string | null;
  phone: string | null;
  guardian_phone: string | null;
  published: boolean;
};

const OUTCOME: Record<string, string> = { passed: "اجتاز", not_passed: "لم يجتز", absent: "غاب" };

// الخليّة المأمونة مشتركةٌ مع ملف الحسابات — وتُصدَّر من هنا كما كانت.
export { cell };

export function toCsv(rows: ExportRow[]): string {
  const withPhones = rows.some((r) => r.phone !== null || r.guardian_phone !== null);
  const head = ["المسار", "المركز", "الاسم", "رقم التسجيل", "النسبة", "النتيجة", "الجائزة", "قيمتها", ...(withPhones ? ["الجوال", "جوال الولي"] : []), "منشورة"];
  const lines = rows.map((r) =>
    [
      r.track_name,
      r.place,
      r.full_name,
      r.registration_no,
      r.percent === null ? "" : Number(r.percent).toFixed(2),
      OUTCOME[r.outcome] ?? r.outcome,
      r.prize_label,
      r.prize_value,
      ...(withPhones ? [csvPhone(r.phone), csvPhone(r.guardian_phone)] : []),
      r.published ? "نعم" : "لا",
    ]
      .map(cell)
      .join(","),
  );
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
