import { formatNumber } from "@/lib/format";
import { rangeText, type Material } from "@/lib/programs/material";

/**
 * محرّك الخطة — منطق خالص بلا قاعدة (`adr/0036` · `0037`).
 *
 * **مرآةٌ لفحص القاعدة لا بديلٌ عنه.** `fn_save_plan` و`fn_plan_issues` هما
 * الفاصل، وهذه تُري المُعِدّ الملاحظات وهو يكتب — في المحرّر وفي معاينة
 * الاستيراد — قبل أن يرسل شيئاً. والقواعد هنا هي نفسها هناك، بالرسائل نفسها.
 */

/** `ranged` اسم «التراكمي» في القاعدة إلى أن يُعاد بناء النوع (الهجرة ٠٥٩). */
export type FieldKind = "ranged" | "explicit" | "counted";

export type PlanField = {
  id: string;
  label: string;
  kind: FieldKind;
  isBase: boolean;
  isConstrained: boolean;
  isMaterialLinked: boolean;
  isRequired: boolean;
  countUnit: string | null;
  defaultRepetition: number | null;
  sortOrder: number;
};

/** قيمة حقل في يوم — بالرقم المتّصل للنطاق الصريح (`adr/0039`). */
export type PlanValue = {
  day: number;
  fieldId: string;
  amount?: number;
  from?: number;
  to?: number;
  value?: number;
  repetition?: number;
};

export type PlanDraft = { dayCount: number; values: PlanValue[] };

export type TrackShare = {
  id: string;
  name: string;
  ranges: { from: number; to: number; sortOrder: number }[];
};

export type Issue = {
  trackId: string | null;
  day: number | null;
  fieldId: string | null;
  severity: "error" | "warning";
  message: string;
};

export const MAX_DAYS = 366;

const n = (value: number) => formatNumber(value);

// ── نصيب المسار ورتبته — مرآة `fn_track_*` ──

function ordered(track: TrackShare) {
  return [...track.ranges].sort((a, b) => a.sortOrder - b.sortOrder || a.from - b.from);
}

export function trackSize(track: TrackShare): number {
  return track.ranges.reduce((sum, r) => sum + (r.to - r.from + 1), 0);
}

/** رتبة الوحدة في نصيب المسار، أو `null` إن كانت خارجه. */
export function ordinalOf(track: TrackShare, sequence: number): number | null {
  let before = 0;
  for (const r of ordered(track)) {
    if (sequence >= r.from && sequence <= r.to) return before + (sequence - r.from + 1);
    before += r.to - r.from + 1;
  }
  return null;
}

/** الرقم المتّصل عند رتبة، أو `null` بعد آخر النصيب. */
export function unitAt(track: TrackShare, ordinal: number): number | null {
  let before = 0;
  for (const r of ordered(track)) {
    const size = r.to - r.from + 1;
    if (ordinal > before && ordinal <= before + size) return r.from + (ordinal - before - 1);
    before += size;
  }
  return null;
}

/** نطاق رتبٍ مقطوعاً على مقاطع النصيب — «من ٤٠ إلى ٨٢» كذبٌ إن كان بينهما ما ليس منه. */
export function ordinalSpan(track: TrackShare, from: number, to: number): { from: number; to: number }[] {
  const parts: { from: number; to: number }[] = [];
  let before = 0;
  for (const r of ordered(track)) {
    const size = r.to - r.from + 1;
    const lo = Math.max(from, before + 1);
    const hi = Math.min(to, before + size);
    if (lo <= hi) parts.push({ from: r.from + (lo - before - 1), to: r.from + (hi - before - 1) });
    before += size;
  }
  return parts;
}

// ── القيم ──

export function fieldValues(draft: PlanDraft, fieldId: string): PlanValue[] {
  return draft.values.filter((v) => v.fieldId === fieldId).sort((a, b) => a.day - b.day);
}

export function valueAt(draft: PlanDraft, fieldId: string, day: number): PlanValue | undefined {
  return draft.values.find((v) => v.fieldId === fieldId && v.day === day);
}

