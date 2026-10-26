import Link from "next/link";
import { parseContact } from "@/lib/programs/campaign-content";
import styles from "./campaign.module.css";

/** هيئة الجمعية الثابتة — حساباتها وموقعها، لا محتوى البرنامج. */
const STATIC_CONTACTS: [string, string][] = [
  ["الحسابات", "Sonan_sa"],
  ["الموقع", "sonan.sa"],
];

/**
 * تذييل واجهة الحملة ودليلها — مكوّنٌ واحد (خطة دليل المشارك · د). وجهة التواصل **من البرنامج** لا
 * مكتوبةٌ في الكود: كان «شؤون الطلاب» رقماً ثابتاً قديماً بعد أن تغيّر.
 */
export function CampaignFooter({ programName, contact }: { programName: string; contact: string }) {
  const own = parseContact(contact);
  return (
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
          {own ? (
            <li>
              <span>{own.label ?? "التواصل"}</span>
              <b>
                {/* رقمٌ يُنقر للاتصال — صريحاً، فلا يلوّنه iOS ويخطّه وحده. */}
                {/^\+?[0-9 ]{7,15}$/.test(own.value) ? (
                  <a href={`tel:${own.value.replace(/\s/g, "")}`}>
                    <bdi dir="ltr">{own.value}</bdi>
                  </a>
                ) : (
                  <bdi dir="ltr">{own.value}</bdi>
                )}
              </b>
            </li>
          ) : null}
          {STATIC_CONTACTS.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </li>
          ))}
        </ul>
        <p className={styles.copy}>{programName} — جمعية سنن التعليمية ببريدة</p>
        <p className={styles.footLinks}>
          <Link href="/terms">شروط الاستخدام</Link> · <Link href="/privacy">سياسة الخصوصية</Link>
        </p>
      </div>
    </footer>
  );
}
