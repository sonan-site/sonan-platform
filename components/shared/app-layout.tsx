"use client";

import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  Menu,
  MoonStar,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useStoredState } from "./use-stored-state";
import {
  splitForBottomBar,
  type IconName,
  type NavItem,
} from "@/config/navigation";
import styles from "./app-layout.module.css";

/**
 * التخطيط الجامع **الواحد** (`platform.md §١١.٣`).
 * لا تخطيط موضعي في أي صفحة — و`guard-structure` يفشل عند وجوده.
 *
 * انكسار واحد `1024px`:
 *   فوقه — شريط جانبي جهة البداية، حالته محفوظة، ورأس ثابت.
 *   دونه — شريط سفلي يختفي نزولاً ويظهر صعوداً، والجانبي طبقة منزلقة.
 */

const ICONS: Record<IconName, LucideIcon> = {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Settings,
  ScrollText,
  BookOpen,
  CalendarDays,
};

const ICON_SIZE = 20;
const COLLAPSE_KEY = "sonan.sidebar.collapsed";
const THEME_KEY = "sonan.theme";
const SCROLL_THRESHOLD = 8;

export function AppLayout({
  items,
  brand = "منصة سنن",
  crumb,
  children,
}: {
  /** مرشَّحة بصلاحيات المستخدم قبل الوصول هنا — المحجوب **يُخفى لا يُعطَّل**. */
  items: NavItem[];
  brand?: string;
  crumb?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // حالة الطيّ محفوظة (§١١.٣) — تُقرأ من مصدر خارجي بلا تأثير ولا ومضة.
  const [collapsedValue, setCollapsedValue] = useStoredState<"0" | "1">(COLLAPSE_KEY, "0");
  const collapsed = collapsedValue === "1";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const [barHidden, setBarHidden] = useState(false);

  // التنقّل يُغلق الطبقة المنزلقة — أثناء التصيير لا في تأثير.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  // الشريط السفلي يختفي نزولاً ويظهر صعوداً وعند القمة (§١١.٣)
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) > SCROLL_THRESHOLD) {
        setBarHidden(y > last && y > 0);
        last = y;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleCollapse = () => setCollapsedValue(collapsed ? "0" : "1");

  const { tabs, more } = splitForBottomBar(items);
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className={styles.shell}>
      <aside
        className={[
          styles.sidebar,
          collapsed ? styles.collapsed : "",
          drawerOpen ? styles.drawerOpen : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.brand}>
          <BookOpen size={ICON_SIZE} aria-hidden />
          <span className={styles.brandName}>{brand}</span>
        </div>
        <ul className={styles.navList}>
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const current = isCurrent(item.href);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  title={collapsed ? item.title : undefined}
                  className={`${styles.navLink} ${current ? styles.navCurrent : ""}`}
                >
                  <Icon size={ICON_SIZE} aria-hidden />
                  <span className={styles.navLabel}>{item.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className={styles.sidebarFoot}>
          <ThemeToggle />
        </div>
      </aside>

      {drawerOpen ? (
        <button
          type="button"
          className={styles.scrim}
          aria-label="إغلاق القائمة"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <div className={`${styles.main} ${collapsed ? styles.mainCollapsed : ""}`}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={collapsed ? "توسيع القائمة" : "طيّ القائمة"}
            aria-expanded={!collapsed}
            onClick={() => {
              if (window.matchMedia("(max-width: 1023px)").matches) {
                setDrawerOpen((v) => !v);
              } else {
                toggleCollapse();
              }
            }}
          >
            <Menu size={ICON_SIZE} aria-hidden />
          </button>
          {crumb ? <span className={styles.crumb}>{crumb}</span> : null}
          <div className={styles.headerEnd} />
        </header>

        <main className={styles.content}>{children}</main>
      </div>

      <nav
        className={`${styles.bottomBar} ${barHidden ? styles.bottomHidden : ""}`}
        aria-label="التنقّل السريع"
      >
        {tabs.map((item) => {
          const Icon = ICONS[item.icon];
          const current = isCurrent(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`${styles.tab} ${current ? styles.tabCurrent : ""}`}
            >
              <Icon size={ICON_SIZE} aria-hidden />
              {item.title}
            </Link>
          );
        })}
        {more.length > 0 ? (
          <button
            type="button"
            className={styles.tab}
            onClick={() => setDrawerOpen(true)}
            aria-label="المزيد من الأقسام"
          >
            <Menu size={ICON_SIZE} aria-hidden />
            المزيد
          </button>
        ) : null}
      </nav>
    </div>
  );
}

/**
 * اختيار السمة يُحفظ، والافتراض تفضيل النظام (`platform.md §١٠`).
 * السمة تُطبَّق قبل الرسم بسكربت في الترويسة، فلا ومضة بيضاء عند من اختار الداكنة.
 */
function ThemeToggle() {
  const [theme, setTheme] = useStoredState<"system" | "light" | "dark">(THEME_KEY, "system");

  const cycle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset["theme"] = next;
  };

  return (
    <button
      type="button"
      onClick={cycle}
      className={styles.iconButton}
      aria-label={theme === "dark" ? "التحويل للسمة الفاتحة" : "التحويل للسمة الداكنة"}
    >
      {theme === "dark" ? (
        <Sun size={ICON_SIZE} aria-hidden />
      ) : (
        <MoonStar size={ICON_SIZE} aria-hidden />
      )}
    </button>
  );
}
