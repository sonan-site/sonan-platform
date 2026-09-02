import type { PermissionCode } from "./permissions";

/**
 * مصدر التنقّل **الوحيد**. `platform.md §١١.٣`: لا عنصر تنقّل خارج هذا الملف،
 * و`guard-structure` يفشل عند المخالفة.
 *
 * كل عنصر يحمل **رمز صلاحيته**، و`§٨` يوجب: العنصر المحجوب **يُخفى لا يُعطَّل** —
 * إظهار ما لا يُفتَح إعلانٌ عن قدرة غير موجودة.
 */

/** أسماء أيقونات Lucide المسموحة. قائمة مغلقة: مكتبة واحدة، ولا استيراد حرّ. */
export type IconName =
  | "LayoutDashboard"
  | "Users"
  | "ShieldCheck"
  | "Settings"
  | "ScrollText"
  | "BookOpen"
  | "CalendarDays";

export type NavItem = {
  /** مفتاح ثابت — لا يتغيّر بتغيّر العنوان، فيصلح للاختبار وحفظ الحالة. */
  key: string;
  title: string;
  href: string;
  icon: IconName;
  /** `null` = يراه كل مصادَق عليه. وإلا فالرمز شرط الظهور. */
  permission: PermissionCode | null;
  /** يظهر في الشريط السفلي على الجوال. الحدّ ٥ (§١١.٣)، والزائد في «المزيد». */
  primary: boolean;
};

export const NAVIGATION: readonly NavItem[] = [
  {
    key: "dashboard",
    title: "لوحة المتابعة",
    href: "/dashboard",
    icon: "LayoutDashboard",
    permission: null,
    primary: true,
  },
  {
    key: "users",
    title: "المستخدمون",
    href: "/users",
    icon: "Users",
    permission: "users.read",
    primary: true,
  },
  {
    key: "programs",
    title: "البرامج",
    href: "/programs",
    icon: "BookOpen",
    permission: "programs.read",
    primary: true,
  },
  {
    key: "roles",
    title: "الأدوار والصلاحيات",
    href: "/roles",
    icon: "ShieldCheck",
    permission: "roles.read",
    primary: true,
  },
  {
    key: "journey",
    title: "رحلتي",
    href: "/journey",
    icon: "CalendarDays",
    // بلا رمز: المشارك ليس له صلاحية إدارية واحدة، ورحلته له لا لغيره.
    // ومن ليس مشاركاً يجد صفحةً تقول ذلك — أهون من مدخل يظهر ويختفي.
    permission: null,
    primary: true,
  },
  // الإعدادات: لا شاشة لها بعد، فلا مدخل. مدخلٌ يفتح 404 وعدٌ كاذب.
  {
    key: "audit",
    title: "سجل التدقيق",
    href: "/audit",
    icon: "ScrollText",
    permission: "audit.read",
    primary: false,
  },
] as const;

/** الحدّ الأقصى لتبويبات الشريط السفلي قبل ظهور «المزيد» (§١١.٣). */
export const BOTTOM_BAR_LIMIT = 5;

/** يرشّح ما يملك المستخدم صلاحيته. الباقي **يُخفى** لا يُعطَّل. */
export function visibleNavigation(
  granted: ReadonlySet<PermissionCode>,
): NavItem[] {
  return NAVIGATION.filter(
    (item) => item.permission === null || granted.has(item.permission),
  );
}

/** تقسيم الشريط السفلي: ما يظهر مباشرة، وما ينزوي تحت «المزيد». */
export function splitForBottomBar(items: NavItem[]): {
  tabs: NavItem[];
  more: NavItem[];
} {
  const primary = items.filter((i) => i.primary);
  const rest = items.filter((i) => !i.primary);
  const tabs = primary.slice(0, BOTTOM_BAR_LIMIT - (rest.length > 0 ? 1 : 0));
  return { tabs, more: [...primary.slice(tabs.length), ...rest] };
}
