import { now } from "@/lib/format";

/**
 * حالة التسجيل — **مشتقّة لا مخزَّنة** `[BR-CAP-01]`.
 *
 * تخزينها يعني عموداً يحتاج تحديثاً عند كل تسجيل وعند كل مرور دقيقة على
 * تاريخ الإغلاق. و`platform.md §٦`: «المحسوب لا يُخزَّن إلا بقرار مسجَّل».
 *
 * وحدة نقيّة: لا قاعدة ولا شبكة. تُختبَر بالحالات الحدّية بلا بيئة.
 */

export type RegistrationState =
  | "unpublished"
  | "not_open_yet"
  | "open"
  | "full"
  | "closed";

export type ProgramWindow = {
  status: "draft" | "published" | "closed";
  capacity: number | null;
  opensAt: string | null;
  closesAt: string | null;
  registeredCount: number;
};

export function registrationState(
  program: ProgramWindow,
  at: Date = now(),
): RegistrationState {
  if (program.status === "closed") return "closed";
  if (program.status !== "published") return "unpublished";

  if (program.opensAt && at < new Date(program.opensAt)) return "not_open_yet";
  if (program.closesAt && at >= new Date(program.closesAt)) return "closed";

  // السعة تُغلق التسجيل آلياً بلا تدخّل يدوي [BR-CAP-01].
  if (program.capacity !== null && program.registeredCount >= program.capacity) {
    return "full";
  }

  return "open";
}

export const REGISTRATION_LABEL: Record<RegistrationState, string> = {
  unpublished: "غير منشور",
  not_open_yet: "قريباً",
  open: "التسجيل مفتوح",
  full: "اكتمل العدد",
  closed: "مغلق",
};
