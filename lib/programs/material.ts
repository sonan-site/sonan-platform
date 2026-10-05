import { formatNumber, toLatinDigits } from "@/lib/format";

/**
 * المادة بأقسامها — منطق خالص بلا قاعدة (`adr/0039`).
 *
 * **كل نطاق يُخزَّن بالرقم المتّصل، ويُعرض بالقسم ورقمه فيه.** وهذه الوحدة هي
 * الموضع الوحيد الذي يُترجَم فيه الرقم إلى نصّ: شاشة المادة ومعاينتها، وشاشة
 * المشارك، والبرومبت — كلها تقرأ من هنا، فلا تختلف صياغةٌ بين شاشتين.
 */

/** صيغ العرض كما تُخزَّن على البرنامج. الفارغ يُعرض بالصيغة العامة. */
export type UnitForms = {
  sectionLabel: string | null;
  singular: string | null;
  one: string | null;
  two: string | null;
  few: string | null;
  many: string | null;
};

/** القسم بأول رقم متّصل فيه — يُشتقّ من ترتيب الأقسام وأحجامها. */
export type MaterialSection = {
  id: string;
  name: string;
  /** أول رقم متّصل في القسم. */
  start: number;
  count: number;
};

export type Material = {
  forms: UnitForms;
  /** بترتيبها في المادة. فارغة = مادة بلا أقسام. */
  sections: MaterialSection[];
};

/** الصيغ العامة حين لا يُعرّف المُعِدّ صيغه. */
export const GENERIC_FORMS = {
  singular: "الوحدة",
  one: "وحدة واحدة",
  two: "وحدتان",
  few: "وحدات",
  many: "وحدة",
} as const;

/** الأقسام بأرقامها المتّصلة، من صفوفها مرتّبةً. */
export function withStarts(rows: readonly { id: string; name: string; unit_count: number }[]): MaterialSection[] {
  let next = 1;
  return rows.map((row) => {
    const section = { id: row.id, name: row.name, start: next, count: row.unit_count };
    next += row.unit_count;
    return section;
  });
}

/** مجموع وحدات الأقسام. */
export function sectionsTotal(sections: readonly MaterialSection[]): number {
  return sections.reduce((sum, s) => sum + s.count, 0);
}

/** القسم ورقم الوحدة فيه، أو `null` إن كان الرقم خارج الأقسام. */
export function locateUnit(
  material: Material,
  sequence: number,
): { section: MaterialSection; index: number } | null {
  for (const section of material.sections) {
    if (sequence >= section.start && sequence < section.start + section.count) {
      return { section, index: sequence - section.start + 1 };
    }
  }
  return null;
}

function form(material: Material, key: keyof typeof GENERIC_FORMS): string {
  return material.forms[key]?.trim() || GENERIC_FORMS[key];
}

/** «باب الطهارة» — أو اسم القسم وحده إن لم يُعرَّف اسمٌ للقسم. */
function sectionName(material: Material, section: MaterialSection): string {
  const label = material.forms.sectionLabel?.trim();
  return label ? `${label} ${section.name}` : section.name;
}

/**
 * العدد مع معدوده: «حديث واحد» · «حديثان» · «٣ أحاديث» · «١١ حديثاً» · «١٠٠ حديث».
 *
 * المئات وما فوقها يتبع آخر رقمين: ١٠٣ كالثلاثة، و١١١ كالأحد عشر، و١٠٠ و١٠١
 * و١٠٢ بمعدود مفرد مجرور — يُؤخذ من الكلمة الأولى في صيغة الواحد.
 */
export function countPhrase(material: Material, n: number): string {
  if (n === 1) return form(material, "one");
  if (n === 2) return form(material, "two");
  const rest = n % 100;
  if (rest >= 3 && rest <= 10) return `${formatNumber(n)} ${form(material, "few")}`;
  if (rest >= 11 || n < 100) return `${formatNumber(n)} ${form(material, "many")}`;
  const bare = form(material, "one").split(/\s+/)[0] ?? form(material, "many");
  return `${formatNumber(n)} ${bare}`;
}

