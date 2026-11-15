import { formatNumber } from "@/lib/format";
import { clockLabel, tickLabel, WEEKDAYS, type Bucket } from "@/lib/stats/activity";
import { ScrollToLatest } from "./scroll-to-latest";
import styles from "./stats.module.css";

/**
 * رسما الإحصاءات بلا مكتبة: أعمدةٌ وشبكة — CSS وحده (adr/0061).
 * **محور الزمن من اليمين** صراحةً (`direction: rtl` في الأنماط): الأقدم أولاً جهة البداية، كسطر الصفحة.
 */

export type Point = { start: string; active: number; signedIn: number; label: string };

/** أعمدة النشطين، والداخلون جزءٌ أفتح في أسفل كل عمود. */
export function ActivityBars({ points, bucket }: { points: Point[]; bucket: Bucket }) {
  const max = Math.max(1, ...points.map((p) => p.active));
  // نحو عشر تسمياتٍ على المحور — والباقي في تلميح العمود وفي جدول الأرقام.
  const every = Math.max(1, Math.ceil(points.length / 10));

  return (
    <>
      <ScrollToLatest className={styles.chartWrap}>
        <div className={styles.axisMax} aria-hidden>
          {formatNumber(max)}
        </div>
        <ol className={styles.bars} style={{ minInlineSize: `${Math.max(points.length * 0.75, 10)}rem` }}>
          {points.map((p, i) => (
            <li key={p.start} className={styles.barCol} title={`${p.label}: ${formatNumber(p.active)} نشطاً · ${formatNumber(p.signedIn)} داخلاً`}>
              <span className={styles.barTrack}>
                <span className={styles.bar} style={{ blockSize: `${(p.active / max) * 100}%` }}>
                  <span
                    className={styles.barSigned}
                    style={{ blockSize: `${p.active > 0 ? (p.signedIn / p.active) * 100 : 0}%` }}
                  />
                </span>
              </span>
              <span className={styles.tick} aria-hidden>
                {i % every === 0 ? tickLabel(p.start, bucket) : ""}
              </span>
              <span className={styles.srOnly}>
                {p.label}: {formatNumber(p.active)} نشطاً، منهم {formatNumber(p.signedIn)} داخلاً
              </span>
            </li>
          ))}
        </ol>
      </ScrollToLatest>
      <ul className={styles.legend}>
        <li>
          <i className={styles.bar} aria-hidden /> النشطون
        </li>
        <li>
          <i className={styles.barSigned} aria-hidden /> منهم الداخلون
        </li>
      </ul>
    </>
  );
}

/** متوسط النشطين لكل يوم أسبوع × ساعة — الأغمق أكثر. */
export function PeakMap({ cells }: { cells: { weekday: number; hour: number; average: number }[] }) {
  const max = Math.max(0, ...cells.map((c) => c.average));
  const at = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.average]));
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className={styles.tableWrap}>
      <div className={styles.peak} role="table" aria-label="متوسط النشطين لكل يوم وساعة">
        <div role="row" className={styles.peakRow}>
          <span role="columnheader" />
          {hours.map((h) => (
            <span key={h} role="columnheader" className={styles.peakHour}>
              {h % 3 === 0 ? clockLabel(h) : ""}
            </span>
          ))}
        </div>
        {WEEKDAYS.map((name, d) => (
          <div key={name} role="row" className={styles.peakRow}>
            <span role="rowheader" className={styles.peakDay}>
              {name}
            </span>
            {hours.map((h) => {
              const value = at.get(`${d}:${h}`) ?? 0;
              const level = max > 0 ? Math.ceil((value / max) * 4) : 0;
              return (
                <i
                  key={h}
                  role="cell"
                  className={`${styles.peakCell} ${styles[`level${level}`] ?? ""}`}
                  title={`${name} · ${clockLabel(h)}: ${formatNumber(value)} في المتوسط`}
                  aria-label={`${name} الساعة ${clockLabel(h)}: ${formatNumber(value)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
