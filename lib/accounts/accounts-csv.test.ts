import { describe, expect, it } from "vitest";
import { toAccountsCsv, type AccountCsvRow } from "./accounts-csv";

const base: AccountCsvRow = {
  full_name: "أحمد صالح",
  phone: "+966553088688",
  programs: ["مسابقة سنن"],
  has_program: true,
  created_at: "2026-11-10T09:00:00Z",
  deleted_at: null,
  purge_after: null,
};

const lines = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

describe("ملف الحسابات", () => {
  it("**ببادئة BOM** ليفتحه Excel عربياً، وبرأسٍ بلا رقم هوية", () => {
    const csv = toAccountsCsv([base]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines(csv)[0]).toBe("الاسم,الجوال,البرامج,تاريخ إنشاء الحساب,الحالة");
  });

  it("**الجوال مقروءاً بمسافاته** — فيبقى نصاً في Excel لا رقماً علمياً، ولا يُحصَّن كصيغة", () => {
    expect(lines(toAccountsCsv([base]))[1]).toContain(",+966 55 308 8688,");
  });

  it("**والتاريخ `YYYY-MM-DD` بتوقيت الرياض** ليُفرز في Excel", () => {
    expect(lines(toAccountsCsv([{ ...base, created_at: "2026-11-10T22:30:00Z" }]))[1]).toContain(",2026-11-11,");
  });

  it("**اسمٌ يبدأ بصيغة يُحصَّن** — الأسماء يكتبها أصحابها", () => {
    expect(lines(toAccountsCsv([{ ...base, full_name: "=HYPERLINK(1)" }]))[1]!.startsWith("'=HYPERLINK(1)")).toBe(true);
  });

  it("البرامج كما في الشاشة: أسماؤها · «بلا برنامج» · «—» لمن لا نعرف", () => {
    expect(lines(toAccountsCsv([{ ...base, programs: ["أ", "ب"] }]))[1]).toContain(",أ · ب,");
    expect(lines(toAccountsCsv([{ ...base, programs: [], has_program: false }]))[1]).toContain(",بلا برنامج,");
    expect(lines(toAccountsCsv([{ ...base, programs: [], has_program: null }]))[1]).toContain(",—,");
  });

  it("الحالة: نشط · موقوف · في سلّة المحذوفات", () => {
    const at = "2026-11-10T09:00:00Z";
    expect(lines(toAccountsCsv([base]))[1]!.endsWith(",نشط")).toBe(true);
    expect(lines(toAccountsCsv([{ ...base, deleted_at: at }]))[1]!.endsWith(",موقوف")).toBe(true);
    expect(lines(toAccountsCsv([{ ...base, deleted_at: at, purge_after: at }]))[1]!.endsWith(",في سلّة المحذوفات")).toBe(true);
  });

  it("بلا صفوف ⇐ الرأس وحده", () => {
    expect(lines(toAccountsCsv([]))).toHaveLength(1);
  });
});
