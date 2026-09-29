import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { parseBlockContent, type BlockType } from "@/lib/programs/blocks";
import { groupFaq } from "@/lib/programs/faq";
import {
  REGISTRATION_LABEL,
  type RegistrationState,
} from "@/lib/programs/registration";
import { Countdown } from "./countdown";
import styles from "./blocks.module.css";

/**
 * مُصيّر عناصر الصفحة.
 *
 * **عنصر محتواه تالف يُتخطّى ولا يُسقط الصفحة**: الصفحة المعلنة واجهة الجمعية
 * للناس، وسقوطها كلها لأجل حقل ناقص في عنصر واحد ثمنٌ لا يوازي الخطأ.
 */

export type PageBlock = {
  id: string;
  type: BlockType;
  content: unknown;
};

export type BlockData = {
  slug: string;
  programName: string;
  programSummary: string;
  participantLabel: string;
  registration: RegistrationState;
  tracks: {
    id: string;
    name: string;
    description: string;
    capacity: number | null;
    /** المأخوذ من مقاعد المسار — يُشتقّ منه المتبقي، ولا يُعرَض العدد نفسه. */
    taken: number;
    /** عدد وحدات المادة في نصيب المسار. */
    units: number;
  }[];
  /** موعد إغلاق التسجيل — للعدّاد. فارغ = بلا موعد. */
  closesAt: string | null;
  faq: { id: string; question: string; answer: string; category: string }[];
  attachments: Map<string, string>;
};

export function BlockList({ blocks, data }: { blocks: PageBlock[]; data: BlockData }) {
  return (
    <div className={styles.page}>
      {blocks.map((block) => {
        const parsed = parseBlockContent(block.type, block.content);
        if (!parsed.ok) return null;
        return (
          <section key={block.id} className={styles.block}>
            {renderBlock(block.type, parsed.content as Record<string, unknown>, data)}
          </section>
        );
      })}
    </div>
  );
}

/**
 * المحتوى يصل هنا **بعد** تحقّق مخطّط نوعه، فالمفاتيح مضمونة.
 * والنوع `Record` لا اتحاد مميَّز: الاتحاد يحتاج حقل تمييز داخل المحتوى نفسه،
 * وإضافته تكراراً لعمود `block_type` القائم.
 */
