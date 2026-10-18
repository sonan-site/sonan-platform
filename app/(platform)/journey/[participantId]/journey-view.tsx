"use client";

import { Check, ChevronLeft, ChevronRight, CircleAlert, CloudAlert, CloudCheck, Eye, Hourglass, Lock, LoaderCircle, Minus, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { formatClock, formatDate, formatDateBoth, formatHijri, formatNumber, formatPercent, formatTime, now, toTimeInput } from "@/lib/format";
import {
  afterDaysText,
  autoCompletes,
  commitmentLabel,
  daysLeftText,
  daysText,
  daysUntil,
  leftText,
  minutesLeft,
  primaryIndex,
  timesText,
  type CommitmentStatus,
  type JourneyState,
  type Pace,
} from "@/lib/participants/journey";
import { countRepetition, markField, openNextDay, undoMark } from "../actions";
import { FinalCard, type JourneyFinal } from "./final-card";
import styles from "./journey.module.css";
import { HEAT_LABEL, type StripCell } from "@/lib/participants/progress-view";

/** الحرف من التاريخ نفسه لا من الموضع (٠ الأحد … ٦ السبت). */
const WEEKDAY_BY_DOW = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
const weekdayOf = (iso: string) => WEEKDAY_BY_DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";

/**
 * شريط الأسبوع (المرحلة ب · ب١): أيامه السبعة بحالها — والماضي يفتح يوم خطته، واليوم يعيد إلى
 * يومه. وتُبرز دائرة اليوم المعروض.
 */
function WeekStrip({
  cells,
  shown,
  todayDay,
  onGo,
}: {
  cells: StripCell[];
  shown: number;
  /** يوم الخطة الذي تفتحه خلية «اليوم» — اليوم الافتراضي. */
  todayDay: number;
  onGo: (to: number | "today") => void;
}) {
  if (cells.length !== 7) return null;
  // خليةٌ واحدة تُبرز للمعروض: اليوم إن طابق، وإلا أحدث خليةٍ تفتحه (مراجعة ب١ ٤).
  const dayOf = (c: StripCell) => (c.target === "today" ? todayDay : c.target);
  const todayCell = cells.find((c) => c.today);
  const shownCell =
    todayCell && dayOf(todayCell) === shown ? todayCell : [...cells].reverse().find((c) => dayOf(c) === shown);
  return (
    <ol className={styles.week} aria-label="أسبوعك">
      {cells.map((c) => {
        const opens = typeof c.target === "number" ? ` — يفتح اليوم ${formatNumber(c.target)}` : "";
        const label = `${formatDate(c.date)}: ${HEAT_LABEL[c.kind]}${c.today ? "، اليوم" : ""}${opens}`;
        const current = c === shownCell;
        const cls = `${styles.weekDay} ${styles[`wk_${c.kind}`] ?? ""} ${c.today ? styles.weekToday : ""} ${current ? styles.weekShown : ""}`;
        const ariaCurrent = c.today ? ("date" as const) : current ? ("true" as const) : undefined;
        return (
          <li key={c.date}>
            {c.target !== null ? (
              <button type="button" className={cls} aria-label={label} aria-current={ariaCurrent} aria-pressed={current} onClick={() => onGo(c.target!)}>
                {weekdayOf(c.date)}
                <i aria-hidden />
              </button>
            ) : (
              <span className={cls} role="img" aria-label={label} aria-current={ariaCurrent}>
                {weekdayOf(c.date)}
                <i aria-hidden />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** سطرٌ من نطاق الواجب: نصّه، وأوائل طرفيه إن كُتبت في المادة. */
export type TaskLine = { text: string; fromLabel: string | null; toLabel: string | null };

export type TaskRow = {
  fieldId: string;
  label: string;
  isRequired: boolean;
  lines: TaskLine[];
  /** العدد المطلوب — `null` لواجبٍ بلا تكرار. */
  repetition: number | null;
  count: number;
  markedAt: string | null;
  undoable: boolean;
};

export type ArchiveRow = {
  id: string;
  date: string;
  status: CommitmentStatus;
  planDay: number;
  completedDays: number[];
  compensated: boolean;
};

export type JourneyExam = {
  id: string;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
  attempts: number;
  maxAttempts: number | null;
  bestPercent: number | null;
  passed: boolean;
  open: boolean;
  /** أول موانعه — فارغ = يدخل الآن. */
  blocker: string | null;
};

const PACE_CLASS: Record<Pace["tone"], string> = {
  on: styles.paceOk ?? "",
  ahead: styles.paceOk ?? "",
  behind: styles.paceBehind ?? "",
};

function percent(value: number): string {
  return formatPercent(value / 100, Number.isInteger(value) ? 0 : 1);
}

const ofText = (count: number, total: number) => `${formatNumber(count)} من ${formatNumber(total)}`;
const hasDetails = (t: TaskRow) => t.repetition !== null || t.lines.some((l) => l.fromLabel || l.toLabel);

/** مهلة الإتمام التلقائي بعد بلوغ العدد — يرى فيها الحلقة مكتملة، ويُنقص إن أخطأ. */
const AUTO_MS = 1000;
/** «ابدأ اليوم التالي» لا يقع تحت إصبع آخر ضغطة: فتح التالي يُغلق التراجع عن السابق. */
const NEXT_GUARD_MS = 1500;

/**
 * شاشة اليوم (`docs/reviews/2026-10-14-خطة-واجهة-الطالب.md`، المرحلة أ):
 * رأسٌ بحال اليوم، وشرائط خطواتٍ بارتفاعٍ واحد، وتفاصيل الخطوة بعدّادها في شاشةٍ داخلية
 * (حالةٌ على الجهاز لا مسار — فلا يُعاد حساب الحال بكل تنقّل)، وزرٌّ رئيسيٌّ ثابت في الأسفل.
 */
export function JourneyView({
  week,
  todayDay,
  participantId,
  justJoined,
  registrationNo,
  programName,
  trackName,
  state,
  pace,
  day,
  lastDay,
  maxDay,
  markable,
  tasks,
  archive,
  priorDays,
  exams,
  examsUnavailable,
  finals,
  serverClock,
}: {
  /** شريط الأسبوع (المرحلة ب · ب١) — فارغ إن تعذّر تقويمه. */
  week: StripCell[] | null;
  /** اليوم الافتراضي — ما تفتحه خلية «اليوم». */
  todayDay: number;
  participantId: string;
  /** جاء من التسجيل للتوّ. */
  justJoined: boolean;
  /** `SN-1448-0001` — فارغ إن لم يكن للبرنامج بادئة (`adr/0047`). */
  registrationNo: string | null;
  programName: string;
  trackName: string;
  state: JourneyState;
  pace: Pace;
  /** اليوم المعروض من الخطة. */
  day: number;
  /** يومه الذي بلغه — إليه يعود «عُد إلى اليوم». */
  lastDay: number;
  /** آخر يومٍ يُفتح للاطّلاع — آخر الخطة (الهجرة ٠٩٥). وما بعد `lastDay` يُعرض ولا يُرصد. */
  maxDay: number;
  /** يُرصد هذا اليوم الآن. */
  markable: boolean;
  tasks: TaskRow[];
  archive: ArchiveRow[];
  /** أيامٌ أتمّها في مساراتٍ قبل هذا — صفرٌ لمن لم يُنقل. */
  priorDays: number;
  /** اختباراته عن بعد (`adr/0048`). */
  exams: JourneyExam[];
  /** تعذّر جلب الاختبارات — تُخفى بطاقتها ويُقال ذلك في سطر. */
  examsUnavailable: boolean;
  /** النهائي: التأهّل والجلسة، والنتيجة بعد نشرها. */
  finals: JourneyFinal[];
  /** ساعة الخادم بتوقيت الرياض لحظة العرض (`HH:MM`) — العدّ التنازلي منها لا من ساعة الجهاز. */
  serverClock: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [pending, startTransition] = useTransition();

  // ── العدّ: الشاشة تعدّ فوراً، والقاعدة هي المرجع حين تسكن الضغطات ──
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(tasks.map((t) => [t.fieldId, t.count])));
  const [seen, setSeen] = useState(tasks);
  if (seen !== tasks) {
    // بيانات القاعدة الجديدة (بعد رصدٍ أو تحديث) تغلب ما عدّته الشاشة.
    setSeen(tasks);
    setCounts(Object.fromEntries(tasks.map((t) => [t.fieldId, t.count])));
  }
  // مفتاح الطلبات المعلّقة اليوم والحقل معاً: ردٌّ متأخر من يومٍ سابق لا يكتب في يومٍ جديد.
  const inflight = useRef<Record<string, number>>({});
  const key = (fieldId: string) => `${day}:${fieldId}`;
  const dayRef = useRef(day);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);
  const openRef = useRef<string | null>(null);
  const autoGen = useRef(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [failed, setFailed] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [autoFor, setAutoFor] = useState<string | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openId, setOpenIdState] = useState<string | null>(null);
  const setOpenId = (id: string | null) => {
    openRef.current = id;
    setOpenIdState(id);
  };
  const [advance, setAdvance] = useState(false);
  const [nextGuard, setNextGuard] = useState(false);

  // ── الساعة: العدّ التنازلي، وتحديث الحال عند انقضاء وقت الرصد ──
  const [clock, setClock] = useState(serverClock);
  const lastClock = useRef(serverClock);
  useEffect(() => {
    const toMin = (c: string) => Number(c.slice(0, 2)) * 60 + Number(c.slice(3, 5));
    // فرق ساعة الجهاز عن الخادم يُحسب مرةً، فجوالٌ ساعته مخطئة لا يعدّ وقتاً أغلقته القاعدة.
    const skew = toMin(serverClock) - toMin(toTimeInput(now()));
    const tick = () => {
      const m = (((toMin(toTimeInput(now())) + skew) % 1440) + 1440) % 1440;
      const c = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      // عند انقضاء وقت الرصد — أو عبور منتصف الليل — تتغيّر نافذتا الرصد والتراجع، فتُقرأ الحال من جديد.
      if ((lastClock.current < state.deadline && c >= state.deadline) || c < lastClock.current) router.refresh();
      lastClock.current = c;
      setClock(c);
    };
    const id = setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, serverClock, state.deadline]);

  useEffect(() => () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
  }, []);

  const cancelAuto = () => {
    autoGen.current += 1;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    setAutoFor(null);
  };

  const go = (to: number) => {
    cancelAuto();
    setOpenId(null);
    setMessage({});
    router.push(`/journey/${participantId}?day=${to}`);
  };
  // من شريط الأسبوع: «اليوم» يعيد إلى يومه بلا رقم — بالتنظيف نفسه (مراجعة ب١ ٦).
  const goWeek = (to: number | "today") => {
    if (to !== "today") return go(to);
    cancelAuto();
    setOpenId(null);
    setMessage({});
    router.push(`/journey/${participantId}`);
  };

  const target = (t: TaskRow) => ({ participantId, day, fieldId: t.fieldId });
  const required = tasks.filter((t) => t.isRequired);
  const isCurrent = day === state.currentDay && state.stage === "tasks";
  // يومٌ بعد ما بلغه: يُعرض واجبه وتفاصيله للاطّلاع، ولا يُرصد (قرار الراعي ١٨ أكتوبر).
  const upcoming = day > lastDay && state.stage !== "not_started";
  const finishedStage = state.stage === "done_today" || state.stage === "limit" || state.stage === "finished";
  const justFinished = day === state.currentDay - 1 && finishedStage;
  /** اليوم المتمّ للتوّ، أو التالي الذي لم يُبدأ — والزرّ فيهما واحد. */
  const atNext = finishedStage && (day === state.currentDay - 1 || day === state.currentDay);
  const primary = markable ? primaryIndex(tasks) : -1;
  const anyProgress = tasks.some((t) => t.markedAt !== null || (counts[t.fieldId] ?? 0) > 0);
  const resting = !state.isProgramDay && isCurrent && !anyProgress && !advance;

  function bump(t: TaskRow, delta: 1 | -1): void {
    // حارسٌ هنا لا عند المستدعي وحده: اليوم القادم يُعرض ولا يُعدّ (مراجعة الاطّلاع ٣).
    if (!markable) return;
    if (t.repetition === null || t.markedAt !== null || marking === t.fieldId) return;
    const cur = counts[t.fieldId] ?? 0;
    const next = Math.max(0, Math.min(t.repetition, cur + delta));
    if (next === cur) return;
    if (delta === -1) cancelAuto();
    // تُثبَّت الخطوة المعدودة مفتوحةً قبل قراءة الجيل: على الكمبيوتر تُعرض الأولى المتاحة بلا فتحٍ
    // صريح، و`still()` يشترطه — وإلا لم يُطلق الإتمام التلقائي فيها (مراجعة ب٣ ح١). وعلى الجوال
    // يُعدّ من شاشةٍ مفتوحة أصلاً فلا يتغيّر شيء.
    if (openRef.current !== t.fieldId) setOpenId(t.fieldId);
    try {
      navigator.vibrate?.(12);
    } catch {
      // الاهتزاز ترفٌ لا يُفشل العدّ.
    }
    setCounts((c) => ({ ...c, [t.fieldId]: next }));
    setFailed(false);
    setMessage({});
    const k = key(t.fieldId);
    const sentDay = day;
    const gen = autoGen.current;
    inflight.current[k] = (inflight.current[k] ?? 0) + 1;
    setSaving((s) => s + 1);
    // الشاشة لم تتغيّر منذ الضغطة: اليوم نفسه، والتفاصيل مفتوحةٌ على الحقل، ولا إلغاء بينهما.
    const still = () => dayRef.current === sentDay && openRef.current === t.fieldId && autoGen.current === gen;
    void (async () => {
      let result: { count?: number; error?: string };
      try {
        result = await countRepetition({ ...target(t), delta });
      } catch {
        result = { error: "تعذّر الاتصال — لم تُحفظ الضغطة. تحقّق من الشبكة وأعد." };
      } finally {
        inflight.current[k] = (inflight.current[k] ?? 1) - 1;
        setSaving((s) => s - 1);
      }
      if (dayRef.current !== sentDay) return;
      if (result.error) {
        setFailed(true);
        setMessage({ error: result.error });
        // رُفضت الضغطة فلم تُحفظ: تُرَدّ — والطلبات تمضي بترتيبها، فما قبلها محفوظ.
        setCounts((c) => ({ ...c, [t.fieldId]: Math.max(0, (c[t.fieldId] ?? 0) - delta) }));
        router.refresh();
        return;
      }
      const left = inflight.current[k] ?? 0;
      if (left === 0 && result.count !== undefined) setCounts((c) => ({ ...c, [t.fieldId]: result.count! }));
      if (
        still() &&
        result.count !== undefined &&
        autoCompletes({ delta, confirmed: result.count, repetition: t.repetition, inflight: left, marked: t.markedAt !== null })
      ) {
        setAutoFor(t.fieldId);
        autoTimer.current = setTimeout(() => {
          autoTimer.current = null;
          setAutoFor(null);
          if (still()) mark(t);
        }, AUTO_MS);
      }
    })();
  }

  const offline = { error: "تعذّر الاتصال — تحقّق من الشبكة وأعد." };

  function mark(t: TaskRow): void {
    if (!markable) return;
    if (t.markedAt !== null || busy !== null) return;
    const finishesDay = t.isRequired && required.every((r) => r.fieldId === t.fieldId || r.markedAt !== null);
    setMarking(t.fieldId);
    setBusy(t.fieldId);
    setSaving((s) => s + 1);
    startTransition(async () => {
      let result: { error?: string };
      try {
        result = await markField(target(t));
      } catch {
        result = offline;
      } finally {
        setSaving((s) => s - 1);
        setMarking(null);
        setBusy(null);
      }
      if (result.error) {
        setFailed(true);
        setMessage({ error: result.error });
        return;
      }
      setFailed(false);
      setMessage({});
      setOpenId(null);
      if (finishesDay) {
        setNextGuard(true);
        setTimeout(() => setNextGuard(false), NEXT_GUARD_MS);
      }
    });
  }

  function undo(t: TaskRow): void {
    if (busy !== null) return;
    cancelAuto();
    setBusy(t.fieldId);
    setSaving((s) => s + 1);
    startTransition(async () => {
      let result: { error?: string };
      try {
        result = await undoMark(target(t));
      } catch {
        result = offline;
      } finally {
        setSaving((s) => s - 1);
        setBusy(null);
      }
      setMessage(result.error ? { error: result.error } : {});
      setFailed(Boolean(result.error));
    });
  }

  function startNext(): void {
    const roomAfter = state.dailyLimit - state.completedToday - 1;
    startTransition(async () => {
      let result: { error?: string };
      try {
        result = await openNextDay(participantId);
      } catch {
        result = offline;
      }
      if (result.error) {
        setMessage(result);
        return;
      }
      setAdvance(true);
      // تُقال بعد الانتقال لا قبله: كم بقي له اليوم بعد هذا اليوم الذي بدأه.
      setMessage({
        notice:
          roomAfter > 0
            ? `بدأت اليوم ${formatNumber(state.currentDay)} — ولك بعده اليوم ${daysLeftText(roomAfter)} في حدّك اليومي.`
            : `بدأت اليوم ${formatNumber(state.currentDay)} — وهو آخر ما يُفتح لك اليوم.`,
      });
      router.push(`/journey/${participantId}`);
    });
  }

  const saveState = saving > 0 ? "saving" : failed ? "failed" : "saved";
  const open = openId ? tasks.find((t) => t.fieldId === openId) ?? null : null;

  // ══ الكمبيوتر (المرحلة ب · ب٣): الخطوة المختارة في عمودٍ بجانب اليوم — لا شاشةٌ تحلّ محلّه ══
  // التخطيط بـCSS وحده، والعرض هنا للسلوك فقط: أيّ خطوةٍ تُعرض، وأين يكون الزرّ الرئيسي.
  const wide = useWide();
  const primTask = markable && primary >= 0 ? tasks[primary]! : null;
  /** المعروضة في العمود الجانبي: المفتوحة، وإلا التالية المتاحة — فبعد الرصد تُختار التي بعدها. */
  const selected = wide && !resting ? open ?? primTask : null;

  // لوحة المفاتيح على الكمبيوتر: المسافة تعدّ في الخطوة المعروضة، و↑/↓ يتنقّلان بين الخطوات.
  // لا في حقلٍ أو زرٍّ أو قائمةٍ تُطوى، ولا مع الضغط المستمر أو المفاتيح المساعدة، ولا في يومٍ لا يُرصد.
  // بلا مصفوفة اعتماد عن قصد: يُعاد الاشتراك كل تصيير فيقرأ أحدث حالٍ بلا إغلاقٍ قديم — وكلفته زهيدة.
  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target instanceof Element ? e.target : null;
      // الكتابة والنوافذ لا تُمسّ أبداً. والمسافة على زرٍّ أو رابطٍ تضغطه هو — فلا تعدّ مرتين.
      if (el?.closest("input, textarea, select, [role=dialog], [contenteditable=true]")) return;
      if (e.key === " " && el?.closest("button, summary, a")) return;
      if (e.key === " " && selected && markable && selected.repetition !== null && selected.markedAt === null) {
        e.preventDefault();
        bump(selected, 1);
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && selected && autoFor === null && saving === 0 && tasks.length > 1) {
        e.preventDefault();
        const i = tasks.indexOf(selected);
        const next = tasks[(i + (e.key === "ArrowDown" ? 1 : -1) + tasks.length) % tasks.length];
        if (next) setOpenId(next.fieldId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ══ تفاصيل الخطوة — شاشةٌ داخلية على الجوال، وعمودٌ جانبي على الكمبيوتر ══
  const renderDetail = (open: TaskRow, side: boolean, quiet = false) => {
    const idx = tasks.indexOf(open);
    const count = counts[open.fieldId] ?? 0;
    return (
      <>
        <div className={styles.detailHead}>
          {side ? (
            <span className={styles.muted}>الخطوة المختارة</span>
          ) : (
            <button type="button" className={styles.backLink} onClick={() => { cancelAuto(); setOpenId(null); }}>
              <ChevronRight size={16} aria-hidden /> اليوم {formatNumber(day)}
            </button>
          )}
          <span className={styles.muted}>
            الخطوة {formatNumber(idx + 1)} من {formatNumber(tasks.length)}
          </span>
        </div>
        {side ? <h2 className={styles.detailTitle}>{open.label}</h2> : <h1 className={styles.detailTitle}>{open.label}</h1>}
        <div className={styles.passage}>
          {open.lines.map((line, i) => (
            <div key={i}>
              <p className={styles.passageText}>{line.text}</p>
              {line.fromLabel ? <p className={styles.quote}>أوله: {line.fromLabel}</p> : null}
              {line.toLabel ? <p className={styles.quote}>آخره: {line.toLabel}</p> : null}
            </div>
          ))}
        </div>
        {open.repetition !== null ? (
          <Ring
            count={count}
            total={open.repetition}
            done={open.markedAt !== null}
            disabled={!markable || open.markedAt !== null}
            minusDisabled={!markable || count === 0 || open.markedAt !== null || marking === open.fieldId}
            onTap={() => bump(open, 1)}
            onMinus={() => bump(open, -1)}
            idle={!markable}
          />
        ) : null}
        <p className={styles.srOnly} aria-live="polite">
          {autoFor === open.fieldId ? "اكتمل العدد — يُتمّ خلال ثانية. أنقص واحداً لإلغائه." : ""}
        </p>
        <Dock save={quiet ? null : saveState} error={quiet ? null : (message.error ?? null)}>
          {open.markedAt !== null ? (
            side ? (
              <DockMessage>أُتمّ {open.label}</DockMessage>
            ) : (
              <DockButton onClick={() => setOpenId(null)}>عُد إلى اليوم {formatNumber(day)}</DockButton>
            )
          ) : !markable ? (
            <DockMessage>{upcoming ? "يُرصد حين تبلغه" : "لا يُرصد هذا اليوم الآن"}</DockMessage>
          ) : open.repetition === null ? (
            <DockButton pending={marking === open.fieldId} onClick={() => mark(open)}>
              أتممتُ {open.label}
            </DockButton>
          ) : autoFor === open.fieldId ? (
            <DockMessage>اكتمل العدد — يُتمّ الآن</DockMessage>
          ) : count >= open.repetition ? (
            <DockButton pending={marking === open.fieldId} onClick={() => mark(open)}>
              أتممتُ {open.label}
            </DockButton>
          ) : (
            <DockMessage>بقي {ofText(open.repetition - count, open.repetition)}</DockMessage>
          )}
        </Dock>
      </>
    );
  };

  if (open && !wide) return <div className={styles.shell}>{renderDetail(open, false)}</div>;

  // ══ اليوم ══
  const prim = primary >= 0 ? tasks[primary]! : null;
  const left = minutesLeft(clock, state.deadline);

  let dock: React.ReactNode;
  if (state.stage === "not_started") {
    dock = (
      <DockMessage icon={<Lock size={18} aria-hidden />}>يُفتح {formatDate(state.startDate)}</DockMessage>
    );
  } else if (resting) {
    dock = <DockButton onClick={() => setAdvance(true)}>تقدّم</DockButton>;
  } else if (atNext && state.stage === "done_today") {
    dock = (
      <DockButton pending={pending} disabled={nextGuard} onClick={startNext}>
        ابدأ اليوم {formatNumber(state.currentDay)} الآن
      </DockButton>
    );
  } else if (atNext && state.stage === "limit") {
    dock = <DockMessage>بلغتَ حدّك · يُفتح اليوم {formatNumber(state.currentDay)} غداً</DockMessage>;
  } else if (atNext && state.stage === "finished") {
    // بطاقة الإتمام تقول ما يُقال — فلا زرّ يكرّره.
    dock = null;
  } else if (markable && prim && selected) {
    // على الكمبيوتر الزرّ في عمود الخطوة — فلا يتكرّر هنا.
    dock = null;
  } else if (markable && prim) {
    const c = counts[prim.fieldId] ?? 0;
    dock =
      prim.repetition !== null && c < prim.repetition ? (
        <DockButton onClick={() => setOpenId(prim.fieldId)}>
          {c > 0 ? `أكمل ${prim.label} · ${ofText(c, prim.repetition)}` : `ابدأ ${prim.label}`}
        </DockButton>
      ) : (
        <DockButton pending={marking === prim.fieldId} onClick={() => mark(prim)}>
          أتممتُ {prim.label}
        </DockButton>
      );
  } else if (day !== lastDay) {
    dock = <DockButton onClick={() => go(lastDay)}>عُد إلى اليوم {formatNumber(lastDay)}</DockButton>;
  } else {
    dock = null;
  }

  return (
    <div className={`${styles.layout} ${selected ? styles.layoutTwo : ""}`}>
    <div className={styles.shell}>
      {justJoined ? (
        <p role="status" className={styles.joined}>
          تمّ تسجيلك في {programName}.
          {registrationNo ? <> رقم تسجيلك <b dir="ltr">{registrationNo}</b> — احتفظ به للاختبارات والاستفسار.</> : null}{" "}
          هذا واجبك الأول.
        </p>
      ) : null}

      {/* ══ رأس اليوم ══ */}
      {state.stage === "not_started" ? (
        <section className={styles.hero} aria-label="بداية الحفظ">
          <p className={styles.heroTitle}>
            {daysUntil(state.today, state.startDate) > 0
              ? `يبدأ حفظك بعد ${afterDaysText(daysUntil(state.today, state.startDate))}`
              : "يبدأ حفظك اليوم"}
          </p>
          <p className={styles.heroLine}>{formatDateBoth(state.startDate)}</p>
          <div className={styles.bar}>
            <span style={{ inlineSize: "0%" }} />
          </div>
          <p className={styles.heroLine}>
            <span>
              {trackName} · {daysText(state.dayCount)}
            </span>
            {registrationNo ? <b dir="ltr" className={styles.nowrap}>{registrationNo}</b> : null}
          </p>
        </section>
      ) : (
        <section className={styles.hero} aria-label={`اليوم ${formatNumber(day)}`}>
          <div className={styles.heroNav}>
            <button type="button" className={styles.nav} aria-label="اليوم السابق" disabled={day <= 1} onClick={() => go(day - 1)}>
              <ChevronRight size={18} aria-hidden />
            </button>
            <p className={styles.heroTitle}>
              اليوم {formatNumber(Math.min(day, state.dayCount))}
              {state.carried && day === state.currentDay ? <span className={styles.heroTag}>مرحَّل</span> : null}
              {day < state.currentDay ? <span className={styles.heroTag}>أُتمّ</span> : null}
              {upcoming ? <span className={styles.heroTag}>قادم</span> : null}
            </p>
            <button type="button" className={styles.nav} aria-label="اليوم التالي" disabled={day >= maxDay} onClick={() => go(day + 1)}>
              <ChevronLeft size={18} aria-hidden />
            </button>
          </div>
          {week ? <WeekStrip cells={week} shown={day} todayDay={todayDay} onGo={goWeek} /> : null}
          <p className={styles.heroLine}>
            <span>
              {state.stage === "finished" ? "أتممتَ الخطة" : `بقي ${daysLeftText(Math.max(0, state.dayCount - state.doneDays))} على الختم`}
            </span>
            <span>{percent(state.progressPct)}</span>
          </p>
          <div className={styles.bar}>
            <span style={{ inlineSize: `${Math.min(100, state.progressPct)}%` }} />
          </div>
          <p className={styles.heroLine}>
            {!state.isProgramDay ? (
              <span>يوم راحة · لا يُحاسَب عليك اليوم</span>
            ) : left > 0 ? (
              <span>
                يُرصد حتى {formatClock(state.deadline)} · بقي {leftText(left)}
              </span>
            ) : (
              <span>انقضى وقت رصد اليوم — وما ترصده الآن يُحسب لغدك</span>
            )}
            {state.stage !== "finished" ? <span className={PACE_CLASS[pace.tone]}>{pace.text}</span> : null}
          </p>
        </section>
      )}

      {state.carried && isCurrent ? (
        <p role="status" className={styles.carried}>
          <CircleAlert size={18} aria-hidden />
          <span>
            لم يُتمّ اليوم {formatNumber(state.currentDay)} قبل نهاية رصده، فتأخّر موعدك. أتمّه الآن ليعود تقدّمك.
          </span>
        </p>
      ) : null}
      {message.notice ? (
        <p role="status" className={styles.notice}>
          {message.notice}
        </p>
      ) : null}
      {examsUnavailable ? <p className={styles.muted}>تعذّر جلب اختباراتك الآن — أعد فتح الصفحة لتظهر.</p> : null}
      {exams.map((exam) => (
        <ExamCard key={exam.id} participantId={participantId} exam={exam} />
      ))}
      {finals.map((f) => (
        <FinalCard key={f.examId} final={f} />
      ))}

      {/* ══ إتمام اليوم ══ */}
      {justFinished ? (
        <section className={styles.complete} aria-label="أُتمّ اليوم">
          <span className={styles.completeBadge}>
            <Check size={28} aria-hidden />
          </span>
          <p className={styles.completeTitle}>
            {state.stage === "finished" ? "أتممتَ خطتك" : `أتممتَ اليوم ${formatNumber(day)}`}
          </p>
          <p className={styles.muted}>
            {state.stage === "finished"
              ? `${daysText(state.dayCount)} — بارك الله في حفظك.`
              : `بارك الله في حفظك · الإنجاز ${percent(state.progressPct)}`}
          </p>
        </section>
      ) : null}

      {/* ══ الخطوات ══ */}
      {resting ? (
        <section className={styles.rest} aria-label="يوم راحة">
          <span className={styles.restIcon}>
            <Hourglass size={28} aria-hidden />
          </span>
          <p className={styles.completeTitle}>يوم راحة</p>
          <p className={styles.muted}>وإن شئت تقدّم في خطتك</p>
        </section>
      ) : (
        <>
          <h2 className={styles.stepsTitle}>
            {state.stage === "not_started" ? "واجب يومك الأول — لتستعدّ له" : upcoming ? "واجب يومٍ قادم — للاطّلاع" : "خطوات اليوم"}
          </h2>
          <ol className={styles.steps}>
            {tasks.map((t, i) => {
              const c = counts[t.fieldId] ?? 0;
              if (t.markedAt !== null) {
                return (
                  <li key={t.fieldId} className={`${styles.step} ${styles.stepDone}`}>
                    <span className={styles.stepNum}>
                      <Check size={15} aria-hidden />
                    </span>
                    <span className={styles.stepText}>
                      <b>{t.label}</b>
                      <span>أُتمّ {formatTime(t.markedAt)}</span>
                    </span>
                    {t.undoable ? (
                      <button type="button" className={styles.undo} aria-label={`تراجع عن إتمام ${t.label}`} title="تراجع" disabled={busy !== null} onClick={() => undo(t)}>
                        <Undo2 size={17} aria-hidden />
                      </button>
                    ) : null}
                  </li>
                );
              }
              const body = (
                <>
                  <span className={styles.stepNum}>{formatNumber(i + 1)}</span>
                  <span className={styles.stepText}>
                    <b>{t.label}</b>
                    <span>
                      {t.repetition !== null && (state.stage === "not_started" || upcoming) ? `${timesText(t.repetition)} · ` : ""}
                      {t.lines.map((l) => l.text).join(" · ")}
                    </span>
                  </span>
                  {!t.isRequired ? <span className={styles.chip}>اختياري</span> : null}
                  {t.repetition !== null && c > 0 ? <span className={styles.chip}>{ofText(c, t.repetition)}</span> : null}
                </>
              );
              return (
                <li key={t.fieldId}>
                  {markable || upcoming ? (
                    <button
                      type="button"
                      className={`${styles.step} ${i === primary ? styles.stepNow : ""} ${selected === t ? styles.stepSelected : ""}`}
                      aria-current={selected === t ? "step" : undefined}
                      onClick={() => {
                        // على الكمبيوتر: لا يتبدّل الاختيار أثناء عدٍّ جارٍ أو إتمامٍ تلقائيٍّ منتظر (مراجعة ب٣ ٣).
                        if (wide && (autoFor !== null || saving > 0)) return;
                        setOpenId(t.fieldId);
                      }}
                    >
                      {body}
                      <span className={styles.srOnly}>التفاصيل</span>
                      <span className={styles.eye}>
                        {hasDetails(t) ? <Eye size={18} aria-hidden /> : <ChevronLeft size={18} aria-hidden />}
                      </span>
                    </button>
                  ) : (
                    <div className={`${styles.step} ${styles.stepIdle}`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
          {tasks.length === 0 ? <p className={styles.muted}>لا واجب في هذا اليوم.</p> : null}
          {justFinished && markable && tasks.some((t) => !t.isRequired && t.markedAt === null) ? (
            <p className={styles.muted}>
              اختياريّه يُرصد حتى {formatClock(state.deadline)} ما لم تبدأ اليوم التالي.
            </p>
          ) : null}
        </>
      )}

      <details className={styles.archive}>
        <summary>
          سجلّ الالتزام ({formatNumber(archive.length)})
          {state.stumbled > 0
            ? ` · تعثّر ${formatNumber(state.stumbled)}${state.compensated > 0 ? ` عُوِّض منها ${formatNumber(state.compensated)}` : ""}`
            : ""}
        </summary>
        {priorDays > 0 ? <p className={styles.muted}>وأيامٌ من مسارٍ سابق: {formatNumber(priorDays)}</p> : null}
        {archive.length === 0 ? (
          <p className={styles.muted}>يُكتب حكم كل يومٍ من أيام البرنامج عند وقت نهاية رصده.</p>
        ) : (
          <ul>
            {archive.map((row) => (
              <li key={row.id}>
                <span>{formatHijri(row.date)}</span>
                <strong className={row.status === "stumbled" && !row.compensated ? styles.paceBehind : styles.paceOk}>
                  {commitmentLabel(row.status, row.compensated)}
                </strong>
                <span className={styles.muted}>
                  {row.completedDays.length > 0
                    ? `الأيام ${row.completedDays.map((d) => formatNumber(d)).join("، ")}`
                    : `اليوم ${formatNumber(row.planDay)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {dock !== null ? (
        <Dock save={state.stage === "not_started" ? null : saveState} error={message.error ?? null}>
          {dock}
        </Dock>
      ) : message.error && !selected ? (
        <p role="alert" className={styles.error}>
          {message.error}
        </p>
      ) : null}
    </div>
      {/* عمود الخطوة على الكمبيوتر — مخفيٌّ دون 1024px بـCSS، وفارغٌ حتى يُعرف العرض. */}
      {selected && !resting ? (
        <aside className={styles.side} aria-label={`تفاصيل ${selected.label}`}>
          {renderDetail(selected, true, dock !== null)}
        </aside>
      ) : null}
    </div>
  );
}

/**
 * عرض الكمبيوتر (1024px فأوسع) — للسلوك وحده، والتخطيط بـCSS. على الخادم «جوال»: فلا يُعرض
 * العمود الجانبي قبل أن يُعرف العرض، ولا يختلف ما يُرسم عمّا يُثبَّت.
 */
const WIDE_QUERY = "(min-width: 1024px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(WIDE_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

// ══ الزرّ الرئيسي: أيقونة الحفظ · الفعل — بارتفاعٍ واحد في كل مكان ══

function Dock({
  save,
  error,
  children,
}: {
  save: "saving" | "saved" | "failed" | null;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.dock}>
      {error ? (
        <p role="alert" className={styles.dockError}>
          {error}
        </p>
      ) : null}
      <div className={styles.dockBar}>
        <span className={`${styles.dockIcon} ${save === "failed" ? styles.dockFailed : ""}`}>
          {save === "saving" ? (
            <LoaderCircle size={20} className={styles.spin} role="img" aria-label="يُحفظ" />
          ) : save === "failed" ? (
            <CloudAlert size={21} role="img" aria-label="لم يُحفظ — أعد المحاولة" />
          ) : save === "saved" ? (
            <CloudCheck size={21} role="img" aria-label="محفوظ" />
          ) : null}
        </span>
        {children}
        <span />
      </div>
    </div>
  );
}

function DockButton({
  children,
  onClick,
  pending = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={styles.dockMain} onClick={onClick} disabled={pending || disabled} aria-busy={pending}>
      {children}
    </button>
  );
}

function DockMessage({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={`${styles.dockMain} ${styles.dockMsg}`}>
      {icon}
      {children}
    </span>
  );
}

// ══ عدّاد التكرار: دائرةٌ تُضغط مع كل مرة، وحلقةٌ تمتلئ، ودائرة إنقاصٍ بجانبها ══

function Ring({
  count,
  total,
  done,
  disabled,
  minusDisabled,
  onTap,
  onMinus,
  idle = false,
}: {
  count: number;
  total: number;
  done: boolean;
  disabled: boolean;
  minusDisabled: boolean;
  onTap: () => void;
  onMinus: () => void;
  /** يومٌ لا يُرصد الآن — فلا يُدعى إلى الضغط. */
  idle?: boolean;
}) {
  const C = 2 * Math.PI * 37;
  const off = C * (1 - Math.min(count, total) / Math.max(total, 1));
  return (
    <div className={styles.ringArea}>
      <div className={styles.ring}>
        <svg viewBox="0 0 84 84" aria-hidden>
          <circle className={styles.ringTrack} cx="42" cy="42" r="37" />
          <circle className={styles.ringFill} cx="42" cy="42" r="37" strokeDasharray={C} strokeDashoffset={off} />
        </svg>
        <button type="button" className={styles.ringTap} onClick={onTap} disabled={disabled} aria-label="كرّرتُ مرّة">
          <output aria-live="polite">
            <b>{formatNumber(count)}</b>
            <small>من {formatNumber(total)}</small>
          </output>
        </button>
        {done ? null : (
          <button type="button" className={styles.ringMinus} onClick={onMinus} disabled={minusDisabled} aria-label="أنقص تكراراً" title="أنقص تكراراً">
            <Minus size={22} aria-hidden />
          </button>
        )}
      </div>
      <p className={styles.muted}>{done ? "أُتمّ" : idle ? `يُكرَّر ${timesText(total)}` : "اضغط الدائرة مع كل تكرار — ويُتمّ ببلوغ العدد"}</p>
    </div>
  );
}

/** بطاقة اختبارٍ في «رحلتي»: حاله في سطر، ورابطه حين يُدخل أو تُرى نتيجته. */
function ExamCard({ participantId, exam }: { participantId: string; exam: JourneyExam }) {
  const href = `/journey/${participantId}/exam/${exam.id}`;
  const span =
    exam.opensAt && exam.closesAt
      ? `من ${formatDateBoth(exam.opensAt)} إلى ${formatDateBoth(exam.closesAt)}`
      : null;
  let line: string;
  let action: string | null = null;
  if (exam.open) {
    line = "لك محاولةٌ لم تكتمل.";
    action = "أكمل الاختبار";
  } else if (exam.passed) {
    line = `اجتزته بنسبة ${percent(exam.bestPercent ?? 0)}.`;
  } else if (exam.blocker === null) {
    line = exam.attempts > 0 ? `أعلى نتيجة لك ${percent(exam.bestPercent ?? 0)} — ولك محاولةٌ أخرى.` : "الاختبار متاحٌ لك الآن.";
    action = exam.attempts > 0 ? "ابدأ محاولة جديدة" : "ادخل الاختبار";
  } else {
    line = exam.bestPercent !== null ? `${exam.blocker} — أعلى نتيجة لك ${percent(exam.bestPercent)}.` : `${exam.blocker}.`;
  }
  return (
    <section className={styles.exam} aria-label={exam.name}>
      <p className={styles.examName}>{exam.name}</p>
      {span ? <p className={styles.muted}>{span}</p> : null}
      <p>{line}</p>
      {action ? (
        <Link className={styles.examGo} href={href}>
          {action}
        </Link>
      ) : null}
    </section>
  );
}
