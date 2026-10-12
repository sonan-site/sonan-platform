import { describe, expect, it } from "vitest";
import { BANK_HEADERS, bankTemplateCsv, parseBankTable } from "./bank-import";
import { parseCsv } from "@/lib/plans/import";

const tracks = [{ id: "t1", name: "المسار الأول" }];
const head = [...BANK_HEADERS] as string[];
const row = (over: Record<string, string>) => head.map((h) => over[h] ?? "");
const remote = (over: Record<string, string> = {}) =>
  row({ "رقم الوحدة": "1", "الاستعمال": "عن بعد", "السؤال": "سؤال", "النوع": "مفرد", "خيار 1": "أ", "خيار 2": "ب", "الصحيح": "1", ...over });

describe("استيراد بنك الأسئلة", () => {
  it("**القالب نفسه يُقرأ بلا خطأ** — بالاستعمالات الثلاثة", () => {
    const parsed = parseBankTable(parseCsv(bankTemplateCsv().replace(/^﻿/, "")), tracks);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.map((r) => [r.usage, r.type])).toEqual([
      ["remote", "single"],
      ["remote", "true_false"],
      ["both", "single"],
      ["oral", "open"],
    ]);
    expect(parsed.rows[0]!.options).toEqual([
      { text: "عمر بن الخطاب", correct: true },
      { text: "أبو هريرة", correct: false },
      { text: "ابن عباس", correct: false },
    ]);
    expect(parsed.rows[3]!.options).toEqual([]);
  });

  it("**العناوين بلا «ال» ولا تشكيل وبأي ترتيب**، والأرقام العربية تُقرأ", () => {
    const parsed = parseBankTable(
      [
        ["الصحيح", "سؤال", "نوع", "رقم وحدة", "استعمال", "خيار 1", "خيار 2"],
        ["٢", "سؤال تجريبي", "متعدد", "٣", "عن بعد", "أ", "ب"],
      ],
      tracks,
    );
    expect(parsed).toEqual({
      ok: true,
      rows: [
        {
          track_id: null,
          usage: "remote",
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
        remote(),
        remote({ "رقم الوحدة": "0" }),
        remote({ "الصحيح": "1,2" }),
        remote({ "المسار": "مسار مجهول" }),
        remote({ "النوع": "صح وخطأ", "الصحيح": "ربما" }),
        remote({ "الاستعمال": "" }),
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
      "السطر 7: حدّد الاستعمال: عن بعد أو شفهي أو كلاهما.",
    ]);
  });

  it("**الشفهي وكلاهما بجوابٍ للمحكّم، وصح وخطأ لا يكون شفهياً**", () => {
    const parsed = parseBankTable(
      [
        head,
        row({ "رقم الوحدة": "1", "الاستعمال": "شفهي", "السؤال": "سمّع الحديث" }),
        remote({ "الاستعمال": "كلاهما" }),
        remote({ "الاستعمال": "كلاهما", "النوع": "صح وخطأ", "الصحيح": "صح", "الجواب للمحكّم": "صح" }),
      ],
      tracks,
    );
    expect(parsed.ok ? [] : parsed.errors).toEqual([
      "السطر 2: الجواب للمحكّم مطلوب لما يدخل الشفهي.",
      "السطر 3: الجواب للمحكّم مطلوب لما يدخل الشفهي.",
      "السطر 4: صح وخطأ لا يكون شفهياً — اجعله «عن بعد».",
    ]);
  });

  it("والصحيح يشير إلى خيارٍ مكتوب", () => {
    const parsed = parseBankTable([head, remote({ "الصحيح": "4" })], tracks);
    expect(parsed.ok ? [] : parsed.errors[0]).toMatch(/السطر 2: الصحيح/);
  });

  it("والمسار بالاسم يُحوَّل إلى معرّفه", () => {
    const parsed = parseBankTable([head, remote({ "المسار": "مسار أول" })], tracks);
    expect(parsed.ok ? parsed.rows[0]!.track_id : null).toBe("t1");
  });

  it("وعمودٌ إلزامي ناقص يُقال باسمه", () => {
    expect(parseBankTable([["السؤال", "النوع"]], tracks)).toEqual({
      ok: false,
      errors: ["أعمدة ناقصة في الملف: رقم الوحدة، الاستعمال، الصحيح. نزّل القالب وانسخ أسئلتك فيه."],
    });
  });
});