/** «الحديث ٥ من باب الطهارة» — أو «الوحدة ٥» في مادة بلا أقسام. */
export function unitText(material: Material, sequence: number): string {
  const singular = form(material, "singular");
  const place = locateUnit(material, sequence);
  if (!place) return `${singular} ${formatNumber(sequence)}`;
  return `${singular} ${formatNumber(place.index)} من ${sectionName(material, place.section)}`;
}

/**
 * نصّ نطاقٍ بالرقم المتّصل:
 * - في قسم واحد: «من الحديث ١ إلى ٣ من باب الإيمان (٣ أحاديث)»
 * - عابراً قسمين: «من الحديث ٤٦ من باب الإيمان إلى الحديث ٢ من باب الطهارة (٤ أحاديث)»
 * - وحدة واحدة: «الحديث ٥ من باب الطهارة»
 */
export function rangeText(material: Material, from: number, to: number): string {
  if (from === to) return unitText(material, from);
  const singular = form(material, "singular");
  const count = countPhrase(material, to - from + 1);
  const a = locateUnit(material, from);
  const b = locateUnit(material, to);

  if (!a || !b) {
    return `من ${singular} ${formatNumber(from)} إلى ${formatNumber(to)} (${count})`;
  }
  if (a.section.id === b.section.id) {
    return `من ${singular} ${formatNumber(a.index)} إلى ${formatNumber(b.index)} من ${sectionName(material, a.section)} (${count})`;
  }
  return (
    `من ${singular} ${formatNumber(a.index)} من ${sectionName(material, a.section)} ` +
    `إلى ${singular} ${formatNumber(b.index)} من ${sectionName(material, b.section)} (${count})`
  );
}

/** أمثلة من نصوص المادة — ليرى المُعِدّ صيغه في جُمل قبل أن يراها المشارك. */
export function samples(material: Material): string[] {
  const total = sectionsTotal(material.sections);
  if (total === 0) return [];
  const out = [unitText(material, 1)];
  if (total >= 3) out.push(rangeText(material, 1, 3));
  const first = material.sections[0];
  const second = material.sections[1];
  if (first && second && first.count >= 2) {
    out.push(rangeText(material, first.start + first.count - 2, second.start + Math.min(1, second.count - 1)));
  }
  if (total >= 11) out.push(rangeText(material, 1, Math.min(total, first && first.count >= 11 ? 11 : total)));
  return [...new Set(out)];
}

// ── لصق الأقسام ──

export type SectionLine = { name: string; count: number };
export type SectionParse = { ok: true; rows: SectionLine[] } | { ok: false; errors: string[] };

/**
 * سطرٌ لكل قسم: الاسم ثم العدد، بأي فاصل — «الإيمان ٤٧» · «الإيمان، 47» · عمودان
 * من جدول ملصوق. والرقم الأخير في السطر هو العدد، فالاسم قد يحوي أرقاماً.
 */
export function parseSectionLines(text: string): SectionParse {
  const rows: SectionLine[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const match = /^(.*?)[\s,،;:\t-]*([0-9٠-٩]+)$/.exec(line);
    const name = match?.[1]?.replace(/[\s,،;:\t-]+$/, "").trim() ?? "";
    const count = match?.[2] ? Number(toLatinDigits(match[2])) : NaN;
    if (!match || !name) {
      errors.push(`السطر ${formatNumber(i + 1)}: اكتب اسم الباب ثم عدد وحداته.`);
      return;
    }
    if (!Number.isInteger(count) || count < 1) {
      errors.push(`السطر ${formatNumber(i + 1)}: عدد وحدات «${name}» عدد صحيح موجب.`);
      return;
    }
    rows.push({ name, count });
  });

  if (rows.length === 0 && errors.length === 0) errors.push("الصق باباً واحداً على الأقل.");
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.name)) errors.push(`اسم الباب «${row.name}» مكرر.`);
    seen.add(row.name);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}
