import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { formatHijri } from "@/lib/format";
import { parseBlockContent, type BlockContent, type BlockType } from "@/lib/programs/blocks";
import { groupFaq } from "@/lib/programs/faq";
import type { PublicProgram } from "@/lib/programs/public-page-server";
import { scheduleRangeLabel, scheduleStatus } from "@/lib/programs/schedule";
import { CampaignCountdown } from "./campaign-countdown";
import { CampaignTracks, type CampaignTrack } from "./campaign-tracks";
import styles from "./campaign.module.css";

/**
 * واجهة الحملة (`adr/0045`) — جلد صفحة المسابقة المعتمدة على بيانات البرنامج.
 *
 * **المحتوى كلّه من المنصة:** الغلاف والأرقام والشروط والدعوة من عناصر الصفحة،
 * والمسارات ومقاعدها من `fn_public_tracks`، والمراحل من مواعيد البرنامج،
 * والعدّاد من نافذة التسجيل، والأسئلة من سجلّها. والجلد وحده كود.
 *
 * وما لا يُدار من المنصة بعدُ — الشعارات وأرقام التواصل والترخيص — ثابتٌ هنا
 * لأنه هيئة الجمعية لا محتوى البرنامج، وينقضي مع الواجهة.
 */

type Blocks = { [K in BlockType]: BlockContent[K][] };

function collect(program: PublicProgram): Blocks {
  const out = {} as Blocks;
  for (const block of program.blocks) {
    const parsed = parseBlockContent(block.type, block.content);
    if (!parsed.ok) continue;
    (out[block.type] ??= [] as never[]).push(parsed.content as never);
  }
  return out;
}

/** العنوان بكلمته الأخيرة ملوّنة — كما في التصميم المعتمد. */
function Accented({ text }: { text: string }) {
  const at = text.trim().lastIndexOf(" ");
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)} <span className={styles.accent}>{text.slice(at + 1)}</span>
    </>
  );
}

const CONTACTS: [string, string][] = [
  ["الجمعية", "0553088688"],
  ["شؤون الطلاب", "0504555289"],
  ["الحسابات", "Sonan_sa"],
  ["الموقع", "sonan.sa"],
];

