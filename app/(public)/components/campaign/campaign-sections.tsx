import { Plus } from "lucide-react";
import type { Stage } from "@/lib/programs/campaign-content";
import { groupFaq } from "@/lib/programs/faq";
import styles from "./campaign.module.css";

/**
 * أقسام الحملة المشتركة بين الواجهة ودليل المشارك (قرار الراعي ٢٦ أكتوبر: «الدليل بشكل الواجهة
 * وجماليتها، بلا زر سجّل الآن») — شكلٌ واحد في الصفحتين فلا يفترقان.
 */

/** العنوان بكلمته الأخيرة ملوّنة. */
export function Accented({ text }: { text: string }) {
  const at = text.trim().lastIndexOf(" ");
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)} <span className={styles.accent}>{text.slice(at + 1)}</span>
    </>
  );
}

/** المراحل خطّاً زمنياً: النقطة والعنوان والتاريخان والملاحظة، والجاري موسوم. */
export function CampaignTimeline({ heading, stages }: { heading: string; stages: Stage[] }) {
  return (
    <section className={styles.block} id="stages">
      <div className={styles.wrap}>
        <div className={styles.head}>
          <h2>
            <Accented text={heading} />
          </h2>
        </div>
        <ol className={styles.timeline}>
          {stages.map((s, i) => (
            <li
              key={i}
              className={`${styles.stage} ${s.status === "done" ? styles.stageDone : ""} ${
                s.status === "now" ? styles.stageNow : ""
              }`}
            >
              <span className={styles.dot} aria-hidden />
              <h3>{s.title}</h3>
              {s.dates ? <span className={styles.stageDates}>{s.dates}</span> : null}
              {s.datesSub ? <span className={styles.stageDatesSub}>{s.datesSub}</span> : null}
              {s.note ? <p>{s.note}</p> : null}
              {s.status === "now" ? <span className={styles.nowTag}>جارٍ الآن</span> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** الأسئلة الشائعة مجموعاتٍ تنطوي، وكل سؤالٍ ينطوي. والمطبوع يفتحها كلها (`GuidePrint`). */
export function CampaignFaq({
  heading,
  faq,
}: {
  heading: string;
  faq: readonly { id: string; question: string; answer: string; category: string }[];
}) {
  return (
    <section className={styles.block} id="faq">
      <div className={styles.wrap}>
        <div className={styles.head}>
          <h2>
            <Accented text={heading} />
          </h2>
        </div>
        <div className={styles.faq}>
          {groupFaq(faq).map(([group, items]) => (
            <details key={group || "_"} className={styles.group} open={group === ""}>
              <summary>
                <span>{group || "عام"}</span>
                <span className={styles.plus} aria-hidden>
                  <Plus size={20} strokeWidth={1.5} />
                </span>
              </summary>
              <div className={styles.questions}>
                {items.map((q) => (
                  <details key={q.id} className={styles.question}>
                    <summary>
                      <span>{q.question}</span>
                      <span className={styles.plus} aria-hidden>
                        <Plus size={16} strokeWidth={1.5} />
                      </span>
                    </summary>
                    <p className={styles.answer}>{q.answer}</p>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
