import { formatDateBoth, toDateInput } from "@/lib/format";

/**
 * مواعيد البرنامج (`adr/0044`) — أيامٌ لا لحظات، وحالتها مشتقّة بـ«اليوم»
 * بتوقيت الرياض. وموعد التسجيل يُركَّب هنا من نافذة التسجيل ولا يُخزَّن.
 */

export type ScheduleEntry = {
  /** فارغ للمشتقّ (التسجيل) — لا صفّ له فلا يُحذف ولا يُعدَّل من القائمة. */
  id: string | null;
  title: string;
  /** `YYYY-MM-DD` */
  startsOn: string;
  /** `YYYY-MM-DD` — فارغ = يومٌ واحد. */
  endsOn: string | null;
  note: string;
};

export type ScheduleStatus = "done" | "now" | "upcoming";

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  done: "انتهى",
  now: "جارٍ الآن",
  upcoming: "قادم",
};

export const REGISTRATION_ENTRY_TITLE = "التسجيل";

/** يومٌ مخزَّن `YYYY-MM-DD` بالتقويمين — ظهراً كي لا ينزلق بفارق المنطقة. */
export function scheduleDayLabel(day: string): string {
  return formatDateBoth(`${day}T12:00:00Z`);
}

/** «يومٌ» أو «من — إلى»، بالتقويمين. */
export function scheduleRangeLabel(entry: Pick<ScheduleEntry, "startsOn" | "endsOn">): string {
  return entry.endsOn
    ? `${scheduleDayLabel(entry.startsOn)} — ${scheduleDayLabel(entry.endsOn)}`
    : scheduleDayLabel(entry.startsOn);
}

/** حالة الموعد مقابل «اليوم» (`YYYY-MM-DD` بالرياض) — مقارنة نصّية آمنة لصيغة ISO. */
export function scheduleStatus(entry: Pick<ScheduleEntry, "startsOn" | "endsOn">, today: string): ScheduleStatus {
  const last = entry.endsOn ?? entry.startsOn;
  if (today > last) return "done";
  if (today >= entry.startsOn) return "now";
  return "upcoming";
}

/**
 * موعد التسجيل من نافذته. يُركَّب متى عُرف طرفٌ واحد على الأقل:
 * الفتح وحده يومٌ، والإغلاق وحده يومٌ («حتى …»)، والاثنان مدى.
 */
export function registrationEntry(
  opensAt: string | null,
  closesAt: string | null,
  note = "",
): ScheduleEntry | null {
  const opens = opensAt ? toDateInput(opensAt) : null;
  const closes = closesAt ? toDateInput(closesAt) : null;
  const startsOn = opens ?? closes;
  if (!startsOn) return null;
  return {
    id: null,
    title: REGISTRATION_ENTRY_TITLE,
    startsOn,
    endsOn: opens && closes && closes !== opens ? closes : null,
    note,
  };
}

/** المواعيد مرتّبةً بيوم البداية، والتسجيل المشتقّ بينها في موضعه. */
export function composeSchedule(
  rows: ScheduleEntry[],
  window: { opensAt: string | null; closesAt: string | null },
): ScheduleEntry[] {
  const registration = registrationEntry(window.opensAt, window.closesAt);
  const all = registration ? [registration, ...rows] : [...rows];
  // `sort` مستقرّ: عند تساوي اليوم يتقدّم التسجيل، ثم ما سبق إدخاله.
  return all.sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));
}
