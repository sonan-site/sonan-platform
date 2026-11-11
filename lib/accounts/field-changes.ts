import { COUNTRIES, formatPhone } from "@/lib/profile/phone";

/**
 * سجلّ تعديلات البيانات (adr/0059) — سطر `profile_changed`/`identity_changed` بلغة المدير.
 *
 * السطر يحمل `fields` (القيم، قديمها في `before` وجديدها في `after`) و`names` (أسماء الحقول، ومنها ما لا
 * قيمة له كرقم الوثيقة)، وعلاماته. والمحو يُسقط `fields` وتبقى الأسماء — فيُعرض ما تغيّر بلا قيمه.
 */

export const FIELD_CHANGE_ACTIONS = ["profile_changed", "identity_changed"] as const;

export const PROFILE_FIELD_LABEL: Record<string, string> = {
  first_name: "الاسم الأول",
  father_name: "اسم الأب",
  grandfather_name: "اسم الجد",
  family_name: "اسم العائلة",
  gender: "الجنس",
  birth_date: "تاريخ الميلاد",
  nationality: "الجنسية",
  phone: "الجوال",
  phone_secondary: "الجوال الإضافي",
  national_id: "رقم الوثيقة",
  guardian_phone: "جوال وليّ الأمر",
};

const ORDER = Object.keys(PROFILE_FIELD_LABEL);
const GENDER: Record<string, string> = { male: "ذكر", female: "أنثى" };

export const fieldLabel = (key: string) => PROFILE_FIELD_LABEL[key] ?? key;

/** أسماء الحقول من نصّ الإشعار (`body` = «birth_date,first_name») — بترتيب النموذج، وما لا يُعرف يسقط. */
export function fieldLabelsFromCsv(csv: string | null): string[] {
  const keys = new Set((csv ?? "").split(",").map((k) => k.trim()));
  return ORDER.filter((k) => keys.has(k)).map(fieldLabel);
}

function showValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "فارغ";
  const text = String(value);
  if (key === "gender") return GENDER[text] ?? text;
  if (key === "nationality") return COUNTRIES.find((c) => c.code === text)?.name ?? text;
  if (key === "phone" || key === "phone_secondary" || key === "guardian_phone") return formatPhone(text);
  return text;
}

export type FieldChange = { label: string; from: string | null; to: string | null };

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * ما تغيّر في السطر. `withValues` لمن يقرأ الحسابات (`users.read`) — ولغيره الأسماء وحدها، فقارئ السجلّ
 * لا يقرأ منه جوالاً ولا ميلاداً لا يقرؤه في الحسابات. وحقلٌ عاد إلى قيمته في السطر المدموج يسقط.
 */
export function fieldChanges(before: unknown, after: unknown, withValues: boolean): FieldChange[] {
  const a = record(after);
  const oldFields = record(record(before)["fields"]);
  const newFields = record(a["fields"]);
  const names = new Set([
    ...(Array.isArray(a["names"]) ? a["names"].filter((n): n is string => typeof n === "string") : []),
    ...Object.keys(newFields),
  ]);
  return ORDER.filter((k) => names.has(k))
    .filter((k) => !(k in newFields) || oldFields[k] !== newFields[k])
    .map((k) => ({
      label: fieldLabel(k),
      from: withValues && k in newFields ? showValue(k, oldFields[k]) : null,
      to: withValues && k in newFields ? showValue(k, newFields[k]) : null,
    }));
}

/** «بيد الإدارة · الاسم الأول: فهد ← سالم · صار خارج سنّ مساره». */
export function fieldChangeText(before: unknown, after: unknown, withValues: boolean): string {
  const a = record(after);
  const changes = fieldChanges(before, after, withValues);
  const parts = [
    a["by_admin"] === true ? "بيد الإدارة" : a["by_admin"] === false ? "بيد صاحبه" : null,
    ...changes.map((c) => (c.from !== null && c.to !== null ? `${c.label}: ${c.from} ← ${c.to}` : c.label)),
    a["out_of_track"] === true ? "صار خارج سنّ مساره" : null,
    a["out_of_gender"] === true ? "صار خارج شرط الجنس في برنامجه" : null,
  ].filter((p) => p !== null);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
