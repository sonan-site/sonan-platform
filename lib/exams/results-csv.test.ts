import { describe, expect, it } from "vitest";
import { cell, toCsv, type ExportRow } from "./results-csv";

const row = (o: Partial<ExportRow> = {}): ExportRow => ({
  track_name: "الأول",
  place: 1,
  full_name: "محمد",
  registration_no: 7,
  percent: "95.5",
  outcome: "passed",
  prize_label: "المركز الأول",
  prize_value: "5000",
  phone: null,
  guardian_phone: null,
  published: true,
  ...o,
});

describe("ملف النتائج", () => {
  it("**الصيغ لا تُنفَّذ** — الخلية التي تبدأ بها تُسبق بفاصلةٍ عليا", () => {
    expect(cell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(cell("+SUM(1)")).toBe("'+SUM(1)");
    expect(cell("-1")).toBe("'-1");
    expect(cell("@x")).toBe("'@x");
    expect(cell('أ,"ب"')).toBe('"أ,""ب"""');
  });

  it("**بادئة BOM**، والنسبة بمنزلتين، والنتيجة بالعربية", () => {
    const csv = toCsv([row(), row({ place: null, outcome: "absent", percent: null, prize_label: null, prize_value: null })]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("الأول,1,محمد,7,95.50,اجتاز,المركز الأول,5000,نعم");
    expect(csv).toContain(",غاب,");
    expect(csv).not.toContain("الجوال");
  });

  it("**الجوالان لمن يقرأ المشاركين** — والجوال الدولي يبقى رقماً", () => {
    const csv = toCsv([row({ phone: "+966500000001", guardian_phone: null })]);
    expect(csv).toContain("الجوال,جوال الولي");
    expect(csv).toContain(",+966500000001,");
  });
});