/** نطاق التراكمي في كل يوم بالرتبة: يبدأ حيث انتهى ما قبله في الخطة. */
export function cumulativeOrdinals(draft: PlanDraft, fieldId: string): Map<number, { from: number; to: number }> {
  const out = new Map<number, { from: number; to: number }>();
  let next = 1;
  for (const v of fieldValues(draft, fieldId)) {
    const amount = v.amount ?? 0;
    if (amount <= 0) continue;
    out.set(v.day, { from: next, to: next + amount - 1 });
    next += amount;
  }
  return out;
}

/** ما بلغه الأساس حتى نهاية يومٍ — بالرتبة. */
export function baseReach(draft: PlanDraft, baseId: string, day: number): number {
  return fieldValues(draft, baseId)
    .filter((v) => v.day <= day)
    .reduce((sum, v) => sum + (v.amount ?? 0), 0);
}

/** الحدود نفسها التي تفرضها القاعدة: الأعداد صحيحة دون مليون، والقيمة دون عشرة ملايين. */
export const MAX_NUMBER = 999_999;
export const MAX_VALUE = 9_999_999;

const count = (x: number | undefined): boolean => x !== undefined && Number.isInteger(x) && x > 0 && x <= MAX_NUMBER;

function shapeOk(field: PlanField, v: PlanValue): boolean {
  const has = (x: number | undefined) => x !== undefined && x !== null;
  if (field.kind === "ranged") return count(v.amount) && !has(v.from) && !has(v.to) && !has(v.value);
  if (field.kind === "explicit") {
    return count(v.from) && count(v.to) && v.to! >= v.from! && !has(v.amount) && !has(v.value);
  }
  return has(v.value) && Number.isFinite(v.value) && v.value! > 0 && v.value! <= MAX_VALUE && !has(v.amount) && !has(v.from) && !has(v.to);
}

function shapeMessage(field: PlanField): string {
  if (field.kind === "ranged") return "يحتاج مقداراً موجباً وحده";
  if (field.kind === "explicit") return "يحتاج «من» و«إلى» موجبين، والبداية لا تزيد على النهاية";
  return "يحتاج قيمة موجبة وحدها";
}

/**
 * ملاحظات الخطة — القواعد نفسها التي تفحص بها القاعدة، في ترتيبها:
 * الصيغة، ثم الأيام، ثم كل مسار يستعمل الخطة بنصيبه.
 */
