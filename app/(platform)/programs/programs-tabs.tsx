"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./programs-tabs.module.css";

/**
 * تبويبا قسم البرامج: البناء والنشر.
 *
 * **ليست عنصر تنقّل:** عنصر التنقّل حكرٌ على التخطيط الجامع ومصدرِه الواحد
 * `config/navigation.ts`. وهذه تنقّلٌ **داخل** قسمٍ واحد، كتبويبات البرنامج.
 *
 * ولا تعيش في تخطيطٍ لهذا القسم: تخطيطُه يشمل `/programs/[id]` كذلك، فتظهر
 * فوق تبويبات البرنامج صفّاً ثانياً لا معنى له.
 */
export function ProgramsTabs() {
  const pathname = usePathname();

  const tabs = [
    { href: "/programs", label: "البرامج" },
    { href: "/programs/publish", label: "النشر" },
  ];

  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => {
        const current = tab.href === "/programs" ? pathname === "/programs" : pathname === tab.href;
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
