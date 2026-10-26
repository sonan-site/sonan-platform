import Link from "next/link";
import { BookOpen, Check } from "lucide-react";
import { formatDate, formatDateBoth, formatNumber } from "@/lib/format";
import { campaignStages, campaignTracks, collectBlocks, countWith, parseContact } from "@/lib/programs/campaign-content";
import type { PublicProgram } from "@/lib/programs/public-page-server";
import { Accented, CampaignFaq, CampaignTimeline } from "./campaign-sections";
import { GuidePrint } from "./guide-print";
import styles from "./campaign.module.css";
import guide from "./guide.module.css";

export type GuideExam = {
  id: string;
  name: string;
  examType: "remote" | "oral";
  trackId: string | null;
  entryPercentage: number | null;
  passPercentage: number;
  maxAttempts: number | null;
  questionCount: number;
  secondsPerQuestion: number | null;
  prerequisiteName: string | null;
  awardPercentage: number | null;
};

export type GuideUpdate = { id: string; date: string; body: string };

const pct = (n: number) => `${formatNumber(n)}٪`;
const QUESTIONS = { one: "سؤال واحد", two: "سؤالان", few: "أسئلة", many: "سؤالاً", bare: "سؤال" };
const SECONDS = { one: "ثانية واحدة", two: "ثانيتان", few: "ثوانٍ", many: "ثانية", bare: "ثانية" };
const ATTEMPTS = { one: "محاولة واحدة", two: "محاولتان", few: "محاولات", many: "محاولةً", bare: "محاولة" };

/**
 * دليل المشارك (خطة دليل المشارك · د) — محتوى الواجهة نفسه **بلا خاصية التسجيل**: لا أزرار ولا عدّاد
 * ولا مقاعد، للقراءة والرجوع والطباعة. كله حيٌّ من المنصة، ومن الوحدة المشتركة مع الواجهة فلا يختلفان.
 */
