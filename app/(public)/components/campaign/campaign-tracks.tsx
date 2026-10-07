"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/format";
import styles from "./campaign.module.css";

export type CampaignTrack = {
  id: string;
  name: string;
  description: string;
  units: number;
  /** فارغ = بلا سقف — فلا شريط مقاعد. */
  capacity: number | null;
  remaining: number | null;
  prizes: { label: string; value: string }[];
  prizeNote: string;
};

/**
 * بطاقات المسارات وجوائز المختار منها. المقاعد من `fn_public_tracks`، والجوائز
 * من عنصر «الجوائز» المنسوب إلى مساره (`adr/0045`) — لا رقمٌ مكتوبٌ مرّتين.
 */
export function CampaignTracks({ tracks, unitLabel }: { tracks: CampaignTrack[]; unitLabel: string }) {
  const [selected, setSelected] = useState(tracks[0]?.id ?? null);
  const current = tracks.find((t) => t.id === selected) ?? null;
  const smallest = Math.min(...tracks.map((t) => t.units));

  return (
    <>
      <div className={styles.tracks}>
        {tracks.map((t) => {
          const full = t.remaining === 0;
          const used = t.capacity ? ((t.capacity - (t.remaining ?? 0)) / t.capacity) * 100 : 0;
          return (
            <button
              key={t.id}
              type="button"
              className={`${styles.track} ${full ? styles.full : ""}`}
              aria-pressed={t.id === selected}
              onClick={() => setSelected(t.id)}
              // ارتفاعٌ يتدرّج بحجم المسار — درجُ صعودٍ من الأخفّ إلى الأثقل.
              style={{ ["--h" as string]: Math.round((t.units - smallest) * 0.75) }}
            >
              <span className={styles.trackName}>{t.name}</span>
              <span className={styles.trackCount}>
                {formatNumber(t.units)}
                {unitLabel ? <small>{unitLabel}</small> : null}
              </span>
              {t.description ? <span className={styles.trackDesc}>{t.description}</span> : null}
              {t.prizes[0] ? (
                <span className={styles.trackPrize}>
                  <span>{t.prizes[0].label}</span>
                  <strong>{t.prizes[0].value}</strong>
                </span>
              ) : null}
              {t.capacity !== null ? (
                <>
                  <span className={styles.seats}>
                    {full
                      ? "اكتملت المقاعد"
                      : `متبقٍّ ${formatNumber(t.remaining ?? 0)} من ${formatNumber(t.capacity)} مقعداً`}
                  </span>
                  <span className={styles.bar} aria-hidden>
                    <i style={{ inlineSize: `${used}%` }} />
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      {current && current.prizes.length > 0 ? (
        <div className={styles.prizes} aria-live="polite">
          <h3>جوائز {current.name}</h3>
          <div className={styles.places}>
            {current.prizes.map((p, i) => (
              <div key={i} className={`${styles.place} ${i === 0 ? styles.placeFirst : ""}`}>
                <span>{p.label}</span>
                <strong>{p.value}</strong>
              </div>
            ))}
          </div>
          {current.prizeNote ? <p className={styles.cond}>{current.prizeNote}</p> : null}
        </div>
      ) : null}
    </>
  );
}
