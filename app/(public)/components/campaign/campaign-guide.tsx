import Link from "next/link";
import { Check } from "lucide-react";
import { formatDate, formatDateBoth, formatNumber } from "@/lib/format";
import { campaignStages, campaignTracks, collectBlocks, countWith, parseContact } from "@/lib/programs/campaign-content";
import { groupFaq } from "@/lib/programs/faq";
import type { PublicProgram } from "@/lib/programs/public-page-server";
import { CampaignFooter } from "./campaign-footer";
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
  exams,
  updates,
  printedOn,
}: {
  program: PublicProgram;
  /** أبواب كل مسار بعدد وحداته منها. */
  sections: Map<string, { name: string; units: number }[]>;
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
  const stages = campaignStages(timeline, data);
  const tracks = campaignTracks(data, blocks.prizes ?? []);
  const contact = parseContact(data.contact);
  const latest = updates[0] ?? null;
  const trackName = new Map(data.tracks.map((t) => [t.id, t.name]));

  const toc: [string, string, boolean][] = [
    ["about", "عن المسابقة", true],
    ["stages", timeline?.heading || "المراحل والمواعيد", stages.length > 0],
    ["tracks", "المسارات والجوائز", tracks.length > 0],
    ["exams", "الاختبارات", exams.length > 0],
    ["terms", terms?.heading || "الشروط والأحكام", Boolean(terms && terms.items.length > 0)],
    ["faq", "الأسئلة الشائعة", data.faq.length > 0],
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

      <main className={styles.wrap}>
        <section className={guide.cover} aria-labelledby="guide-title">
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
        </section>

        <section className={guide.section} id="about" aria-labelledby="about-h">
          <h2 id="about-h">عن المسابقة</h2>
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
        </section>

        {stages.length > 0 ? (
          <section className={guide.section} id="stages" aria-labelledby="stages-h">
            <h2 id="stages-h">{timeline?.heading || "المراحل والمواعيد"}</h2>
            <ol className={guide.stages}>
              {stages.map((s, i) => (
                <li key={i} className={guide.keep}>
                  <span className={guide.stageDot} aria-hidden />
                  <div>
                    <h3>{s.title}</h3>
                    {s.dates ? <p className={guide.dates}>{s.dates}</p> : null}
                    {s.datesSub ? <p className={guide.datesSub}>{s.datesSub}</p> : null}
                    {s.note ? <p>{s.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {tracks.length > 0 ? (
          <section className={guide.section} id="tracks" aria-labelledby="tracks-h">
            <h2 id="tracks-h">المسارات والجوائز</h2>
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
          </section>
        ) : null}

        {exams.length > 0 ? (
          <section className={guide.section} id="exams" aria-labelledby="exams-h">
            <h2 id="exams-h">الاختبارات</h2>
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
            <p className={guide.note}>مواعيد الاختبارات في «{timeline?.heading || "المراحل والمواعيد"}» أعلاه.</p>
          </section>
        ) : null}

        {terms && terms.items.length > 0 ? (
          <section className={guide.section} id="terms" aria-labelledby="terms-h">
            <h2 id="terms-h">{terms.heading || "الشروط والأحكام"}</h2>
            <ul className={guide.terms}>
              {terms.items.map((item, i) => (
                <li key={i} className={guide.keep}>
                  <Check size={16} strokeWidth={1.5} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.faq.length > 0 ? (
          <section className={guide.section} id="faq" aria-labelledby="faq-h">
            <h2 id="faq-h">الأسئلة الشائعة</h2>
            {groupFaq(data.faq).map(([group, items]) => (
              <div key={group || "_"} className={guide.faqGroup}>
                <h3>{group || "عام"}</h3>
                <dl className={guide.qa}>
                  {items.map((q) => (
                    <div key={q.id} className={guide.keep}>
                      <dt>{q.question}</dt>
                      <dd>{q.answer}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>
        ) : null}

        {contact ? (
          <section className={guide.section} id="contact" aria-labelledby="contact-h">
            <h2 id="contact-h">التواصل</h2>
            <p className={guide.lede}>
              {contact.label ? `${contact.label}: ` : ""}
              <bdi dir="ltr">{contact.value}</bdi>
            </p>
          </section>
        ) : null}

        {updates.length > 0 ? (
          <section className={guide.section} id="updates" aria-labelledby="updates-h">
            <h2 id="updates-h">سجل التحديثات</h2>
            <ol className={guide.updates}>
              {updates.map((u) => (
                <li key={u.id} className={guide.keep}>
                  <time dateTime={u.date}>{formatDate(u.date)}</time>
                  <span>{u.body}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>

      <div className={guide.noPrint}>
        <CampaignFooter programName={data.programName} contact={data.contact} />
      </div>
    </div>
  );
}
