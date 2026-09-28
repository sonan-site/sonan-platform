import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { IconName, NavItem } from "@/config/navigation";
import type { AttentionItem } from "@/lib/dashboard/attention";
import type { DashboardCounts } from "@/lib/dashboard/server";
import { formatNumber } from "@/lib/format";
import styles from "./dashboard.module.css";

/**
 * لوحة وضع الإدارة: **ما ينتظرك أولاً، ثم أبواب عملك**.
 *
 * والترتيب مقصود: من فتح لوحته يرى ما عَلِق قبل أن يرى ما يستطيع فتحه. وكانت
 * اللوحة بطاقةً واحدة إلى «البرامج» — فما ينتظر قراراً لا يُعرف إلا بتفقّد كل
 * برنامج على حدة.
 */

const ICONS: Record<IconName, LucideIcon> = {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Settings,
  ScrollText,
  BookOpen,
  CalendarDays,
  UserRound,
};

const ICON_SIZE = 20;

/** سطر تعريفٍ لكل مدخل: عددٌ إن كان له عدد، وإلا فما يُفعل فيه. */
function entryMeta(key: string, counts: DashboardCounts): string {
  switch (key) {
    case "programs":
      return `${formatNumber(counts.programs)} برنامجاً · ${formatNumber(counts.published)} منشوراً`;
    case "team":
      return `${formatNumber(counts.roleHolders)} من أصحاب الأدوار`;
    case "participants":
      return `${formatNumber(counts.participants)} مشاركاً في البرامج`;
    case "settings":
      return "شرائح واجهة الدخول وبيانات المنصة";
    case "audit":
      return "كل فعل إداري بفاعله ووقته";
    default:
      return "";
  }
}

export function StaffView({
  attention,
  entries,
  counts,
}: {
  attention: AttentionItem[];
  entries: NavItem[];
  counts: DashboardCounts;
}) {
  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>يحتاج انتباهك</h2>
          {attention.length > 0 ? (
            <span className={styles.count}>{formatNumber(attention.length)}</span>
          ) : null}
        </div>

        {attention.length === 0 ? (
          <p className={styles.clear}>لا شيء ينتظر قرارك الآن — برامجك وحساباتها سليمة.</p>
        ) : (
          attention.map((item) => (
            <Link key={item.key} href={item.href} className={styles.attention}>
              <strong className={styles.attentionTitle}>{item.title}</strong>
              <span className={styles.attentionBody}>{item.consequence}</span>
              <span className={styles.attentionCta}>{item.cta}</span>
            </Link>
          ))
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>أقسامك</h2>
        </div>

        <div className={styles.entries}>
          {entries.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link key={item.key} href={item.href} className={styles.entry}>
                <Icon className={styles.entryIcon} size={ICON_SIZE} aria-hidden />
                <span>
                  <strong className={styles.entryName}>{item.title}</strong>
                  <span className={styles.entryMeta}>{entryMeta(item.key, counts)}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