function renderBlock(type: BlockType, c: Record<string, unknown>, data: BlockData) {
  switch (type) {
    case "header":
      return (
        <>
          <h1 className={styles.title}>{String(c["title"])}</h1>
          {c["subtitle"] ? <p className={styles.subtitle}>{String(c["subtitle"])}</p> : null}
        </>
      );

    case "free_text":
      return (
        <>
          {c["heading"] ? <h2 className={styles.heading}>{String(c["heading"])}</h2> : null}
          <p className={styles.text}>{String(c["text"])}</p>
        </>
      );

    case "image": {
      const src = data.attachments.get(String(c["attachmentId"]));
      if (!src) return null;
      // eslint-disable-next-line @next/next/no-img-element -- مرفق برفع المستخدم، بأبعاد غير معروفة مسبقاً
      return <img className={styles.image} src={src} alt={String(c["alt"] ?? "")} />;
    }

    case "tracks":
      return (
        <>
          <h2 className={styles.heading}>{String(c["heading"])}</h2>
          {data.tracks.length === 0 ? (
            <p className={styles.hint}>لم تُعلَن المسارات بعد.</p>
          ) : (
            <div className={styles.cards}>
              {data.tracks.map((t) => {
                // **المتبقي لا العدد**: كم بقي لك، لا كم سبقك — والمقعد السالب صفر.
                const left = t.capacity === null ? null : Math.max(0, t.capacity - t.taken);
                return (
                  <div key={t.id} className={styles.card}>
                    <span className={styles.cardName}>{t.name}</span>
                    {c["showUnits"] && t.units > 0 ? (
                      <span className={styles.cardFigure}>{formatNumber(t.units)}</span>
                    ) : null}
                    {t.description ? (
                      <span className={styles.cardNote}>{t.description}</span>
                    ) : null}
                    {c["showCapacity"] && left !== null ? (
                      <span className={left === 0 ? styles.cardFull : styles.cardSeats}>
                        {left === 0
                          ? "اكتملت المقاعد"
                          : `متبقٍ ${formatNumber(left)} من ${formatNumber(t.capacity ?? 0)} مقعداً`}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      );

    case "hero":
      return (
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>{String(c["title"])}</h1>
          {c["subtitle"] ? <p className={styles.heroText}>{String(c["subtitle"])}</p> : null}
          {c["primaryLabel"] || c["secondaryLabel"] ? (
            <span className={styles.heroActions}>
              {c["primaryLabel"] ? (
                <Link href={String(c["primaryHref"] || "#")} className={styles.ctaButton}>
                  {String(c["primaryLabel"])}
                </Link>
              ) : null}
              {c["secondaryLabel"] ? (
                <Link href={String(c["secondaryHref"] || "#")} className={styles.heroGhost}>
                  {String(c["secondaryLabel"])}
                </Link>
              ) : null}
            </span>
          ) : null}
        </div>
      );

    case "countdown":
      // بلا موعد إغلاقٍ في البرنامج لا عدّاد — ولا يُخترَع له تاريخ.
      if (!data.closesAt) return null;
      return (
        <div className={styles.countdownBox}>
          <h2 className={styles.heading}>{String(c["heading"])}</h2>
          <Countdown closesAt={data.closesAt} endedText={String(c["endedText"])} />
        </div>
      );

    case "stats": {
      const items = Array.isArray(c["items"]) ? (c["items"] as Record<string, string>[]) : [];
      if (items.length === 0) return null;
      return (
        <>
          {c["heading"] ? <h2 className={styles.heading}>{String(c["heading"])}</h2> : null}
          <div className={styles.stats}>
            {items.map((item, i) => (
              <span key={i} className={styles.stat}>
                <span className={`${styles.statValue} tabular`}>{item["value"]}</span>
                <span className={styles.statLabel}>{item["label"]}</span>
              </span>
            ))}
          </div>
        </>
      );
    }

    case "timeline": {
      const stages = Array.isArray(c["stages"]) ? (c["stages"] as Record<string, string>[]) : [];
      if (stages.length === 0) return null;
      return (
        <>
          <h2 className={styles.heading}>{String(c["heading"])}</h2>
          <ol className={styles.timeline}>
            {stages.map((stage, i) => (
              <li key={i} className={styles.stage}>
                <span className={styles.stageTitle}>{stage["title"]}</span>
                {stage["dates"] ? <span className={styles.stageDates}>{stage["dates"]}</span> : null}
                {stage["note"] ? <span className={styles.stageNote}>{stage["note"]}</span> : null}
              </li>
            ))}
          </ol>
        </>
      );
    }

    case "prizes": {
      const places = Array.isArray(c["places"]) ? (c["places"] as Record<string, string>[]) : [];
      if (places.length === 0) return null;
      return (
        <>
          <h2 className={styles.heading}>{String(c["heading"])}</h2>
          <div className={styles.rows}>
            {places.map((place, i) => (
              <div key={i} className={styles.row}>
                <span>{place["label"]}</span>
                <span className={`${styles.rowMeta} tabular`}>{place["value"]}</span>
              </div>
            ))}
          </div>
          {c["note"] ? <p className={styles.hint}>{String(c["note"])}</p> : null}
        </>
      );
    }

    case "terms": {
      const items = Array.isArray(c["items"]) ? (c["items"] as string[]) : [];
      if (items.length === 0) return null;
      return (
        <>
          <h2 className={styles.heading}>{String(c["heading"])}</h2>
          <ul className={styles.terms}>
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </>
      );
    }

    case "cta":
      return (
        <div className={styles.cta}>
          {c["heading"] ? <h2 className={styles.heading}>{String(c["heading"])}</h2> : null}
          <p className={styles.text}>{String(c["text"])}</p>
          {c["buttonLabel"] ? (
            <Link href={String(c["buttonHref"] || "#")} className={styles.ctaButton}>
              {String(c["buttonLabel"])}
            </Link>
          ) : null}
        </div>
      );

    case "faq":
      return (
        <>
          <h2 className={styles.heading}>{String(c["heading"])}</h2>
          {data.faq.length === 0 ? (
            <p className={styles.hint}>لا أسئلة منشورة بعد.</p>
          ) : (
            // مجموعةً مجموعة بترتيب أول سؤالٍ فيها — وما لا مجموعة له يتقدّم بلا عنوان.
            groupFaq(data.faq).map(([category, items]) => (
              <section key={`group:${category}`} className={styles.faqGroup}>
                {category ? <h3 className={styles.faqGroupTitle}>{category}</h3> : null}
                {items.map((item) => (
                  <details key={item.id} className={styles.faqItem}>
                    <summary className={styles.faqQuestion}>{item.question}</summary>
                    <p className={styles.faqAnswer}>{item.answer}</p>
                  </details>
                ))}
              </section>
            ))
          )}
        </>
      );

    case "registration": {
      const open = data.registration === "open";
      return (
        <div className={styles.cta}>
          {c["heading"] ? <h2 className={styles.heading}>{String(c["heading"])}</h2> : null}
          {open ? (
            <Link href={`/p/${data.slug}/register`} className={styles.ctaButton}>
              {String(c["buttonLabel"])}
            </Link>
          ) : (
            <span className={`${styles.ctaButton} ${styles.ctaDisabled}`}>
              {REGISTRATION_LABEL[data.registration]}
            </span>
          )}
          {open ? <span className={styles.hint}>التسجيل بحسابك في المنصة</span> : null}
        </div>
      );
    }
  }
}
