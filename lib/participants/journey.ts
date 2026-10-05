/**
 * منطق رحلة المشارك — خالص، بلا قاعدة ولا شبكة.
 *
 * الحكم كلّه في القاعدة: `fn_journey_state` تقول أين يقف وما حاله، و`fn_day_tasks`
 * تقول ما واجبه، ودوالّ الرصد ترفض ما لا يجوز (`adr/0036` · `0041`). ما هنا
 * قراءةُ تلك الحال كلاماً — أي يومٍ يُعرض، وأين هو من موعده، وما حكم أيامه —
 * وإخفاءُ زرٍّ سترفضه القاعدة لا يُغني عن رفضها.
 */

import { formatNumber } from "@/lib/format";

/** الحالات التي تتبع الخطة — مطابقة لـ`fn_follows_plan` في القاعدة. */
const FOLLOWS_PLAN: ReadonlySet<string> = new Set(["registered", "memorizing", "qualified"]);

export function followsPlan(status: string): boolean {
  return FOLLOWS_PLAN.has(status);
}

// ── الحال ──

/**
 * `tasks` يرصد يومه · `done_today` أتمّ يوماً اليوم ويستطيع بدء التالي ·
 * `limit` بلغ الحد اليومي · `finished` أتمّ الخطة · `not_started` قبل البداية.
 */
export type JourneyStage = "not_started" | "tasks" | "done_today" | "limit" | "finished";

export type JourneyState = {
  stage: JourneyStage;
  planId: string;
  trackId: string;
  dayCount: number;
  /** أول يومٍ لم يُتمّه — `dayCount + 1` لمن أتمّ الخطة. */
  currentDay: number;
  doneDays: number;
  completedToday: number;
  /** أُتمّ اليوم السابق ليومه الحالي في هذا اليوم التقويمي — فاختياريّه يُرصد بعد. */
  lastCompletedToday: boolean;
  dailyLimit: number;
  startDate: string;
  /** اليوم التقويمي بتوقيت الرياض: `YYYY-MM-DD`. */
  today: string;
  isProgramDay: boolean;
  /** وقت نهاية رصد اليوم: `HH:MM`. */
  deadline: string;
  /** أيام البرنامج من البداية حتى اليوم ضمناً — بحدّ عدد أيام الخطة. */
  expectedDay: number;
  /** أيام البرنامج التي انقضى وقت رصدها — اليوم لا يُحسب قبل وقته (`fn_due_days_at`). */
  dueDays: number;
  progressPct: number;
  progressUnits: number;
  shareSize: number;
  measure: "units" | "days";
  stumbled: number;
  compensated: number;
  /** واجب يومه مرحَّل: تعثّر عليه في يومٍ تقويمي سبق. */
  carried: boolean;
};

const STAGES: ReadonlySet<string> = new Set(["not_started", "tasks", "done_today", "limit", "finished"]);

/**
 * يقرأ ناتج `fn_journey_state`. `null` = لا خطة لمساره. ويرمي على شكلٍ
 * لا يعرفه — فالصفحة تعرض خطأً لا حالاً مختلَقة.
 */
export function parseJourneyState(raw: unknown): JourneyState | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.state === "no_plan") return null;
  if (typeof r.state !== "string" || !STAGES.has(r.state)) throw new Error("حالٌ غير معروفة");
  const num = (key: string) => Number(r[key] ?? 0);
  const str = (key: string) => String(r[key] ?? "");
  return {
    stage: r.state as JourneyStage,
    planId: str("plan_id"),
    trackId: str("track_id"),
    dayCount: num("day_count"),
    currentDay: num("current_day"),
    doneDays: num("done_days"),
    completedToday: num("completed_today"),
    lastCompletedToday: r.last_completed_today === true,
    dailyLimit: num("daily_limit"),
    startDate: str("start_date"),
    today: str("today"),
    isProgramDay: r.is_program_day === true,
    deadline: str("deadline"),
    expectedDay: num("expected_day"),
    dueDays: num("due_days"),
    progressPct: num("progress_pct"),
    progressUnits: num("progress_units"),
    shareSize: num("share_size"),
    measure: r.measure === "units" ? "units" : "days",
    stumbled: num("stumbled"),
    compensated: num("compensated"),
    carried: r.carried === true,
  };
}

// ── أي يومٍ يُعرض ──

