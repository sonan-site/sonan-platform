import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { cardStatus, defaultDay, followsPlan, parseJourneyState, remainingText, type CardTone, type JourneyState } from "@/lib/participants/journey";
import { formatNumber } from "@/lib/format";
import { formatRegistrationNo } from "@/lib/programs/registration";
import styles from "./list.module.css";

type Card = {
  id: string;
  name: string;
  track: string | null;
  registrationNo: string | null;
  active: boolean;
  state: JourneyState | null;
  status: { tone: CardTone; text: string } | null;
  failed: boolean;
};

const TONE: Record<CardTone, string | undefined> = {
  now: styles.chipNow,
  done: styles.chipDone,
  wait: undefined,
  warn: styles.chipWarn,
  rest: undefined,
};

/**
 * رحلات المستخدم — مشاركاته في البرامج (خطة رحلتي ر١–ر٤). مستخدم ↔ مشارك واحد إلى متعدد.
 *
 * **من له مشاركةٌ واحدة يدخل واجبه مباشرة** — لا صفحةٌ وسيطة فيها بطاقةٌ واحدة.
 */
export default async function JourneyListPage() {
  const session = await getSession();
  if (session.status !== "active") {
    return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترى رحلتك." />;
  }

  const db = await createClient();
  const { data, error } = await db
    .from("participants")
    .select("id, status, track_id, registration_no, programs!inner(id, name, registration_prefix), tracks(name)")
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: false });

  if (error) return <ErrorState body="تعذّر جلب مشاركاتك." />;

  const rows = data ?? [];
  if (rows.length === 1) redirect(`/journey/${rows[0]!.id}`);

  // حال كل مشاركةٍ من الدالتين اللتين يقرأ منهما الواجب نفسه — فالبطاقة لا تخالف الشاشة.
  // تعذّر إحداها يُقال في بطاقتها ولا يُسقط القائمة.
  const cards: Card[] = await Promise.all(
    rows.map(async (row): Promise<Card> => {
      const program = row.programs as unknown as { name: string; registration_prefix: string | null };
      const track = row.tracks as unknown as { name: string } | null;
      const base = {
        id: row.id,
        name: program.name,
        track: track?.name ?? null,
        registrationNo: formatRegistrationNo(program.registration_prefix, row.registration_no),
        active: followsPlan(row.status),
        state: null,
        status: null,
        failed: false,
      };
      if (!base.active || !row.track_id) return base;

      const stateResult = await db.rpc("fn_journey_state", { p_participant_id: row.id });
      if (stateResult.error) return { ...base, failed: true };
      let state: JourneyState | null;
      try {
        state = parseJourneyState(stateResult.data);
      } catch {
        return { ...base, failed: true };
      }
      if (!state) return { ...base, status: { tone: "wait", text: "خطة مسارك ليست جاهزة" } };

      let steps: { isRequired: boolean; markedAt: string | null }[] = [];
      if (state.stage === "tasks") {
        const tasks = await db.rpc("fn_day_tasks", { p_participant_id: row.id, p_day: state.currentDay });
        if (tasks.error) return { ...base, state, failed: true };
        steps = (tasks.data ?? []).map((t) => ({ isRequired: t.is_required, markedAt: t.marked_at }));
      }
      return { ...base, state, status: cardStatus(state, steps) };
    }),
  );
  // النشط أولاً، ثم ما انتهت رحلته — والترتيب داخل كلٍّ بالأحدث انضماماً.
  cards.sort((a, b) => Number(b.active) - Number(a.active));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>رحلتي</h1>

      {cards.length === 0 ? (
        <EmptyState
          kind="no-data"
          title="لست مشاركاً في أي برنامج"
          body="تصفّح البرامج المعلنة وسجّل في أحدها، ثم يظهر واجبك اليومي هنا."
          action={<Link href="/">تصفّح البرامج</Link>}
        />
      ) : (
        <ul className={styles.list}>
          {cards.map((c) => (
            <li key={c.id}>
              <Link href={`/journey/${c.id}`} className={`${styles.card} ${c.active ? "" : styles.ended}`}>
                <span className={styles.top}>
                  <b className={styles.name}>{c.name}</b>
                  {c.active ? (
                    c.status ? (
                      <span className={`${styles.chip} ${TONE[c.status.tone] ?? ""}`}>{c.status.text}</span>
                    ) : null
                  ) : (
                    <span className={styles.chip}>انتهت رحلتك</span>
                  )}
                </span>

                <span className={styles.meta}>
                  {[
                    c.state && c.state.stage !== "not_started" && c.state.stage !== "finished"
                      ? `اليوم ${formatNumber(defaultDay(c.state))} من ${formatNumber(c.state.dayCount)}`
                      : null,
                    c.track ?? (c.active ? "لم يُحدَّد مسارك" : null),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {c.registrationNo ? (
                    <>
                      {" · "}
                      <bdi dir="ltr" className={styles.no}>
                        {c.registrationNo}
                      </bdi>
                    </>
                  ) : null}
                </span>

                {c.state && c.active ? (
                  <>
                    <span className={styles.bar} aria-hidden>
                      <i style={{ inlineSize: `${Math.min(100, Math.max(0, c.state.progressPct))}%` }} />
                    </span>
                    <span className={styles.foot}>
                      <span>{remainingText(c.state)}</span>
                      <span>{formatNumber(Math.round(c.state.progressPct))}٪</span>
                    </span>
                  </>
                ) : null}

                {c.failed ? <span className={styles.meta}>تعذّر جلب حالك الآن — افتحه لترى واجبك.</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
