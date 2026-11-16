import { Suspense } from "react";
import { FilterBar, FilterSelect } from "@/components/shared/filter-select";
import { hrefWith, type SearchParams } from "@/components/shared/filter-links";
import { Button } from "@/components/shared/form";
import { DEFAULT_PAGE_SIZE } from "@/components/shared/data-table";
import { PageHead } from "@/components/shared/steps";
import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { formatDate, formatNumber, now, toDateInput } from "@/lib/format";
import {
  ACTIVITY_SINCE,
  addDays,
  AUDIENCE_LABEL,
  AUDIENCES,
  BUCKET_LABEL,
  bucketsFor,
  dayLabel,
  hoursLabel,
  parseStatsQuery,
  periodLabel,
  RANGE_LABEL,
  RANGES,
  spanDays,
} from "@/lib/stats/activity";
import { ActivityBars, PeakMap, type Point } from "./charts";
import { StatsTable } from "./stats-table";
import styles from "./stats.module.css";

/**
 * إحصاءات النشاط والدخول (adr/0061): كم شخصاً استخدم المنصة في كل فترة — أعدادٌ لا أسماء.
 *
 * **البوّابة بالصلاحية بأي نطاق** (مراجعة ح٢) — لا `authorizeRequest` بلا برنامج، فذاك يردّ المحصور.
 * والنطاق نفسه تفرضه `fn_activity_stats`: المحصور يرى طلاب برامج نطاقه وحدها.
 */
