"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCREEN_ACTIONS_ID } from "@/components/shared/screen-actions";
import styles from "./programs-tabs.module.css";

/**
 * تبويبا قسم البرامج: البناء والنشر.
 *
 * **ليست عنصر تنقّل:** عنصر التنقّل حكرٌ على التخطيط الجامع ومصدرِه الواحد
 * `config/navigation.ts`. وهذه تنقّلٌ **داخل** قسمٍ واحد، كتبويبات البرنامج.
 *
 * ولا تعيش في تخطيطٍ لهذا القسم: تخطيطُه يشمل `/programs/[id]` كذلك، فتظهر
 * فوق تبويبات البرنامج صفّاً ثانياً لا معنى له.
 *
 * **وأفعال الشاشة في طرفها** (`ق-٢٤`): «أنشئ» فعلُ الشاشة كلها لا فعلُ بطاقةٍ
 * فيها، فموضعه حيث يُنتظر — سطرُ ترويستها — لا بطاقةٌ تشغل شاشةً قبل الجدول.
 * وتصل إليه من صفحتها عبر `ScreenActions`، كما في تبويبات البرنامج والفريق.
 */
export function ProgramsTabs() {
  const pathname = usePathname();

  const tabs = [
    { href: "/programs", label: "البرامج" },
    { href: "/programs/publish", label: "النشر" },
  ];

  return (
    <div className={styles.tabRow}>
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
      <div id={SCREEN_ACTIONS_ID} className={styles.screenActions} />
    </div>
  );
}