export function CampaignLanding({ program, signedIn }: { program: PublicProgram; signedIn: boolean }) {
  const { data } = program;
  const blocks = collect(program);
  const hero = blocks.hero?.[0];
  const pill = blocks.header?.[0];
  const stats = blocks.stats?.[0];
  const timeline = blocks.timeline?.[0];
  const tracksBlock = blocks.tracks?.[0];
  const terms = blocks.terms?.[0];
  const registration = blocks.registration?.[0];
  const faqBlock = blocks.faq?.[0];
  const guide = (blocks.cta ?? []).find((c) => c.buttonHref);
  const invites = blocks.free_text ?? [];
  const prizesBlocks = blocks.prizes ?? [];

  const registerHref = `/p/${data.slug}/register`;
  const open = data.registration === "open";

  // العدّاد إلى الفتح قبله، وإلى الإغلاق بعده — ولا عدّاد لما أُغلق.
  const countdown =
    data.registration === "not_open_yet" && data.opensAt
      ? { label: "يُفتح التسجيل", target: data.opensAt }
      : open && data.closesAt
        ? { label: "يُغلق التسجيل", target: data.closesAt }
        : null;

  const stateLine: Record<typeof data.registration, string> = {
    open: "التسجيل مفتوح",
    not_open_yet: data.opensAt ? `يُفتح التسجيل ${formatHijri(data.opensAt)}` : "لم يُفتح التسجيل بعد",
    full: "اكتملت المقاعد",
    closed: "أُغلق التسجيل",
    unpublished: "أُغلق التسجيل",
  };

  const stages =
    timeline?.source === "schedule"
      ? data.schedule.map((e) => ({
          title: e.title,
          dates: scheduleRangeLabel(e),
          note: e.note,
          status: scheduleStatus(e, data.today),
        }))
      : (timeline?.stages ?? []).map((s) => ({ ...s, status: null }));

  const tracks: CampaignTrack[] = data.tracks.map((t) => {
    const prizes = prizesBlocks.find((p) => p.trackId === t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      units: t.units,
      capacity: t.capacity,
      remaining: t.capacity === null ? null : Math.max(0, t.capacity - t.taken),
      prizes: prizes?.places ?? [],
      prizeNote: prizes?.note ?? "",
    };
  });

  const registerButton = open ? (
    <Link href={registerHref} className={`${styles.btn} ${styles.gold} ${styles.lg}`}>
      {registration?.buttonLabel || "سجّل الآن"}
    </Link>
  ) : (
    <span className={`${styles.btn} ${styles.gold} ${styles.lg} ${styles.disabled}`} aria-disabled>
      {stateLine[data.registration]}
    </span>
  );

  return (
    <div className={styles.root} data-campaign>
      <header className={styles.top}>
        <div className={`${styles.wrap} ${styles.topRow}`}>
          <a className={styles.brand} href="#top" aria-label="جمعية سنن التعليمية">
            {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
            <img src="/brand/sunan-logo.png" alt="جمعية سنن التعليمية" />
          </a>
          {/* روابط مرساة في الصفحة نفسها — لا عنصر تنقّل (`nav-outside-source`). */}
          <div className={styles.anchors} role="group" aria-label="أقسام الصفحة">
            {stages.length > 0 ? <a href="#stages">{timeline?.heading}</a> : null}
            {tracks.length > 0 ? <a href="#tracks">المسارات والجوائز</a> : null}
            <a href="#register">التسجيل</a>
            {data.faq.length > 0 ? <a href="#faq">الأسئلة الشائعة</a> : null}
          </div>
          <div className={styles.topActions}>
            <Link href={signedIn ? "/dashboard" : "/sign-in"} className={styles.signIn}>
              {signedIn ? "لوحتي" : "تسجيل الدخول"}
            </Link>
            {open ? (
              <Link href={registerHref} className={`${styles.btn} ${styles.gold} ${styles.sm}`}>
                سجّل الآن
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main id="top">
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <div className={styles.partners}>
                {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
                <img src="/brand/moe.svg" alt="وزارة التعليم" />
                <span className={styles.sep} aria-hidden />
                {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
                <img src="/brand/ncnp.svg" alt="المركز الوطني لتنمية القطاع غير الربحي" />
              </div>
              <h1 className={styles.title}>{hero?.title ?? data.programName}</h1>
              {pill ? <div className={styles.pill}>{pill.title}</div> : null}
              <p className={styles.lede}>{hero?.subtitle || data.programSummary}</p>
              <div className={styles.heroCta}>
                {registerButton}
                {tracks.length > 0 ? (
                  <a href="#tracks" className={`${styles.btn} ${styles.ghost}`}>
                    {hero?.secondaryLabel || "اختر مسارك"}
                  </a>
                ) : null}
              </div>
              {countdown ? (
                <div className={styles.countdown}>
                  <div className={styles.cdLabel}>
                    <b>{countdown.label}</b>
                    {formatHijri(countdown.target)}
                  </div>
                  <CampaignCountdown target={countdown.target} />
                </div>
              ) : null}
            </div>
            <figure className={styles.book}>
              {/* eslint-disable-next-line @next/next/no-img-element -- صورة ثابتة في public */}
              <img
                src="/brand/arbaeen-book.webp"
                alt="كتاب الأربعون من أحاديث الصحيحين، إعداد مركز حفاظ السنة"
                width={790}
                height={900}
              />
              <figcaption>مادة المسابقة: الأربعون من أحاديث الصحيحين، إعداد مركز حفاظ السنة</figcaption>
            </figure>
          </div>
        </section>

        {stats && stats.items.length > 0 ? (
          <div className={styles.facts}>
            <div className={`${styles.wrap} ${styles.factsGrid}`}>
              {stats.items.map((item, i) => (
                <div key={i} className={styles.fact}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {stages.length > 0 ? (
          <section className={styles.block} id="stages">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text={timeline?.heading ?? ""} />
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
                    {s.note ? <p>{s.note}</p> : null}
                    {s.status === "now" ? <span className={styles.nowTag}>جارٍ الآن</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {tracks.length > 0 ? (
          <section className={styles.block} id="tracks">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text={tracksBlock?.heading ?? "المسارات"} />
                </h2>
                <p>اضغط على المسار لعرض جوائز مراكزه.</p>
              </div>
              <CampaignTracks tracks={tracks} unitLabel={data.unitLabel} />
            </div>
          </section>
        ) : null}

        <section className={styles.block} id="register">
          <div className={styles.wrap}>
            <div className={styles.head}>
              <h2>
                <Accented text={registration?.heading || "سجّل في المسابقة"} />
              </h2>
            </div>
            <div className={`${styles.reg} ${terms && terms.items.length > 0 ? "" : styles.regSingle}`}>
              {terms && terms.items.length > 0 ? (
                <aside className={styles.terms}>
                  <h3>{terms.heading}</h3>
                  <ul>
                    {terms.items.map((item, i) => (
                      <li key={i}>
                        <Check size={16} strokeWidth={1.5} aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {guide ? (
                    <div className={styles.guide}>
                      <span>{guide.text}</span>
                      <a href={guide.buttonHref}>{guide.buttonLabel || guide.heading}</a>
                    </div>
                  ) : null}
                </aside>
              ) : null}

              <div className={styles.card}>
                <h3>{stateLine[data.registration]}</h3>
                <p className={styles.sub}>
                  التسجيل بحسابٍ في منصة سنن — به تتابع واجبك اليومي وترصد حفظك طوال المسابقة.
                </p>
                <ol className={styles.steps}>
                  <li>{signedIn ? "أنت داخلٌ بحسابك" : "أنشئ حسابك، أو ادخل بحساب Google"}</li>
                  <li>أكمل بياناتك</li>
                  <li>اختر مسارك وأقرّ بالشروط</li>
                </ol>
                <div className={styles.submitRow}>{registerButton}</div>
              </div>
            </div>
          </div>
        </section>

        {invites.map((invite, i) => (
          <section key={i} className={styles.block}>
            <div className={styles.wrap}>
              <div className={styles.invite}>
                <div>
                  {invite.heading ? <h2>{invite.heading}</h2> : null}
                  <p>{invite.text}</p>
                </div>
                {open ? (
                  <Link href={registerHref} className={`${styles.btn} ${styles.ghost}`}>
                    سجّل الآن
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ))}

        {data.faq.length > 0 ? (
          <section className={styles.block} id="faq">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text={faqBlock?.heading ?? "الأسئلة الشائعة"} />
                </h2>
              </div>
              <div className={styles.faq}>
                {groupFaq(data.faq).map(([group, items]) => (
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
        ) : null}
      </main>

      <footer className={styles.foot}>
        <div className={styles.wrap}>
          <div className={styles.logos}>
            <div className={styles.logoGroup}>
              {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
              <img className={styles.logoSunan} src="/brand/sunan-logo.png" alt="جمعية سنن التعليمية" />
            </div>
            <div className={styles.logoGroup}>
              <span className={styles.logoTile}>
                {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
                <img src="/brand/hifaz-center.jpg" alt="مركز حفاظ السنة" />
              </span>
              <span className={styles.cap}>الشريك العلمي</span>
            </div>
            <div className={styles.logoGroup}>
              <div className={styles.logoRow}>
                {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
                <img className={styles.logoGov} src="/brand/moe.svg" alt="وزارة التعليم" />
                {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
                <img className={styles.logoGov} src="/brand/ncnp.svg" alt="المركز الوطني لتنمية القطاع غير الربحي" />
              </div>
              <span className={styles.cap}>
                رقم الترخيص <b>ACTV16701</b>
              </span>
            </div>
          </div>
          <ul className={styles.contact}>
            {CONTACTS.map(([label, value]) => (
              <li key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </li>
            ))}
          </ul>
          <p className={styles.copy}>{data.programName} — جمعية سنن التعليمية ببريدة</p>
          <p className={styles.footLinks}>
            <Link href="/terms">شروط الاستخدام</Link> · <Link href="/privacy">سياسة الخصوصية</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
