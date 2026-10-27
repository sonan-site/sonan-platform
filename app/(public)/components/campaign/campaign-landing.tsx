import Link from "next/link";
import { Check } from "lucide-react";
import { formatHijri, lastOpenDay } from "@/lib/format";
import { campaignStages, campaignTracks, collectBlocks } from "@/lib/programs/campaign-content";
import type { PublicProgram } from "@/lib/programs/public-page-server";
import { CampaignCountdown } from "./campaign-countdown";
import { CampaignFooter } from "./campaign-footer";
import { Accented, CampaignFaq, CampaignTimeline } from "./campaign-sections";
import { CampaignTracks } from "./campaign-tracks";
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

/** العنوان بكلمته الأخيرة ملوّنة — كما في التصميم المعتمد. */
/**
 * حال الزائر في المسابقة: زائرٌ بلا حساب · له حسابٌ ولم يُكمل تسجيله · مسجَّلٌ برابط رحلته.
 * فالزرّ يقول خطوته التالية بالضبط — لا «لوحتي» تقود من لم يُكمل إلى صفحةٍ عامة (قرار الراعي ٢٧ أكتوبر).
 */
export type CampaignVisitor = "guest" | "account" | { journey: string };

export function CampaignLanding({ program, visitor }: { program: PublicProgram; visitor: CampaignVisitor }) {
  const { data } = program;
  const blocks = collectBlocks(program.blocks);
  const hero = blocks.hero?.[0];
  const pill = blocks.header?.[0];
  const stats = blocks.stats?.[0];
  const timeline = blocks.timeline?.[0];
  const tracksBlock = blocks.tracks?.[0];
  const terms = blocks.terms?.[0];
  const registration = blocks.registration?.[0];
  const faqBlock = blocks.faq?.[0];
  const invites = blocks.free_text ?? [];
  const prizesBlocks = blocks.prizes ?? [];

  const registerHref = `/p/${data.slug}/register`;
  const open = data.registration === "open";

  // العدّاد إلى الفتح قبله، وإلى الإغلاق بعده — ولا عدّاد لما أُغلق.
  const countdown =
    data.registration === "not_open_yet" && data.opensAt
      ? { label: "يُفتح التسجيل", target: data.opensAt, day: data.opensAt }
      : open && data.closesAt
        ? // التاريخ آخرُ يومٍ مفتوح لا لحظةُ الإغلاق — منتصف ليلٍ يُقرأ يوماً لاحقاً (ملحق `adr/0045`).
          { label: "آخر يوم للتسجيل", target: data.closesAt, day: `${lastOpenDay(data.closesAt)}T12:00:00Z` }
        : null;

  const stateLine: Record<typeof data.registration, string> = {
    open: "التسجيل مفتوح",
    not_open_yet: data.opensAt ? `يُفتح التسجيل ${formatHijri(data.opensAt)}` : "لم يُفتح التسجيل بعد",
    full: "اكتملت المقاعد",
    closed: "أُغلق التسجيل",
    unpublished: "أُغلق التسجيل",
  };

  const stages = campaignStages(timeline, data);
  const tracks = campaignTracks(data, prizesBlocks);
  const guideHref = `/p/${data.slug}/guide`;

  const journey = typeof visitor === "object" ? visitor.journey : null;
  const registerButton = journey ? (
    <Link href={journey} className={`${styles.btn} ${styles.gold} ${styles.lg}`}>
      رحلتي
    </Link>
  ) : open ? (
    <Link href={registerHref} className={`${styles.btn} ${styles.gold} ${styles.lg}`}>
      {visitor === "account" ? "أكمل تسجيلك" : registration?.buttonLabel || "سجّل الآن"}
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
            <Link href={guideHref}>دليل المشارك</Link>
          </div>
          <div className={styles.topActions}>
            {journey ? (
              <Link href={journey} className={`${styles.btn} ${styles.gold} ${styles.sm}`}>
                رحلتي
              </Link>
            ) : visitor === "account" ? (
              open ? (
                <Link href={registerHref} className={`${styles.btn} ${styles.gold} ${styles.sm}`}>
                  أكمل تسجيلك
                </Link>
              ) : (
                <Link href="/dashboard" className={styles.signIn}>
                  لوحتي
                </Link>
              )
            ) : (
              <>
                <Link href={`/sign-in?next=${encodeURIComponent(registerHref)}`} className={styles.signIn}>
                  تسجيل الدخول
                </Link>
                {open ? (
                  <Link href={registerHref} className={`${styles.btn} ${styles.gold} ${styles.sm}`}>
                    سجّل الآن
                  </Link>
                ) : null}
              </>
            )}
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
                    {formatHijri(countdown.day)}
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

        {stages.length > 0 ? <CampaignTimeline heading={timeline?.heading ?? ""} stages={stages} /> : null}

        {tracks.length > 0 ? (
          <section className={styles.block} id="tracks">
            <div className={styles.wrap}>
              <div className={styles.head}>
                <h2>
                  <Accented text={tracksBlock?.heading ?? "المسارات"} />
                </h2>
                <p>اضغط على المسار لعرض جوائز مراكزه.</p>
              </div>
              <CampaignTracks tracks={tracks} unitLabel={data.unitLabel} registerHref={registerHref} open={open} />
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
                  {/* الدليل صفحةٌ في المنصة (خطة دليل المشارك · د) — لا رابطٌ خارجي يُضاف عنصراً. */}
                  <div className={styles.guide}>
                    <span>كل ما يلزمك عن المسابقة في صفحةٍ واحدة تُحفظ PDF.</span>
                    <Link href={guideHref}>اقرأ دليل المشارك</Link>
                  </div>
                </aside>
              ) : null}

              <div className={styles.card}>
                <h3>{stateLine[data.registration]}</h3>
                <p className={styles.sub}>
                  التسجيل بحسابٍ في منصة سنن — به تتابع واجبك اليومي وترصد حفظك طوال المسابقة.
                </p>
                <ol className={styles.steps}>
                  <li>{visitor === "guest" ? "أنشئ حسابك، أو ادخل بحساب Google" : "أنت داخلٌ بحسابك"}</li>
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

        {data.faq.length > 0 ? <CampaignFaq heading={faqBlock?.heading ?? "الأسئلة الشائعة"} faq={data.faq} /> : null}
      </main>

      <CampaignFooter programName={data.programName} contact={data.contact} />
    </div>
  );
}