/** آخر يومٍ يُفتح للعرض: يومه الحالي، ولا يومَ بعده (`fn_day_tasks` لا تُرجعه). */
export function lastVisibleDay(s: JourneyState): number {
  return Math.max(1, Math.min(s.currentDay, s.dayCount));
}

/**
 * اليوم المعروض بلا طلب: يومه الحالي — إلا من أتمّ يوماً اليوم أو الخطة كلها،
 * فيرى ما أتمّه وتراجعَه، لا واجباً لم يبدأه بعد.
 */
export function defaultDay(s: JourneyState): number {
  if (s.stage === "done_today" || s.stage === "limit" || s.stage === "finished") {
    return Math.max(1, Math.min(s.currentDay - 1, s.dayCount));
  }
  return lastVisibleDay(s);
}

/** المطلوب إن كان مفتوحاً للعرض، وإلا الافتراضي — فرابطٌ قديم يُصحَّح ولا يُفشل الصفحة. */
export function resolveDay(s: JourneyState, requested: number | null): number {
  if (requested !== null && requested >= 1 && requested <= lastVisibleDay(s)) return requested;
  return defaultDay(s);
}

/**
 * يُرصد يومه الحالي وهو يرصد — واليوم المتمّ للتوّ يُكمَل فيه الاختياري قبل وقت
 * نهاية رصده (`fn_engine_require_day`).
 */
export function canMark(s: JourneyState, day: number, clock: string): boolean {
  if (s.stage === "tasks") return day === s.currentDay;
  return (
    (s.stage === "done_today" || s.stage === "limit" || s.stage === "finished") &&
    day === s.currentDay - 1 &&
    s.lastCompletedToday &&
    clock < s.deadline
  );
}

/**
 * نافذة التراجع كما تحكمها `fn_undo_mark`: رصدُ اليوم التقويمي قبل وقت نهاية
 * رصده، على يومه الحالي — أو على الذي أتمّه للتوّ ما لم يبدأ ما بعده.
 *
 * `markedOn` تاريخ الرصد بتوقيت الرياض، و`clock` الساعة الآن (`HH:MM`).
 */
export function canUndo(s: JourneyState, day: number, markedOn: string, clock: string): boolean {
  if (markedOn !== s.today || clock >= s.deadline) return false;
  if (day === s.currentDay) return s.stage === "tasks";
  if (day === s.currentDay - 1) return s.stage !== "tasks" && s.stage !== "not_started";
  return false;
}

// ── الموعد ──

/** «يوماً واحداً» · «يومين» · «٣ أيام» · «١١ يوماً» — منصوباً: «متأخر يوماً واحداً». */
export function daysText(count: number): string {
  if (count === 1) return "يوماً واحداً";
  if (count === 2) return "يومين";
  const rest = count % 100;
  if (rest >= 3 && rest <= 10) return `${formatNumber(count)} أيام`;
  return `${formatNumber(count)} يوماً`;
}

export type Pace = { tone: "on" | "ahead" | "behind"; text: string };

/**
 * موعده: ما أتمّه من الخطة مقابل أيام البرنامج التي انقضى وقت رصدها.
 *
 * **واجب اليوم لا يُعَدّ تأخراً قبل وقت نهاية رصده** — من لم يُتمّ يومه في
 * الصباح ليس متأخراً. والحساب في القاعدة (`due_days`)، فاللوحة وقائمة المشرف
 * وهذه الشاشة تقول الشيء نفسه.
 */
export function pace(s: JourneyState): Pace {
  const lag = s.dueDays - s.doneDays;
  if (lag > 0) return { tone: "behind", text: `متأخر ${daysText(lag)}` };
  if (lag < 0) return { tone: "ahead", text: `متقدّم ${daysText(-lag)}` };
  return { tone: "on", text: "في موعدك" };
}

// ── الأرشيف ──

export type CommitmentStatus = "completed" | "exempt" | "stumbled";

/** حكم يومٍ تقويمي كما يُقرأ — والمعوَّض متعثّرٌ لا يُمحى تعثّره (`adr/0041`). */
export function commitmentLabel(status: CommitmentStatus, compensated: boolean): string {
  if (status === "completed") return "أتمّ";
  if (status === "exempt") return "معفى برصيد التقدّم";
  return compensated ? "متعثّر · معوَّض" : "متعثّر";
}
