"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./layout.module.css";

/**
 * تبويبات البرنامج — عملٌ لكل تبويب.
 *
 * **ليست عنصر تنقّل:** عنصر التنقّل حكرٌ على التخطيط الجامع ومصدره
 * `config/navigation.ts` (حارس `nav-outside-source`). وهذه تنقّلٌ **داخل** شاشة
 * واحدة من التنقّل العام، كتبويبات لوحةٍ لا كقائمة جانبية ثانية.
 */
export function ProgramTabs({
  programId,
  canWrite,
  canReadParticipants,
}: {
  programId: string;
  canWrite: boolean;
  canReadParticipants: boolean;
}) {
  const pathname = usePathname();
  const base = `/programs/${programId}`;

  const tabs = [
    { href: base, label: "نظرة عامة", show: true },
    { href: `${base}/tracks`, label: "المسارات", show: true },
    { href: `${base}/content`, label: "المادة", show: canWrite },
    { href: `${base}/plans`, label: "الخطط", show: canWrite },
    { href: `${base}/page`, label: "الصفحة المعلنة", show: canWrite },
    { href: `${base}/participants`, label: "المشاركون", show: canReadParticipants },
  ].filter((t) => t.show);

  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => {
        const current = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.tab} ${current ? styles.tabCurrent : ""}`}
            aria-current={current ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
