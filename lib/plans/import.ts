import { formatNumber, toLatinDigits } from "@/lib/format";
import type { Material, MaterialSection } from "@/lib/programs/material";
import { MAX_DAYS, ordinalOf, trackSize, type PlanDraft, type PlanField, type PlanValue, type TrackShare } from "./engine";

/**
 * استيراد الخطة (`adr/0042`) — منطق خالص بلا قاعدة.
 *
 * **صيغةٌ معيارية واحدة** يتحوّل إليها كل مصدر: JSON يُلصق (ومصدره المعتاد
 * برومبتٌ تولّده المنصة للذكاء الاصطناعي)، وCSV وExcel بتعيين الأعمدة. ثم
 * تتحوّل إلى مسوّدة المحرّر، فتُفحص بالقواعد نفسها وتُحفظ بالدالة نفسها.
 *
 * والمفاتيح بأسماء الحقول لا بمعرّفاتها: الملف يكتبه إنسانٌ أو أداةٌ لا تعرف
 * المعرّفات. والأقسام بأسمائها: «الطهارة ٥» يحوّله المستورد إلى رقمه المتّصل.
 */

// ── الصيغة المعيارية ──

/** طرف نطاق: رقم متّصل، أو قسمٌ ورقمٌ فيه. */
export type ExternalPoint = number | string | { section: string; number: number | string };

export type ExternalValue = {
  amount?: number | string;
  from?: ExternalPoint;
  to?: ExternalPoint;
  /** قسم الطرفين معاً — حين يكون الرقمان في قسم واحد. */
  section?: string;
  value?: number | string;
  repetition?: number | string;
};

export type ExternalPlan = {
  version?: number;
  day_count?: number | string;
  days: { day: number | string; values: Record<string, ExternalValue> }[];
};

export type ImportResult =
  | { ok: true; draft: PlanDraft; notes: string[] }
  | { ok: false; errors: string[] };

const n = (value: number) => formatNumber(value);
const MAX_ERRORS = 20;

// ── الأسماء ──

/**
 * اسمٌ للمقارنة: بلا تشكيل ولا تطويل، وهمزات الألف ألفاً، والتاء المربوطة هاءً،
 * والألف المقصورة ياءً، وبلا «ال» في أول الكلمات — فـ«الحفظ» = «حفظ»،
 * و«الأربعون في الطهارة» تحوي «الطهارة».
 */
