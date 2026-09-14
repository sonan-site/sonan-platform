import { describe, expect, it } from "vitest";
import {
  isProgramKind,
  isStatusAllowed,
  kindAllowsExams,
  kindIsScored,
  PARTICIPANT_STATUS_LABEL,
  PARTICIPANT_STATUSES,
  PROGRAM_KIND_CODES,
  PROGRAM_KINDS,
  statusesOf,
} from "./kinds";

describe("حدّ الوعاء — الكتالوج", () => {
  it("**المسابقة وحدها تُقاس ولها اختبارات** — وهذا حدّ الوعاء كلّه", () => {
    const scored = PROGRAM_KIND_CODES.filter(kindIsScored);
    const withExams = PROGRAM_KIND_CODES.filter(kindAllowsExams);
    expect(scored).toEqual(["competition"]);
    expect(withExams).toEqual(["competition"]);
  });

  it("وصف النمط يقول ما فيه — بلا وعد ولا اعتذار ولا رمز تنسيق", () => {
    for (const code of PROGRAM_KIND_CODES) {
      const { lede } = PROGRAM_KINDS[code];
      expect(lede, code).not.toMatch(/لم تُبن|لم يُبن|لاحقاً|بعد\b|\*\*/);
      // ما يخصّ المسابقة لا يُنسب لغيرها.
      expect(lede.includes("اختبارات") && !lede.includes("بلا اختبارات"), code).toBe(
        kindAllowsExams(code),
      );
    }
  });

  it("**حالات كل نمط مجموعة فرعية من حالات المسابقة** — لا قيمة يتيمة", () => {
    const all = new Set<string>(statusesOf("competition"));
    for (const code of PROGRAM_KIND_CODES) {
      const orphan = statusesOf(code).filter((s) => !all.has(s));
      expect(orphan, code).toEqual([]);
    }
  });

  it("كل حالة يسمح بها نمط واحد على الأقل — لا تسمية بلا نمط", () => {
    const allowed = new Set(PROGRAM_KIND_CODES.flatMap((k) => [...statusesOf(k)]));
    expect([...PARTICIPANT_STATUSES].filter((s) => !allowed.has(s))).toEqual([]);
  });

  it("لكل حالة تسمية عربية", () => {
    expect(
      [...PARTICIPANT_STATUSES].filter((s) => !PARTICIPANT_STATUS_LABEL[s]),
    ).toEqual([]);
  });

  it("لا نمط بحالات فارغة — وإلا صار مشاركه بلا حالة", () => {
    expect(PROGRAM_KIND_CODES.filter((k) => statusesOf(k).length === 0)).toEqual([]);
  });

  it("الحالتان العامّتان في كل نمط", () => {
    for (const code of PROGRAM_KIND_CODES) {
      expect(isStatusAllowed(code, "registered"), code).toBe(true);
      expect(isStatusAllowed(code, "memorizing"), code).toBe(true);
    }
  });

  it("**الحالة التنافسية ممنوعة في غير المسابقة**", () => {
    for (const code of PROGRAM_KIND_CODES) {
      if (code === "competition") continue;
      expect(isStatusAllowed(code, "passed"), code).toBe(false);
      expect(isStatusAllowed(code, "qualified"), code).toBe(false);
    }
  });

  it("النمط المجهول يُردّ", () => {
    expect(isProgramKind("competitions")).toBe(false);
    expect(isProgramKind("")).toBe(false);
    expect(isProgramKind(null)).toBe(false);
    expect(isProgramKind("competition")).toBe(true);
  });
});
