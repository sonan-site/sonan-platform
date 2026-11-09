import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { askSetup } from "@/lib/ask/ask-server";
import { createClient } from "@/lib/db/server";
import { loadPublicProgram } from "@/lib/programs/public-page-server";
import { AskChat } from "../../../components/ask/ask-chat";
import ask from "../../../components/ask/ask.module.css";
import styles from "../../../components/campaign/campaign.module.css";

/**
 * «اسأل عن المسابقة» (adr/0057) — مساعدٌ يجيب من المنشور، بشارة «تجريبي».
 * للبرنامج المنشور وحده: المعاينة لا تستدعي نموذجاً، والموقوف لا صفحة له.
 * المداخل تفتح النافذة في صفحتها (قرار الراعي ٩ نوفمبر) — وهذه للرابط المباشر.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "اسأل عن المسابقة" };

export default async function AskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createClient();

  let program;
  try {
    program = await loadPublicProgram(db, slug);
  } catch {
    return <ErrorState body="تعذّر جلب الصفحة. أعد المحاولة." />;
  }
  if (!program || program.data.registration === "unpublished") notFound();

  const contactText = program.data.contact || "شؤون الطلاب";

  return (
    <div className={styles.root} data-campaign>
      <header className={styles.top}>
        <div className={`${styles.wrap} ${styles.topRow}`}>
          <Link className={styles.brand} href={`/p/${slug}`} aria-label="صفحة المسابقة">
            {/* eslint-disable-next-line @next/next/no-img-element -- شعارٌ ثابت في public */}
            <img src="/brand/sunan-logo.png" alt="جمعية سنن التعليمية" />
          </Link>
          <Link className={`${styles.btn} ${styles.ghost} ${styles.sm}`} href={`/p/${slug}/guide`}>
            دليل المشارك
          </Link>
        </div>
      </header>
      <main>
        {(await askSetup(slug)) ? (
          <section className={styles.block} aria-labelledby="ask-title">
            <div className={`${styles.wrap} ${ask.shell}`}>
              <header className={ask.head}>
                <p className={ask.eyebrow}>{program.data.programName}</p>
                <div className={ask.titleRow}>
                  <h1 id="ask-title" className={ask.title}>
                    اسأل عن المسابقة
                  </h1>
                  <span className={ask.beta}>تجريبي</span>
                </div>
                <p className={ask.lede}>أجيبك من المعلومات المنشورة عن المسابقة: الشروط والمسارات والمواعيد والاختبارات.</p>
              </header>
              <AskChat slug={slug} contact={contactText} />
            </div>
          </section>
        ) : (
          <div className={styles.wrap}>
            <ErrorState title="المساعد غير متاح الآن" body={`لأي استفسار تواصل مع ${contactText}.`} />
          </div>
        )}
      </main>
    </div>
  );
}