export function normalizeName(text: string): string {
  return toLatinDigits(text)
    // علامات الاتجاه والمسافات الصفرية تأتي مع النسخ من الجداول ولا تُرى.
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .split(/\s+/)
    .map((word) => word.replace(/^ال(?=.{2,})/, ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim();
}

/**
 * الكلمات كاملةً لا حروفاً: «حجة الوداع» لا تطابق «الحج»، و«الجزء 11» لا تطابق
 * «الجزء 1». والأطول تطابقاً يفوز، والتعادل لا يُختار منه شيء — فالمستورد
 * يُخطئ صراحةً بدل أن يصيب خطأً صامتاً.
 */
function bestByWords<T>(items: T[], words: string[], nameOf: (item: T) => string): T | null {
  let best: T | null = null;
  let bestSize = 0;
  let tie = false;
  for (const item of items) {
    const own = normalizeName(nameOf(item)).split(" ").filter(Boolean);
    if (own.length === 0 || !own.every((w) => words.includes(w))) continue;
    if (own.length > bestSize) {
      best = item;
      bestSize = own.length;
      tie = false;
    } else if (own.length === bestSize) tie = true;
  }
  return tie ? null : best;
}

/** المطابق تماماً، وإلا الذي تقع كلماته كلها في الاسم — أطولها، بلا تعادل. */
function findByName<T>(items: T[], name: string, nameOf: (item: T) => string): T | null {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  const exact = items.filter((item) => normalizeName(nameOf(item)) === wanted);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  return bestByWords(items, wanted.split(" "), nameOf);
}

export function findField(fields: PlanField[], name: string): PlanField | null {
  return findByName(fields, name, (f) => f.label);
}

export function findSection(material: Material, name: string): MaterialSection | null {
  return findByName(material.sections, name, (s) => s.name);
}

// ── الأرقام ──

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const text = toLatinDigits(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function positiveInt(raw: unknown): number | null {
  const value = toNumber(raw);
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

/** الطرف بالرقم المتّصل — أو رسالة بما تعذّر. */
function resolvePoint(point: ExternalPoint | undefined, section: string | undefined, material: Material): number | string {
  if (point === undefined || point === null || point === "") return "الطرف غائب";
  if (typeof point === "object") {
    const number = positiveInt(point.number);
    if (number === null) return "رقمٌ في القسم غير صالح";
    return inSection(point.section, number, material);
  }
  const number = positiveInt(point);
  if (number === null) return `«${String(point)}» ليس رقماً صحيحاً موجباً`;
  if (section && section.trim()) return inSection(section, number, material);
  return number;
}

function inSection(name: string, number: number, material: Material): number | string {
  if (!name.trim()) return "عمود القسم فارغ — اكتب قسم الرقم";
  const section = findSection(material, name);
  if (!section) return `القسم «${name}» غير معروف في المادة`;
  if (number > section.count) return `${n(number)} بعد آخر «${section.name}» (${n(section.count)})`;
  return section.start + number - 1;
}

/**
 * الصيغة المعيارية ← مسوّدة المحرّر.
 *
 * التراكمي يُقبل مقداراً أو «من/إلى»: والثاني يُحسب مقداره على رتبة المسار،
 * ويُتحقّق أنه يبدأ حيث انتهى ما قبله — فالخطة التي يكتب معدّها نطاقات الحفظ
 * صريحةً تُقرأ كما هي، ويُكشف فيها ما تخطّى أو تكرّر.
 */
export function parseExternalPlan(
  input: unknown,
  fields: PlanField[],
  material: Material,
  track: TrackShare | null,
): ImportResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const fail = (message: string) => {
    if (errors.length < MAX_ERRORS) errors.push(message);
  };

  if (!input || typeof input !== "object" || !Array.isArray((input as ExternalPlan).days)) {
    return { ok: false, errors: ["الصيغة غير صالحة: يلزم كائنٌ فيه «days» قائمة أيام."] };
  }
  const plan = input as ExternalPlan;
  const values: PlanValue[] = [];
  const cumulativeEnd = new Map<string, number>();
  let maxDay = 0;

  const days = [...plan.days].sort((a, b) => (toNumber(a.day) ?? 0) - (toNumber(b.day) ?? 0));
  for (const entry of days) {
    const day = positiveInt(entry?.day);
    if (day === null) {
      fail(`يومٌ برقمٍ غير صالح: «${String(entry?.day)}».`);
      continue;
    }
    if (day > MAX_DAYS) {
      // عمودٌ من تواريخ Excel (أرقامٌ حول ٤٥٠٠٠) يُقرأ أياماً — فيُرفض قبل أن يُبنى له جدول.
      fail(`اليوم ${n(day)} بعد حدّ الخطة (${n(MAX_DAYS)} يوماً) — تحقّق من عمود اليوم.`);
      continue;
    }
    maxDay = Math.max(maxDay, day);
    if (!entry.values || typeof entry.values !== "object") continue;

    for (const [key, raw] of Object.entries(entry.values)) {
      if (!raw || typeof raw !== "object") continue;
      const field = findField(fields, key);
      if (!field) {
        fail(`اليوم ${n(day)}: الحقل «${key}» ليس من حقول البرنامج.`);
        continue;
      }
      const at = `اليوم ${n(day)}: «${field.label}»`;
      const value: PlanValue = { day, fieldId: field.id };

      if (field.kind === "counted") {
        const v = toNumber(raw.value ?? raw.amount);
        if (v === null || v <= 0) {
          fail(`${at} يحتاج قيمة موجبة.`);
          continue;
        }
        value.value = v;
      } else if (field.kind === "ranged" && raw.amount !== undefined && raw.amount !== "") {
        const amount = positiveInt(raw.amount);
        if (amount === null) {
          fail(`${at} مقدارٌ غير صالح.`);
          continue;
        }
        value.amount = amount;
        cumulativeEnd.set(field.id, (cumulativeEnd.get(field.id) ?? 0) + amount);
      } else {
        const from = resolvePoint(raw.from, raw.section, material);
        const to = resolvePoint(raw.to, raw.section, material);
        if (typeof from === "string" || typeof to === "string") {
          fail(`${at}: ${typeof from === "string" ? from : to}.`);
          continue;
        }
        // الترتيب على رتبة المسار إن عُرف: نصيبٌ يقدّم باباً متأخراً في الترقيم يجعل «من ٦١ إلى ٥» صحيحاً.
        const ordered =
          track && field.isMaterialLinked
            ? (ordinalOf(track, from) ?? Number.POSITIVE_INFINITY) <= (ordinalOf(track, to) ?? Number.NEGATIVE_INFINITY)
            : from <= to;
        if (!ordered) {
          fail(`${at}: البداية بعد النهاية${track && field.isMaterialLinked ? " في ترتيب المسار، أو خارج نصيبه" : ""}.`);
          continue;
        }
        if (field.kind === "explicit") {
          value.from = from;
          value.to = to;
        } else {
          // تراكمي بـ«من/إلى»: المقدار والاتصال على رتبة المسار إن عُرف.
          const a = track && field.isMaterialLinked ? ordinalOf(track, from) : from;
          const b = track && field.isMaterialLinked ? ordinalOf(track, to) : to;
          if (a === null || b === null) {
            fail(`${at}: خارج نصيب المسار.`);
            continue;
          }
          const expected = (cumulativeEnd.get(field.id) ?? 0) + 1;
          if (a !== expected) {
            fail(`${at} يبدأ من الموضع ${n(a)} والمتوقع ${n(expected)} — الحفظ يبدأ حيث انتهى ما قبله.`);
            continue;
          }
          value.amount = b - a + 1;
          cumulativeEnd.set(field.id, b);
        }
      }

      if (raw.repetition !== undefined && raw.repetition !== null && raw.repetition !== "") {
        const repetition = positiveInt(raw.repetition);
        if (repetition === null || repetition > 1000) fail(`${at}: التكرار بين 1 و1000.`);
        else value.repetition = repetition;
      }
      if (values.some((v) => v.day === day && v.fieldId === field.id)) {
        fail(`${at} مكرّر.`);
        continue;
      }
      values.push(value);
    }
  }

  const declared = plan.day_count !== undefined ? positiveInt(plan.day_count) : null;
  if (plan.day_count !== undefined && declared === null) fail("«day_count» ليس عدداً صحيحاً موجباً.");
  const dayCount = declared ?? maxDay;
  if (declared !== null && maxDay > declared) fail(`في الملف اليوم ${n(maxDay)} و«day_count» ${n(declared)}.`);
  if (dayCount < 1) fail("لا أيام في الملف.");

  if (errors.length > 0) return { ok: false, errors };
  if (track) {
    const base = fields.find((f) => f.isBase);
    if (base) {
      const total = values.filter((v) => v.fieldId === base.id).reduce((s, v) => s + (v.amount ?? 0), 0);
      notes.push(`مجموع «${base.label}» ${n(total)} من نصيب «${track.name}» (${n(trackSize(track))}).`);
    }
  }
  notes.push(`${n(dayCount)} يوماً · ${n(values.length)} قيمة.`);
  return { ok: true, draft: { dayCount, values }, notes };
}

// ── CSV ──

/** جدولٌ من نصّ CSV: الفاصل يُكتشف من السطر الأول (، , ; أو تبويب)، والاقتباس يُحترم. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  // الفاصل من أول الأسطر لا من أولها وحده: سطر عنوانٍ فوق الجدول لا فواصل فيه.
  const sample = clean.split(/\r?\n/, 6).map((line) => line.replace(/"[^"]*"/g, ""));
  const candidates = [",", "،", ";", "\t"];
  const width = (d: string) => Math.max(...sample.map((line) => line.split(d).length));
  const delimiter = candidates.reduce((best, d) => (width(d) > width(best) ? d : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    // الاقتباس يُفتح في أول الخلية وحدها: «"» في وسطها حرفٌ منها.
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ── تعيين الأعمدة ──

export const COLUMN_ROLES = ["ignore", "day", "amount", "from", "to", "value", "repetition", "section", "section_from", "section_to"] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

export const ROLE_LABEL: Record<ColumnRole, string> = {
  ignore: "تجاهل",
  day: "اليوم",
  amount: "المقدار",
  from: "من",
  to: "إلى",
  value: "القيمة",
  repetition: "التكرار",
  section: "قسم الطرفين",
  section_from: "قسم البداية",
  section_to: "قسم النهاية",
};

/** دورُ عمودٍ لحقل — `fieldId` فارغ لـ«تجاهل» و«اليوم». */
export type ColumnMap = { header: string; role: ColumnRole; fieldId: string | null };
export type Mapping = { headerRow: boolean; columns: ColumnMap[] };

/** الأدوار الممكنة لحقل بحسب نوعه. */
export function rolesFor(field: PlanField): ColumnRole[] {
  if (field.kind === "counted") return ["value", "repetition"];
  if (field.kind === "explicit") return ["from", "to", "section", "section_from", "section_to", "repetition"];
  return ["amount", "from", "to", "section", "section_from", "section_to", "repetition"];
}

const SECTION_WORDS = ["ماده", "باب", "قسم", "كتاب", "سوره", "فصل", "جزء"];

/**
 * اقتراحُ تعيينٍ من العناوين: «الحفظ من» ← «حفظ»/من، و«تكرار الربط» ← «ربط»/تكرار،
 * و«المادة» أو «الباب» ← قسم الطرفين للحقل الأساس، و«اليوم» ← اليوم. والمقترح
 * يُراجَع ويُعدَّل قبل القراءة.
 */
export function suggestMapping(headers: string[], fields: PlanField[]): Mapping {
  const base = fields.find((f) => f.isBase) ?? null;
  const columns = headers.map((header): ColumnMap => {
    const words = normalizeName(header).split(" ");
    const has = (w: string) => words.includes(w);
    if (has("يوم") && words.length <= 2) return { header, role: "day", fieldId: null };
    if (has("ملاحظات") || has("ملاحظه")) return { header, role: "ignore", fieldId: null };

    const field = bestByWords(fields, words, (f) => f.label);
    if (!field) {
      if (SECTION_WORDS.some(has) && base) return { header, role: "section", fieldId: base.id };
      return { header, role: "ignore", fieldId: null };
    }
    const roles = rolesFor(field);
    const pick = (role: ColumnRole): ColumnMap => ({ header, role: roles.includes(role) ? role : "ignore", fieldId: roles.includes(role) ? field.id : null });
    if (has("تكرار")) return pick("repetition");
    if (has("من") && SECTION_WORDS.some(has)) return pick("section_from");
    if ((has("الي") || has("الى") || has("حتي")) && SECTION_WORDS.some(has)) return pick("section_to");
    if (has("من")) return pick("from");
    if (has("الي") || has("الى") || has("حتي")) return pick("to");
    if (SECTION_WORDS.some(has)) return pick("section");
    return pick(field.kind === "counted" ? "value" : "amount");
  });
  return { headerRow: true, columns };
}

/**
 * تنبيهات التعيين قبل القراءة. **أخطرها حقلٌ مرتبط بالمادة بلا عمود قسم** في
 * مادةٍ مقسّمة: أرقامه تُقرأ متّصلة، فإن كان الملف يرقّم كل باب من ١ صارت
 * «الربط ٣٨–٤٤» من الباب الثالث نطاقاً من الباب الأول — صحيحاً شكلاً خاطئاً
 * معنىً، ولا يكشفه فحص.
 */
export function mappingWarnings(mapping: Mapping, fields: PlanField[], material: Material): string[] {
  const warnings: string[] = [];
  if (!mapping.columns.some((c) => c.role === "day")) {
    warnings.push("لا عمود لليوم: يُؤخذ رقم اليوم من ترتيب الصفّ.");
  }
  if (material.sections.length > 1) {
    for (const field of fields) {
      if (field.kind === "counted" || !field.isMaterialLinked) continue;
      const cols = mapping.columns.filter((c) => c.fieldId === field.id);
      const numbers = cols.some((c) => c.role === "from" || c.role === "to");
      const sections = cols.some((c) => c.role === "section" || c.role === "section_from" || c.role === "section_to");
      if (numbers && !sections) {
        warnings.push(
          `«${field.label}» بلا عمود قسم: تُقرأ أرقامه متّصلةً عبر المادة كلها. إن كان الملف يرقّم كل ${material.forms.sectionLabel?.trim() || "قسم"} من 1 فعيّن عمود قسمه، أو استورد بالذكاء الاصطناعي.`,
        );
      }
    }
  }
  return warnings;
}

/** صفوف الجدول بتعيينها ← الصيغة المعيارية. واليوم من عموده، وإلا من ترتيب الصف. */
export function rowsToExternal(rows: unknown[][], mapping: Mapping, fields: PlanField[]): ExternalPlan {
  const body = mapping.headerRow ? rows.slice(1) : rows;
  const dayCol = mapping.columns.findIndex((c) => c.role === "day");
  const days: ExternalPlan["days"] = [];
  const cellText = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v).trim());

  // خلايا الأقسام المدموجة في Excel تحمل القيمة في أول صفوفها وحده — فتمتدّ إلى ما تحتها.
  const lastSection = new Map<number, string>();
  const isSection = (role: ColumnRole) => role === "section" || role === "section_from" || role === "section_to";

  body.forEach((row, index) => {
    if (!row.some((c) => cellText(c) !== "")) return;
    const day = dayCol >= 0 ? cellText(row[dayCol]) : String(index + 1);
    const cells = mapping.columns.map((c, i) => {
      let cell = cellText(row[i]);
      if (isSection(c.role)) {
        if (cell === "") cell = lastSection.get(i) ?? "";
        else lastSection.set(i, cell);
      }
      return { ...c, cell };
    });
    const values: Record<string, ExternalValue> = {};
    for (const field of fields) {
      const mapped = cells.filter((c) => c.fieldId === field.id && c.role !== "ignore");
      const cols = mapped.filter((c) => c.cell !== "");
      if (!cols.some((c) => ["amount", "from", "to", "value"].includes(c.role))) continue;
      const get = (role: ColumnRole) => cols.find((c) => c.role === role)?.cell;
      const has = (role: ColumnRole) => mapped.some((c) => c.role === role);
      // عمود القسم المعيَّن لا يُسقَط إن فرغ: فارغه خطأٌ يُذكر، لا رقمٌ متّصل يُفترض.
      const sectionFrom = has("section_from") || has("section") ? (get("section_from") ?? get("section") ?? "") : undefined;
      const sectionTo = has("section_to") || has("section") ? (get("section_to") ?? get("section") ?? "") : undefined;
      const value: ExternalValue = {};
      if (get("amount") !== undefined) value.amount = get("amount");
      if (get("value") !== undefined) value.value = get("value");
      const from = get("from");
      const to = get("to");
      if (from !== undefined) value.from = sectionFrom !== undefined ? { section: sectionFrom, number: from } : from;
      if (to !== undefined) value.to = sectionTo !== undefined ? { section: sectionTo, number: to } : to;
      if (get("repetition") !== undefined) value.repetition = get("repetition");
      values[field.label] = value;
    }
    days.push({ day, values });
  });
  return { version: 1, days };
}

// ── البرومبت ──

/**
 * نصٌّ يضعه المُعِدّ مع ملفه في أي أداة ذكاء اصطناعي، فتُخرج الصيغة المعيارية.
 * يحمل ما لا يعرفه أحدٌ خارج المنصة: الأقسام وأرقامها المتّصلة، والحقول
 * وأنواعها، ونصيب كل مسار — وقواعد التحويل ومثالاً.
 *
 * الأرقام فيه لاتينية: يُقرأ آلياً ويُنسخ منه إلى JSON.
 */
export function buildPrompt(input: {
  programName: string;
  material: Material;
  fields: PlanField[];
  tracks: TrackShare[];
}): string {
  const { programName, material, fields, tracks } = input;
  const sectionLabel = material.forms.sectionLabel?.trim() || "القسم";
  const unit = material.forms.singular?.trim() || "الوحدة";
  const lines: string[] = [];

  lines.push(
    `أنت تحوّل خطة يومية أعدّها معلّمٌ في ملفٍ (جدول أو نص) إلى صيغة JSON تستوردها منصة برنامج «${programName}».`,
    "أخرج JSON صالحاً فقط، بلا شرح قبله ولا بعده، وبلا علامات Markdown.",
    "",
    "## المادة",
  );
  if (material.sections.length === 0) {
    lines.push(`وحدات المادة مرقّمة ترقيماً متّصلاً من 1. اكتب الأرقام كما هي.`);
  } else {
    lines.push(`المادة مقسّمة إلى أقسام (${sectionLabel})، ووحداتها (${unit}) مرقّمة ترقيماً متّصلاً عبر الأقسام:`);
    for (const s of material.sections) {
      lines.push(`- ${s.name}: ${s.count} — الأرقام المتّصلة ${s.start}–${s.start + s.count - 1}`);
    }
  }

  lines.push("", "## الحقول — مفاتيح «values» بأسمائها هذه حرفياً");
  for (const f of [...fields].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (f.kind === "ranged") {
      lines.push(
        `- "${f.label}": تراكمي${f.isBase ? " (الحقل الأساس)" : ""} — جديدٌ يتقدّم يوماً بعد يوم. اكتب {"from": أول وحدة, "to": آخر وحدة} بالترقيم المتّصل، أو {"amount": عدد الوحدات}.`,
      );
    } else if (f.kind === "explicit") {
      lines.push(
        `- "${f.label}": نطاق صريح — يعود على ما سبق. اكتب {"from": أول وحدة, "to": آخر وحدة} بالترقيم المتّصل${f.isConstrained ? "، ولا يتجاوز ما بلغه الحقل الأساس حتى ذلك اليوم" : ""}.`,
      );
    } else {
      lines.push(`- "${f.label}": عددي — اكتب {"value": العدد}${f.countUnit ? ` بوحدة «${f.countUnit}»` : ""}.`);
    }
  }
  lines.push('ولكل حقلٍ مفتاحٌ اختياري "repetition": عدد مرات الترديد إن ذكره الملف لذلك اليوم.');

  if (tracks.length > 0) {
    lines.push("", "## نصيب المسار الذي تُبنى له الخطة");
    for (const t of tracks) {
      const parts = [...t.ranges].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => `${r.from}–${r.to}`);
      lines.push(`- ${t.name}: ${parts.join(" ثم ")} (${trackSize(t)} وحدة)`);
    }
  }

  const example = material.sections[1] ?? material.sections[0];
  lines.push(
    "",
    "## القواعد",
    "1. حوّل رقم الوحدة داخل قسمها إلى الرقم المتّصل: الرقم المتّصل = أول رقمٍ متّصل في القسم + رقمها في القسم − 1." +
      (example ? ` مثال: الوحدة 5 من «${example.name}» = ${example.start} + 5 − 1 = ${example.start + 4}.` : ""),
    "2. إن بدأ النطاق في قسم وانتهى في الذي بعده، فاقرأ الملاحظات أو السياق لتعرف قسم كل طرف، واكتب الطرفين بالرقم المتّصل.",
    "3. اليوم الذي لا نشاط فيه لحقلٍ لا تكتب له ذلك الحقل.",
    "4. لا تخترع أياماً ولا قيماً ليست في الملف، ولا تحذف منها شيئاً.",
    '5. "day_count" عدد أيام الخطة كلها.',
    "",
    "## الصيغة",
  );

  const sample: ExternalPlan = { version: 1, day_count: 40, days: [] };
  const firstValues: Record<string, ExternalValue> = {};
  for (const f of fields) {
    if (f.kind === "counted") firstValues[f.label] = { value: 1 };
    else if (f.kind === "ranged") firstValues[f.label] = { from: 1, to: 2, ...(f.defaultRepetition ? { repetition: f.defaultRepetition } : {}) };
    else firstValues[f.label] = { from: 1, to: 2 };
  }
  sample.days.push({ day: 1, values: firstValues });
  lines.push(JSON.stringify(sample, null, 2));
  return lines.join("\n");
}

/** قالبٌ محفوظ كما قُرئ من القاعدة — يُتحقّق منه قبل أن يُطبَّق، فالمحفوظ بطريقٍ آخر لا يُسقط اللوحة. */
export function parseMapping(raw: unknown): Mapping | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as { headerRow?: unknown; columns?: unknown };
  if (typeof m.headerRow !== "boolean" || !Array.isArray(m.columns)) return null;
  const columns: ColumnMap[] = [];
  for (const c of m.columns as unknown[]) {
    if (!c || typeof c !== "object") return null;
    const col = c as { header?: unknown; role?: unknown; fieldId?: unknown };
    if (typeof col.header !== "string") return null;
    if (typeof col.role !== "string" || !(COLUMN_ROLES as readonly string[]).includes(col.role)) return null;
    if (col.fieldId !== null && typeof col.fieldId !== "string") return null;
    columns.push({ header: col.header, role: col.role as ColumnRole, fieldId: col.fieldId as string | null });
  }
  return { headerRow: m.headerRow, columns };
}