export default async function StatsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  const scopes = session.status === "active" ? session.permissions.get("stats.read") : undefined;
  if (!scopes) return <ErrorState title="غير مصرَّح" body="لا تملك صلاحية الإحصاءات." />;

  const global = scopes.has(null);
  const scoped = [...scopes].filter((s): s is string => s !== null);
  const sp = await searchParams;
  const today = toDateInput(now());

  const db = await createClient();
  // البرامج القائمة أولاً — فالمحصور يُختار له من برامج نطاقه ما بقي منها لا ما حُذف.
  const programsQuery = db.from("programs").select("id, name").is("deleted_at", null).order("created_at");
  const programs = (await (global ? programsQuery : programsQuery.in("id", scoped))).data ?? [];
  if (!global && programs.length === 0) {
    return <ErrorState title="لا برنامج في نطاقك" body="صلاحيتك محصورة ببرنامجٍ لم يعد قائماً." />;
  }
  const q = parseStatsQuery(sp, today, { global, programs: programs.map((p) => p.id) });

  const tracks = q.program
    ? ((await db.from("tracks").select("id, name").eq("program_id", q.program).is("deleted_at", null).order("sort_order"))
        .data ?? [])
    : [];
  // مسارٌ في الرابط ليس من البرنامج يسقط هنا — لا يُرسل لتردّه القاعدة.
  const track = q.track && tracks.some((t) => t.id === q.track) ? q.track : null;

  // **الأيام المقيسة المكتملة** (مراجعة الكود م١): ما قبل التشغيل لا بيانات له، واليوم الجاري لم يكتمل —
  // فلا يدخلان المتوسط ولا مقام الخريطة صفراً.
  const measuredFrom = q.from > ACTIVITY_SINCE ? q.from : ACTIVITY_SINCE;
  const yesterday = addDays(today, -1);
  const completeTo = q.to < yesterday ? q.to : yesterday;
  const hasComplete = measuredFrom <= completeTo;

  const scope = { p_audience: q.audience, p_program: q.program ?? undefined, p_track: track ?? undefined };
  const [series, todayResult, daily, heat] = await Promise.all([
    db.rpc("fn_activity_stats", { p_from: q.from, p_to: q.to, p_bucket: q.bucket, ...scope }),
    db.rpc("fn_activity_stats", { p_from: today, p_to: today, p_bucket: "day", ...scope }),
    hasComplete
      ? db.rpc("fn_activity_stats", { p_from: measuredFrom, p_to: completeTo, p_bucket: "day", ...scope })
      : null,
    hasComplete ? db.rpc("fn_activity_heatmap", { p_from: measuredFrom, p_to: completeTo, ...scope }) : null,
  ]);
  if (series.error || todayResult.error || daily?.error || heat?.error) {
    return <ErrorState body="تعذّر جلب الإحصاءات." />;
  }

  const points: Point[] = (series.data ?? []).map((r) => ({
    start: r.period_start,
    active: r.active,
    signedIn: r.signed_in,
    label: periodLabel(r.period_start, q.bucket),
  }));
  const days = daily?.data ?? [];
  const todayRow = todayResult.data?.[0];
  const peak = points.reduce<Point | null>((best, p) => (p.active > (best?.active ?? 0) ? p : best), null);
  const averagePerDay = days.length > 0 ? days.reduce((sum, d) => sum + d.active, 0) / days.length : 0;
  const empty = points.every((p) => p.active === 0);

  // ── جدول الأرقام: الأحدث أولاً، بصفحاتٍ من الرابط ──
  const pageParam = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const lastPage = Math.max(1, Math.ceil(points.length / DEFAULT_PAGE_SIZE));
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? Math.min(pageParam, lastPage) : 1;
  const tableRows = [...points].reverse().slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);

  // ── المرشّحات: روابطٌ تحسبها الصفحة، والقائمة المنسدلة تقرأ قيمتها ──
  const link = (patch: Record<string, string | null>) => hrefWith("/stats", sp, patch);
  const allowedBuckets = bucketsFor(spanDays(q.from, q.to));

  return (
    <div className={styles.page}>
      <PageHead
        crumbs={[{ href: "/dashboard", label: "لوحة المتابعة" }]}
        title="الإحصاءات"
        lede="كم شخصاً استخدم المنصة في كل فترة بتوقيت الرياض — أعدادٌ لا أسماء. «النشطون» من فتحها، و«الداخلون» من بدأ جلسة دخولٍ جديدة."
      />

      <Suspense>
        <FilterBar>
          <FilterSelect
            label="المدى"
            param="range"
            clears={["from", "to", "bucket"]}
            links={RANGES.map((r) => ({ label: RANGE_LABEL[r], href: link({ range: r }), current: q.range === r }))}
          />
          <FilterSelect
            label="التجميع"
            param="bucket"
            links={allowedBuckets.map((b) => ({ label: BUCKET_LABEL[b], href: link({ bucket: b }), current: q.bucket === b }))}
          />
          {global ? (
            <FilterSelect
              label="الفئة"
              param="audience"
              clears={["program", "track"]}
              links={AUDIENCES.map((a) => ({ label: AUDIENCE_LABEL[a], href: link({ audience: a }), current: q.audience === a }))}
            />
          ) : null}
          {q.audience === "student" ? (
            <FilterSelect
              label="البرنامج"
              param="program"
              clears={["track"]}
              links={[
                ...(global ? [{ label: "كل البرامج", href: link({ program: null }), current: !q.program }] : []),
                ...programs.map((p) => ({ label: p.name, href: link({ program: p.id }), current: q.program === p.id })),
              ]}
            />
          ) : null}
          {q.program && tracks.length > 0 ? (
            <FilterSelect
              label="المسار"
              param="track"
              links={[
                { label: "كل المسارات", href: link({ track: null }), current: !track },
                ...tracks.map((t) => ({ label: t.name, href: link({ track: t.id }), current: track === t.id })),
              ]}
            />
          ) : null}
        </FilterBar>
      </Suspense>

      {q.range === "custom" ? (
        <form className={styles.custom} action="/stats" method="get">
          {Object.entries({ range: "custom", bucket: q.bucket, audience: q.audience, program: q.program, track }).map(
            ([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null),
          )}
          <label>
            من
            <input type="date" name="from" defaultValue={q.from} min={ACTIVITY_SINCE} max={today} dir="ltr" />
          </label>
          <label>
            إلى
            <input type="date" name="to" defaultValue={q.to} min={ACTIVITY_SINCE} max={today} dir="ltr" />
          </label>
          <Button type="submit" variant="primary">
            اعرض
          </Button>
        </form>
      ) : null}

      <p className={styles.span}>
        {q.from === q.to ? dayLabel(q.from + "T12:00:00+03:00") : `${formatDate(q.from + "T12:00:00+03:00")} – ${formatDate(q.to + "T12:00:00+03:00")}`}
        {" · "}
        {AUDIENCE_LABEL[q.audience]}
        {q.program ? ` · ${programs.find((p) => p.id === q.program)?.name ?? ""}` : ""}
        {track ? ` · ${tracks.find((t) => t.id === track)?.name ?? ""}` : ""}
      </p>

      <section className={styles.kpis} aria-label="المؤشرات">
        <div className={styles.kpi}>
          <span>نشطو اليوم</span>
          <b>{formatNumber(todayRow?.active ?? 0)}</b>
          <small>من فتح المنصة منذ منتصف الليل</small>
        </div>
        <div className={styles.kpi}>
          <span>داخلو اليوم</span>
          <b>{formatNumber(todayRow?.signed_in ?? 0)}</b>
          <small>بدأوا جلسة دخولٍ جديدة</small>
        </div>
        <div className={styles.kpi}>
          <span>ذروة المدى</span>
          <b>{formatNumber(peak?.active ?? 0)}</b>
          <small>{peak ? `${dayLabel(peak.start)}${hoursLabel(peak.start, q.bucket) ? ` · ${hoursLabel(peak.start, q.bucket)}` : ""}` : "لا نشاط بعد"}</small>
        </div>
        <div className={styles.kpi}>
          <span>متوسط النشطين يومياً</span>
          <b>{days.length > 0 ? formatNumber(Math.round(averagePerDay)) : "—"}</b>
          <small>{days.length > 0 ? `في ${formatNumber(days.length)} يوماً مكتملاً` : "لا يوم مكتمل في المدى بعد"}</small>
        </div>
      </section>

      {empty ? (
        <p className={styles.note}>
          لا نشاط مسجّل في هذا المدى. بدأ تسجيل النشاط في {formatDate(ACTIVITY_SINCE + "T12:00:00+03:00")}، ولا أرقام قبله.
        </p>
      ) : (
        <>
          <section className={styles.box} aria-label="النشطون في كل فترة">
            <h2 className={styles.h2}>النشطون في كل {BUCKET_LABEL[q.bucket]}</h2>
            <ActivityBars points={points} bucket={q.bucket} />
          </section>

          <section className={styles.box} aria-label="أوقات الذروة">
            <h2 className={styles.h2}>أوقات الذروة</h2>
            <p className={styles.hint}>متوسط النشطين في كل ساعة من أيام الأسبوع، في الأيام المكتملة من المدى — الأغمق أكثر.</p>
            {heat ? (
              <>
                {spanDays(measuredFrom, completeTo) < 7 ? (
                  <p className={styles.hint}>المدى المكتمل أقصر من أسبوع، فبعض أيام الأسبوع بلا بيانات بعد.</p>
                ) : null}
                <PeakMap
                  cells={(heat.data ?? []).map((c) => ({ weekday: c.weekday, hour: c.hour, average: Number(c.average) }))}
                />
              </>
            ) : (
              <p className={styles.hint}>تظهر الخريطة بعد أول يومٍ مكتمل في المدى.</p>
            )}
          </section>

          <section className={styles.box} aria-label="الأرقام">
            <h2 className={styles.h2}>الأرقام — الأحدث أولاً</h2>
            <StatsTable rows={tableRows} total={points.length} page={page} />
          </section>
        </>
      )}
    </div>
  );
}