export function planIssues(draft: PlanDraft, fields: PlanField[], tracks: TrackShare[]): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(fields.map((f) => [f.id, f]));
  const err = (message: string, at: Partial<Issue> = {}) =>
    issues.push({ trackId: null, day: null, fieldId: null, severity: "error", message, ...at });

  if (!Number.isInteger(draft.dayCount) || draft.dayCount < 1 || draft.dayCount > MAX_DAYS) {
    err(`عدد أيام الخطة بين 1 و${n(MAX_DAYS)}`);
    return issues;
  }

  const seen = new Set<string>();
  for (const v of draft.values) {
    const field = byId.get(v.fieldId);
    if (!field) {
      err("في الخطة حقلٌ ليس من حقول هذا البرنامج", { day: v.day });
      continue;
    }
    if (!Number.isInteger(v.day) || v.day < 1 || v.day > draft.dayCount) {
      err(`قيمة في اليوم ${n(v.day)} خارج أيام الخطة (1–${n(draft.dayCount)})`, { day: v.day, fieldId: v.fieldId });
      continue;
    }
    const key = `${v.day}|${v.fieldId}`;
    if (seen.has(key)) err(`اليوم ${n(v.day)}: «${field.label}» مكرّر`, { day: v.day, fieldId: v.fieldId });
    seen.add(key);
    if (!shapeOk(field, v)) {
      err(`اليوم ${n(v.day)}: «${field.label}» ${shapeMessage(field)}`, { day: v.day, fieldId: v.fieldId });
    }
    if (v.repetition !== undefined && (!Number.isInteger(v.repetition) || v.repetition < 1 || v.repetition > 1000)) {
      err(`اليوم ${n(v.day)}: التكرار بين 1 و1000`, { day: v.day, fieldId: v.fieldId });
    }
  }

  for (let day = 1; day <= draft.dayCount; day++) {
    const required = draft.values.some((v) => v.day === day && byId.get(v.fieldId)?.isRequired);
    if (!required) err(`اليوم ${n(day)} بلا نشاط إلزامي`, { day });
  }

  const base = fields.find((f) => f.isBase);
  const constrainedUsed = draft.values.some((v) => byId.get(v.fieldId)?.isConstrained);
  if (!base && constrainedUsed) err("في الخطة حقلٌ مقيَّد بالأساس، ولا حقل أساس في البرنامج");

  const multi = tracks.length > 1;
  for (const track of tracks) {
    const size = trackSize(track);
    const prefix = multi ? `${track.name}: ` : "";

    for (const field of fields) {
      if (field.kind !== "ranged" || !field.isMaterialLinked) continue;
      const total = fieldValues(draft, field.id).reduce((s, v) => s + (v.amount ?? 0), 0);
      if (total === 0) continue;
      if (total > size) {
        issues.push({
          trackId: track.id,
          day: null,
          fieldId: field.id,
          severity: "error",
          message: `${prefix}مجموع مقادير «${field.label}» (${n(total)}) يتجاوز نصيب المسار (${n(size)})`,
        });
      } else if (field.isBase && total < size) {
        issues.push({
          trackId: track.id,
          day: null,
          fieldId: field.id,
          severity: "warning",
          message: `${prefix}الخطة لا تغطّي نصيب المسار كله: مجموع مقادير «${field.label}» ${n(total)} من ${n(size)}`,
        });
      }
    }

    for (const v of draft.values) {
      const field = byId.get(v.fieldId);
      if (!field || field.kind !== "explicit" || v.from === undefined || v.to === undefined) continue;
      if (field.isMaterialLinked) {
        const a = ordinalOf(track, v.from);
        const b = ordinalOf(track, v.to);
        if (a === null || b === null || a > b) {
          issues.push({
            trackId: track.id,
            day: v.day,
            fieldId: v.fieldId,
            severity: "error",
            message: `${prefix}اليوم ${n(v.day)}: «${field.label}» ${a === null || b === null ? "خارج نصيب المسار" : "بدايته بعد نهايته في ترتيب المسار"}`,
          });
          continue;
        }
        if (field.isConstrained && base && b > baseReach(draft, base.id, v.day)) {
          issues.push({
            trackId: track.id,
            day: v.day,
            fieldId: v.fieldId,
            severity: "error",
            message: `${prefix}اليوم ${n(v.day)}: «${field.label}» يتجاوز ما بلغه الحفظ في هذا اليوم`,
          });
        }
      }
    }
  }

  return issues;
}

// ── الصيغة المعيارية للكتابة — ما يقرؤه `fn_save_plan` ──

export type PlanPayload = {
  day_count: number;
  values: {
    day: number;
    field_id: string;
    amount?: number;
    from?: number;
    to?: number;
    value?: number;
    repetition?: number;
  }[];
};

export function toPayload(draft: PlanDraft): PlanPayload {
  return {
    day_count: draft.dayCount,
    values: draft.values
      .filter((v) => v.day >= 1 && v.day <= draft.dayCount)
      .map((v) => {
        const out: PlanPayload["values"][number] = { day: v.day, field_id: v.fieldId };
        if (v.amount !== undefined) out.amount = v.amount;
        if (v.from !== undefined) out.from = v.from;
        if (v.to !== undefined) out.to = v.to;
        if (v.value !== undefined) out.value = v.value;
        if (v.repetition !== undefined) out.repetition = v.repetition;
        return out;
      }),
  };
}

export function fromPayload(payload: PlanPayload): PlanDraft {
  return {
    dayCount: payload.day_count,
    values: payload.values.map((v) => {
      const out: PlanValue = { day: v.day, fieldId: v.field_id };
      if (v.amount !== undefined && v.amount !== null) out.amount = Number(v.amount);
      if (v.from !== undefined && v.from !== null) out.from = Number(v.from);
      if (v.to !== undefined && v.to !== null) out.to = Number(v.to);
      if (v.value !== undefined && v.value !== null) out.value = Number(v.value);
      if (v.repetition !== undefined && v.repetition !== null) out.repetition = Number(v.repetition);
      return out;
    }),
  };
}