export function CampaignGuide({
  program,
  sections,
  materials,
  exams,
  updates,
  printedOn,
}: {
  program: PublicProgram;
  /** أبواب كل مسار بعدد وحداته منها. */
  sections: Map<string, { name: string; units: number }[]>;
  /** رابط مادة كل مسار (ملفّ الكتاب PDF) — ما لا رابط له لا يظهر له سطر. */
  materials: Map<string, string>;
  exams: GuideExam[];
  /** الأحدث أولاً. */
  updates: GuideUpdate[];
  /** «اليوم» — لسطر «طُبع في» في النسخة المطبوعة. */
  printedOn: string;
}) {
  const { data } = program;
  const blocks = collectBlocks(program.blocks);
  const hero = blocks.hero?.[0];
  const stats = blocks.stats?.[0];
  const timeline = blocks.timeline?.[0];
  const terms = blocks.terms?.[0];
  const faqBlock = blocks.faq?.[0];
  const stages = campaignStages(timeline, data);
  const tracks = campaignTracks(data, blocks.prizes ?? []);
  const contact = parseContact(data.contact);
  const latest = updates[0] ?? null;
  const trackName = new Map(data.tracks.map((t) => [t.id, t.name]));

  const toc: [string, string, boolean][] = [
    ["about", "عن المسابقة", true],
    ["stages", timeline?.heading || "مراحل المسابقة", stages.length > 0],
    ["tracks", "المسارات والجوائز", tracks.length > 0],
    ["exams", "الاختبارات", exams.length > 0],
    ["terms", terms?.heading || "الشروط والأحكام", Boolean(terms && terms.items.length > 0)],
    ["faq", faqBlock?.heading || "الأسئلة الشائعة", data.faq.length > 0],
    ["contact", "التواصل", contact !== null],
    ["updates", "سجل التحديثات", updates.length > 0],
  ];

  return (
    <div className={`${styles.root} ${guide.root}`} data-campaign>
      <header className={`${styles.top} ${guide.noPrint}`}>
        <div className={`${styles.wrap} ${styles.topRow}`}>
          <Link className={styles.brand} href="/" aria-label="واجهة المسابقة">
            {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
            <img src="/brand/sunan-logo.png" alt="جمعية سنن التعليمية" />
          </Link>
          <GuidePrint />
        </div>
      </header>

      <main>
        <section className={`${styles.block} ${guide.cover}`} aria-labelledby="guide-title">
          <div className={styles.wrap}>
            <p className={guide.eyebrow}>دليل المشارك</p>
            <h1 id="guide-title" className={guide.title}>
              {data.programName}
            </h1>
            {latest ? (
              <p className={guide.latest}>
                <b>آخر تحديث معلن:</b> {formatDateBoth(latest.date)} — {latest.body}
              </p>
            ) : null}
            <p className={`${guide.printedOn} ${guide.printOnly}`}>طُبع في {formatDateBoth(printedOn)}</p>

            {/* فهرس الصفحة — روابط مرساة لا عنصر تنقّل (`nav-outside-source`). */}
            <div className={`${guide.toc} ${guide.noPrint}`} role="group" aria-label="أقسام الدليل">
              {toc
                .filter(([, , show]) => show)
                .map(([id, label]) => (
                  <a key={id} href={`#${id}`}>
                    {label}
                  </a>
                ))}
            </div>
          </div>
        </section>

        <section className={styles.block} id="about">
          <div className={styles.wrap}>
            <div className={styles.head}>
              <h2>
                <Accented text="عن المسابقة" />
              </h2>
            </div>
            <p className={guide.lede}>{hero?.subtitle || data.programSummary}</p>
            {stats && stats.items.length > 0 ? (
              <dl className={guide.facts}>
                {stats.items.map((item, i) => (
                  <div key={i}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>

        {stages.length > 0 ? <CampaignTimeline heading={timeline?.heading || "مراحل المسابقة"} stages={stages} /> : null}

        {tracks.length > 0 ? (
          <section className={styles.block} id="tracks">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text="المسارات والجوائز" />
                </h2>
              </div>
              <div className={guide.cards}>
                {tracks.map((t) => (
                  <article key={t.id} className={`${guide.card} ${guide.keep}`} aria-labelledby={`track-${t.id}`}>
                    <h3 id={`track-${t.id}`}>
                      {t.name}
                      <span className={guide.count}>
                        {formatNumber(t.units)} {data.unitLabel}
                      </span>
                    </h3>
                    {t.description ? <p>{t.description}</p> : null}
                    {(sections.get(t.id) ?? []).length > 0 ? (
                      <ul className={guide.sections}>
                        {(sections.get(t.id) ?? []).map((s) => (
                          <li key={s.name}>
                            {s.name}
                            <span>{formatNumber(s.units)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {materials.get(t.id) ? (
                      <a href={materials.get(t.id)} target="_blank" rel="noopener noreferrer" className={guide.material}>
                        <BookOpen size={16} aria-hidden />
                        مادة الحفظ (PDF)
                      </a>
                    ) : null}
                    {t.prizes.length > 0 ? (
                      <>
                        <h4>الجوائز</h4>
                        <dl className={guide.prizes}>
                          {t.prizes.map((p, i) => (
                            <div key={i}>
                              <dt>{p.label}</dt>
                              <dd>{p.value}</dd>
                            </div>
                          ))}
                        </dl>
                        {t.prizeNote ? <p className={guide.note}>{t.prizeNote}</p> : null}
                      </>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {exams.length > 0 ? (
          <section className={styles.block} id="exams">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text="الاختبارات" />
                </h2>
              </div>
              <div className={guide.cards}>
                {exams.map((e) => (
                  <article key={e.id} className={`${guide.card} ${guide.keep}`} aria-labelledby={`exam-${e.id}`}>
                    <h3 id={`exam-${e.id}`}>
                      {e.name}
                      <span className={guide.count}>{e.examType === "remote" ? "عن بعد في المنصة" : "شفهي حضوري"}</span>
                    </h3>
                    {e.trackId && trackName.get(e.trackId) ? <p className={guide.note}>خاصٌّ بـ{trackName.get(e.trackId)}</p> : null}
                    <ul className={guide.rules}>
                      {e.entryPercentage ? <li>يُدخل بإتمام {pct(e.entryPercentage)} من الخطة.</li> : null}
                      {e.prerequisiteName ? <li>ويُشترط اجتياز «{e.prerequisiteName}».</li> : null}
                      <li>النجاح بـ{pct(e.passPercentage)}.</li>
                      {e.examType === "remote" ? (
                        <li>
                          {countWith(e.questionCount, QUESTIONS, formatNumber)}
                          {e.secondsPerQuestion ? `، ${countWith(e.secondsPerQuestion, SECONDS, formatNumber)} لكل سؤال` : ""}
                          {e.maxAttempts ? `، و${countWith(e.maxAttempts, ATTEMPTS, formatNumber)} يُعتدّ بأعلاها` : ""}.
                        </li>
                      ) : null}
                      {e.awardPercentage ? <li>أهلية الجائزة بـ{pct(e.awardPercentage)} فأكثر.</li> : null}
                    </ul>
                  </article>
                ))}
              </div>
              <p className={guide.note}>مواعيد الاختبارات في «{timeline?.heading || "مراحل المسابقة"}» أعلاه.</p>
            </div>
          </section>
        ) : null}

        {terms && terms.items.length > 0 ? (
          <section className={styles.block} id="terms">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text={terms.heading || "الشروط والأحكام"} />
                </h2>
              </div>
              <ul className={guide.terms}>
                {terms.items.map((item, i) => (
                  <li key={i} className={guide.keep}>
                    <Check size={16} strokeWidth={1.5} aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {data.faq.length > 0 ? <CampaignFaq heading={faqBlock?.heading ?? "الأسئلة الشائعة"} faq={data.faq} /> : null}

        {contact ? (
          <section className={styles.block} id="contact">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text="التواصل" />
                </h2>
              </div>
              <p className={guide.lede}>
                {contact.label ? `${contact.label}: ` : ""}
                <bdi dir="ltr">{contact.value}</bdi>
              </p>
            </div>
          </section>
        ) : null}

        {updates.length > 0 ? (
          <section className={styles.block} id="updates">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text="سجل التحديثات" />
                </h2>
              </div>
              <ol className={guide.updates}>
                {updates.map((u) => (
                  <li key={u.id} className={guide.keep}>
                    <time dateTime={u.date}>{formatDate(u.date)}</time>
                    <span>{u.body}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
