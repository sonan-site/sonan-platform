import { toLatinDigits } from "@/lib/format";
import { normalizeName } from "@/lib/plans/import";

/**
 * استيراد بنك الأسئلة (`adr/0048`) — منطق خالص بلا قاعدة.
 *
 * **قالبٌ ثابت لا تعيين أعمدة:** خلافاً للخطة (`adr/0042`)، ملف الأسئلة يُعدّه
 * فريق الجمعية من قالبٍ تنزّله المنصة، فالأعمدة معروفة بعناوينها. والعنوان
 * يُطابَق بلا تشكيل ولا «ال»، وترتيب الأعمدة حرّ.
 *
 * يُخرج صفوفاً بصيغة `fn_save_question`، وكل خطأ برقم سطره في الملف (١ العناوين).
 * والقاعدة تُعيد الفحص كلّه — هذا لأن يرى المُعِدّ أخطاءه كلها مرّة، لا أولها.
 */

export type BankRow = {
  track_id: string | null;
  unit_sequence: number;
  text: string;
  type: "single" | "multiple" | "true_false";
  score: number;
  answer: string;
  tf_answer?: "صح" | "خطأ";
  options: { text: string; correct: boolean }[];
};

export type BankImport = { ok: true; rows: BankRow[] } | { ok: false; errors: string[] };

const MAX_OPTIONS = 6;
const MAX_ERRORS = 20;

/** عناوين القالب بترتيبه — والقالب المنزَّل يُبنى منها. */
export const BANK_HEADERS = [
  "المسار",
  "رقم الوحدة",
  "السؤال",
  "النوع",
  "الدرجة",
  "الجواب للمحكّم",
  ...Array.from({ length: MAX_OPTIONS }, (_, i) => `خيار ${i + 1}`),
  "الصحيح",
] as const;

const TYPES: Record<string, BankRow["type"]> = {
  [normalizeName("مفرد")]: "single",
  [normalizeName("متعدد")]: "multiple",
  [normalizeName("صح وخطأ")]: "true_false",
  [normalizeName("صح/خطأ")]: "true_false",
};

/** قالبٌ بسطرَي مثال — يُنزَّل CSV بترميز UTF-8 مع BOM ليفتحه Excel عربياً. */
export function bankTemplateCsv(): string {
  const example = [
    ["", "1", "من راوي حديث «إنما الأعمال بالنيات»؟", "مفرد", "1", "عمر بن الخطاب رضي الله عنه",
      "عمر بن الخطاب", "أبو هريرة", "ابن عباس", "", "", "", "1"],
    ["", "2", "الحديث في صحيح البخاري وحده.", "صح وخطأ", "1", "", "", "", "", "", "", "", "خطأ"],
  ];
  const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [BANK_HEADERS as readonly string[], ...example].map((r) => r.map(quote).join(",")).join("\r\n");
}

export function parseBankTable(table: string[][], tracks: { id: string; name: string }[]): BankImport {
  const [head, ...body] = table;
  if (!head) return { ok: false, errors: ["الملف فارغ."] };

  const index = new Map<string, number>();
  head.forEach((h, i) => index.set(normalizeName(h), i));
  const col = (name: string) => index.get(normalizeName(name));

  const missing = ["رقم الوحدة", "السؤال", "النوع", "الصحيح"].filter((h) => col(h) === undefined);
  if (missing.length) {
    return { ok: false, errors: [`أعمدة ناقصة في الملف: ${missing.join("، ")}. نزّل القالب وانسخ أسئلتك فيه.`] };
  }

  const cell = (row: string[], name: string) => {
    const i = col(name);
    return i === undefined ? "" : toLatinDigits(String(row[i] ?? "")).trim();
  };

  const rows: BankRow[] = [];
  const errors: string[] = [];

  body.forEach((row, i) => {
    if (row.every((c) => String(c ?? "").trim() === "")) return;
    const line = i + 2;
    const fail = (message: string) => errors.push(`السطر ${line}: ${message}`);

    let trackId: string | null = null;
    const trackName = cell(row, "المسار");
    if (trackName) {
      const track = tracks.find((t) => normalizeName(t.name) === normalizeName(trackName));
      if (!track) return fail(`المسار «${trackName}» ليس في البرنامج.`);
      trackId = track.id;
    }

    const unit = Number(cell(row, "رقم الوحدة"));
    if (!Number.isInteger(unit) || unit < 1) return fail("رقم الوحدة عددٌ صحيح من 1.");

    const text = cell(row, "السؤال");
    if (text.length < 3) return fail("نصّ السؤال مطلوب.");

    const type = TYPES[normalizeName(cell(row, "النوع"))];
    if (!type) return fail("النوع: مفرد أو متعدد أو صح وخطأ.");

    const scoreText = cell(row, "الدرجة");
    const score = scoreText === "" ? 1 : Number(scoreText);
    if (!(score > 0)) return fail("الدرجة عددٌ موجب.");

    const correct = cell(row, "الصحيح");
    const base = { track_id: trackId, unit_sequence: unit, text, type, score, answer: cell(row, "الجواب للمحكّم") };

    if (type === "true_false") {
      const tf = normalizeName(correct) === normalizeName("صح") ? "صح" : normalizeName(correct) === normalizeName("خطأ") ? "خطأ" : null;
      if (!tf) return fail("الصحيح في صح وخطأ: «صح» أو «خطأ».");
      rows.push({ ...base, tf_answer: tf, options: [] });
      return;
    }

    const options = Array.from({ length: MAX_OPTIONS }, (_, k) => cell(row, `خيار ${k + 1}`));
    const filled = options.map((t, k) => ({ t, k: k + 1 })).filter((o) => o.t !== "");
    if (filled.length < 2) return fail("خياران على الأقل.");

    const picks = correct.split(/[,،\s]+/).filter(Boolean).map(Number);
    if (picks.length === 0 || picks.some((p) => !filled.some((o) => o.k === p))) {
      return fail("الصحيح: رقم الخيار الصحيح (أو أرقامه مفصولةً بفاصلة) من الخيارات المكتوبة.");
    }
    if (type === "single" && picks.length !== 1) return fail("المفرد له جوابٌ صحيح واحد.");

    rows.push({ ...base, options: filled.map((o) => ({ text: o.t, correct: picks.includes(o.k) })) });
  });

  if (errors.length) {
    const more = errors.length > MAX_ERRORS ? [`و${errors.length - MAX_ERRORS} أخطاء أخرى.`] : [];
    return { ok: false, errors: [...errors.slice(0, MAX_ERRORS), ...more] };
  }
  if (rows.length === 0) return { ok: false, errors: ["لا أسئلة في الملف."] };
  return { ok: true, rows };
}