// ── ما يراه المشارك ──

export type DayTask = {
  field: PlanField;
  /** نصّ النطاق أو العدد كما يُعرض — مقطوعاً على مقاطع النصيب. */
  lines: string[];
  repetition: number | null;
};

/**
 * نصّ قيمة حقلٍ في يوم على مسارٍ بعينه — مقطوعاً على مقاطع النصيب. والفارغ:
 * لا قيمة للحقل في ذلك اليوم.
 */
/** جزءٌ من نطاقٍ كما يُعرض — وأرقامه المتّصلة لنصوص الوحدات إن كان على المادة. */
export type SpanPart = { text: string; from: number | null; to: number | null };

/**
 * نطاقٌ على مسار: بالرتبة في الحقل المرتبط بالمادة — مقطوعاً على مقاطع نصيبه —
 * وبالأرقام كما هي في غيره. المعاينة وشاشة المشارك تصوغان به، فما يراه
 * المُعِدّ هو ما يراه المشارك.
 */
export function spanParts(
  isMaterialLinked: boolean,
  track: TrackShare,
  material: Material,
  from: number | null,
  to: number | null,
): SpanPart[] {
  if (from === null || to === null || from > to) return [{ text: "—", from: null, to: null }];
  if (!isMaterialLinked) {
    return [{ text: from === to ? n(from) : `من ${n(from)} إلى ${n(to)}`, from: null, to: null }];
  }
  const parts = ordinalSpan(track, from, to);
  if (parts.length === 0) return [{ text: "بعد آخر نصيب المسار", from: null, to: null }];
  return parts.map((p) => ({ text: rangeText(material, p.from, p.to), from: p.from, to: p.to }));
}

/** «١٥ صفحة» — قيمة الحقل العددي بوحدته. */
export function countedText(value: number | null | undefined, unit: string | null): string {
  return value === null || value === undefined ? "—" : `${n(value)}${unit ? ` ${unit}` : ""}`;
}

/** نصّ حقلٍ في يومٍ على مسار — سطرٌ لكل مقطع. */
export function fieldLines(
  draft: PlanDraft,
  field: PlanField,
  track: TrackShare,
  material: Material,
  day: number,
): string[] {
  const v = valueAt(draft, field.id, day);
  if (!v) return [];
  if (field.kind === "counted") return [countedText(v.value, field.countUnit)];
  if (field.kind === "ranged") {
    const r = cumulativeOrdinals(draft, field.id).get(day);
    return spanParts(field.isMaterialLinked, track, material, r?.from ?? null, r?.to ?? null).map((p) => p.text);
  }
  if (v.from === undefined || v.to === undefined) return ["—"];
  if (!field.isMaterialLinked) return spanParts(false, track, material, v.from, v.to).map((p) => p.text);
  const ordFrom = ordinalOf(track, v.from);
  const ordTo = ordinalOf(track, v.to);
  if (ordFrom === null || ordTo === null) return ["خارج نصيب المسار"];
  return spanParts(true, track, material, ordFrom, ordTo).map((p) => p.text);
}

/** واجب يومٍ من الخطة على مسارٍ بعينه — للمعاينة، بالصياغة نفسها التي يراها المشارك. */
export function dayTasks(
  draft: PlanDraft,
  fields: PlanField[],
  track: TrackShare,
  material: Material,
  day: number,
): DayTask[] {
  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ar"));
  const out: DayTask[] = [];
  for (const field of sorted) {
    const v = valueAt(draft, field.id, day);
    if (!v) continue;
    out.push({ field, lines: fieldLines(draft, field, track, material, day), repetition: v.repetition ?? null });
  }
  return out;
}

/** «كرّره ١٥ مرة» — صيغة العدد مع «مرة». */
export function repetitionText(count: number): string {
  if (count === 1) return "مرة واحدة";
  if (count === 2) return "مرتين";
  const rest = count % 100;
  if (rest >= 3 && rest <= 10) return `${n(count)} مرات`;
  return `${n(count)} مرة`;
}
