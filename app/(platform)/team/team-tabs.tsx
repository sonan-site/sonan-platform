"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./layout.module.css";

/** تبويبات الفريق — الأشخاص، ثم الأدوار، ثم إسنادها. ترتيبُ العمل نفسه. */
export function TeamTabs({
  canReadUsers,
  canReadRoles,
}: {
  canReadUsers: boolean;
  canReadRoles: boolean;
}) {
  const pathname = usePathname();
  const tabs = [
    { href: "/team", label: "الأشخاص", show: canReadUsers },
    { href: "/team/roles", label: "الأدوار", show: canReadRoles },
    { href: "/team/assignments", label: "الإسنادات", show: canReadRoles },
    { href: "/team/trash", label: "سلّة المحذوفات", show: canReadUsers },
  ].filter((t) => t.show);

  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => {
        const current = tab.href === "/team" ? pathname === "/team" : pathname.startsWith(tab.href);
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
