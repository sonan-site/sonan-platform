import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { formatNumber } from "@/lib/format";
import { REGISTRATION_LABEL, type RegistrationState } from "@/lib/programs/registration";
import { registrationStates } from "@/lib/programs/registration-server";
import styles from "./store.module.css";

/**
 * المتجر العام — الواجهة الرئيسية.
 *
 * **لا يشترط حساباً** (`adr/0004`): طبقة تسويقية خارج نطاق العزل، والعزل يخصّ
 * بيانات المشاركين والتشغيل. وRLS هي التي تحصر ما يراه المجهول في المنشور وحده،
 * لا شرطٌ في هذا الملف — فلو نُسي الشرط هنا لم يتسرّب شيء.
 */

export const dynamic = "force-dynamic";

const TAG_CLASS: Record<RegistrationState, string> = {
  open: styles.open!,
  full: styles.full!,
  not_open_yet: styles.muted!,
  closed: styles.muted!,
  unpublished: styles.muted!,
};

export default async function StorePage() {
  const db = await createClient();
  const { data, error } = await db
    .from("programs")
    .select(
      "id, name, slug, summary, status, capacity, participant_label, registration_opens_at, registration_closes_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return <ErrorState body="تعذّر جلب البرامج. أعد المحاولة بعد قليل." />;
  }

  // [BR-CAP-01] — من القاعدة، فيظهر «اكتمل العدد» حين يكتمل.
  const states = await registrationStates(db, (data ?? []).map((p) => p.id));
  const programs = (data ?? []).map((p) => ({ ...p, state: states.get(p.id) ?? "closed" }));

  return (
    <>
      <h1>البرامج المتاحة</h1>
      <p className={styles.lede}>
        برامج جمعية سنن التعليمية. اختر برنامجاً لتعرف تفاصيله وشروط الالتحاق به.
      </p>

      {programs.length === 0 ? (
        <EmptyState
          kind="no-data"
          title="لا برامج معلنة الآن"
          body="لا برامج مفتوحة الآن. تابع إعلانات الجمعية."
        />
      ) : (
        <div className={styles.grid}>
          {programs.map((p) => (
            <Link key={p.id} href={`/p/${p.slug}`} className={styles.card}>
              <div className={styles.head}>
                <span className={styles.name}>{p.name}</span>
                <span className={`${styles.tag} ${TAG_CLASS[p.state]}`}>
                  {REGISTRATION_LABEL[p.state]}
                </span>
              </div>

              {p.summary ? <p className={styles.summary}>{p.summary}</p> : null}

              <div className={styles.foot}>
                <span>{p.participant_label}</span>
                <span>
                  {p.capacity === null ? "بلا سقف" : `السعة ${formatNumber(p.capacity)}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
