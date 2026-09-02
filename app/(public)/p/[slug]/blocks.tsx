import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { parseBlockContent, type BlockType } from "@/lib/programs/blocks";
import {
  REGISTRATION_LABEL,
  type RegistrationState,
} from "@/lib/programs/registration";
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
  tracks: { id: string; name: string; description: string; capacity: number | null }[];
  faq: { id: string; question: string; answer: string }[];
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
            <div className={styles.rows}>
              {data.tracks.map((t) => (
                <div key={t.id} className={styles.row}>
                  <span>{t.name}</span>
                  <span className={styles.rowMeta}>
                    {t.description}
                    {c["showCapacity"] && t.capacity !== null
                      ? ` · السعة ${formatNumber(t.capacity)}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      );

    case "faq":
      return (
        <>
          <h2 className={styles.heading}>{String(c["heading"])}</h2>
          {data.faq.length === 0 ? (
            <p className={styles.hint}>لا أسئلة منشورة بعد.</p>
          ) : (
            data.faq.map((item) => (
              <details key={item.id} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>{item.question}</summary>
                <p className={styles.faqAnswer}>{item.answer}</p>
              </details>
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
          <span className={styles.hint}>
            {open
              ? "يتطلب حساباً — يُنشأ في الخطوة التالية"
              : "تابع إعلانات الجمعية لمعرفة موعد الفتح"}
          </span>
        </div>
      );
    }
  }
}
