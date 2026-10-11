import { describe, expect, it } from "vitest";
import { BANK_HEADERS, bankTemplateCsv, parseBankTable } from "./bank-import";
import { parseCsv } from "@/lib/plans/import";

const tracks = [{ id: "t1", name: "المسار الأول" }];
const head = [...BANK_HEADERS] as string[];
const row = (over: Record<string, string>) => head.map((h) => over[h] ?? "");

describe("استيراد بنك الأسئلة", () => {
  it("**القالب نفسه يُقرأ بلا خطأ**", () => {
    const parsed = parseBankTable(parseCsv(bankTemplateCsv().replace(/^﻿/, "")), tracks);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]!.options).toEqual([
      { text: "عمر بن الخطاب", correct: true },
      { text: "أبو هريرة", correct: false },
      { text: "ابن عباس", correct: false },
    ]);
    expect(parsed.rows[1]).toMatchObject({ type: "true_false", tf_answer: "خطأ" });
  });

  it("**العناوين بلا «ال» ولا تشكيل وبأي ترتيب**، والأرقام العربية تُقرأ", () => {
    const parsed = parseBankTable(
      [
        ["الصحيح", "سؤال", "نوع", "رقم وحدة", "خيار 1", "خيار 2"],
        ["٢", "سؤال تجريبي", "متعدد", "٣", "أ", "ب"],
      ],
      tracks,
    );
    expect(parsed).toEqual({
      ok: true,
      rows: [
        {
          track_id: null,
          unit_sequence: 3,
          text: "سؤال تجريبي",
          type: "multiple",
          score: 1,
          answer: "",
          options: [
            { text: "أ", correct: false },
            { text: "ب", correct: true },
          ],
        },
      ],
    });
  });

  it("**الأخطاء كلها برقم سطرها** — لا أولها وحده", () => {
    const parsed = parseBankTable(
      [
        head,
        row({ "رقم الوحدة": "1", "السؤال": "سؤال صحيح", "النوع": "مفرد", "خيار 1": "أ", "خيار 2": "ب", "الصحيح": "1" }),
        row({ "رقم الوحدة": "0", "السؤال": "سؤال", "النوع": "مفرد", "الصحيح": "1" }),
        row({ "رقم الوحدة": "1", "السؤال": "سؤال", "النوع": "مفرد", "خيار 1": "أ", "خيار 2": "ب", "الصحيح": "1,2" }),
        row({ "المسار": "مسار مجهول", "رقم الوحدة": "1", "السؤال": "سؤال", "النوع": "مفرد" }),
        row({ "رقم الوحدة": "1", "السؤال": "سؤال", "النوع": "صح وخطأ", "الصحيح": "ربما" }),
      ],
      tracks,
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual([
      "السطر 3: رقم الوحدة عددٌ صحيح من 1.",
      "السطر 4: المفرد له جوابٌ صحيح واحد.",
      "السطر 5: المسار «مسار مجهول» ليس في البرنامج.",
      "السطر 6: الصحيح في صح وخطأ: «صح» أو «خطأ».",
    ]);
  });

  it("والصحيح يشير إلى خيارٍ مكتوب", () => {
    const parsed = parseBankTable(
      [head, row({ "رقم الوحدة": "1", "السؤال": "سؤال", "النوع": "مفرد", "خيار 1": "أ", "خيار 2": "ب", "الصحيح": "4" })],
      tracks,
    );
    expect(parsed.ok ? [] : parsed.errors[0]).toMatch(/السطر 2: الصحيح/);
  });

  it("والمسار بالاسم يُحوَّل إلى معرّفه", () => {
    const parsed = parseBankTable(
      [head, row({ "المسار": "مسار أول", "رقم الوحدة": "1", "السؤال": "سؤال", "النوع": "صح وخطأ", "الصحيح": "صح" })],
      [{ id: "t1", name: "المسار الأول" }],
    );
    expect(parsed.ok ? parsed.rows[0]!.track_id : null).toBe("t1");
  });

  it("وعمودٌ إلزامي ناقص يُقال باسمه", () => {
    expect(parseBankTable([["السؤال", "النوع"]], tracks)).toEqual({
      ok: false,
      errors: ["أعمدة ناقصة في الملف: رقم الوحدة، الصحيح. نزّل القالب وانسخ أسئلتك فيه."],
    });
  });
});
