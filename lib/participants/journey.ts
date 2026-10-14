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

// ── شاشة اليوم (خطة واجهة الطالب، المرحلة أ) ──

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** الدقائق الباقية حتى وقت نهاية الرصد — صفرٌ إن انقضى. `clock` و`deadline` بصيغة `HH:MM`. */
export function minutesLeft(clock: string, deadline: string): number {
  return Math.max(0, minutesOf(deadline) - minutesOf(clock));
}

/** «٦س ١٢د» · «٤٠د» — للعدّ التنازلي في رأس اليوم. */
export function leftText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${formatNumber(h)}س ${formatNumber(m)}د` : `${formatNumber(m)}د`;
}

/** «يومٌ واحد» · «يومان» · «٣ أيام» · «١١ يوماً» — فاعلاً: «بقي يومان». */
export function daysLeftText(count: number): string {
  if (count === 1) return "يومٌ واحد";
  if (count === 2) return "يومان";
  return daysText(count);
}

/** مجروراً بعد حرف: «بعد يومٍ واحد» · «بعد يومين» · «بعد ٣ أيام» · «بعد ١١ يوماً». */
export function afterDaysText(count: number): string {
  if (count === 1) return "يومٍ واحد";
  if (count === 2) return "يومين";
  return daysText(count);
}

/** «مرة» · «مرتان» · «٣ مرات» · «١٥ مرةً» — عدد التكرار. */
export function timesText(count: number): string {
  if (count === 1) return "مرة واحدة";
  if (count === 2) return "مرتان";
  const rest = count % 100;
  if (rest >= 3 && rest <= 10) return `${formatNumber(count)} مرات`;
  return `${formatNumber(count)} مرةً`;
}

/** الأيام حتى يوم البداية من اليوم التقويمي (`YYYY-MM-DD` كلاهما) — صفرٌ إن حلّ. */
export function daysUntil(today: string, start: string): number {
  const ms = Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

type StepLike = { isRequired: boolean; markedAt: string | null };

/** الخطوة الحالية: أول إلزاميٍّ لم يُرصد، وإلا أول ما لم يُرصد. */
export function primaryIndex(steps: StepLike[]): number {
  const req = steps.findIndex((s) => s.isRequired && s.markedAt === null);
  return req >= 0 ? req : steps.findIndex((s) => s.markedAt === null);
}

/**
 * الإتمام التلقائي يُطلَق على **انتقالٍ بزيادة أكّده ردّ القاعدة** — لا على العدّ المتفائل،
 * ولا عند التحميل أو بعد التراجع (فالعدد يبقى مكتملاً بعد التراجع: `fn_undo_mark` لا يصفّره).
 */
export function autoCompletes(input: {
  delta: 1 | -1;
  confirmed: number;
  repetition: number | null;
  inflight: number;
  marked: boolean;
}): boolean {
  return (
    input.delta === 1 &&
    input.repetition !== null &&
    input.confirmed >= input.repetition &&
    input.inflight === 0 &&
    !input.marked
  );
}

// ── الأرشيف ──

export type CommitmentStatus = "completed" | "exempt" | "stumbled";

/** حكم يومٍ تقويمي كما يُقرأ — والمعوَّض متعثّرٌ لا يُمحى تعثّره (`adr/0041`). */
export function commitmentLabel(status: CommitmentStatus, compensated: boolean): string {
  if (status === "completed") return "أتمّ";
  if (status === "exempt") return "معفى برصيد التقدّم";
  return compensated ? "متعثّر · معوَّض" : "متعثّر";
}
