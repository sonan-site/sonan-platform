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
  | "CalendarDays"
  | "UserRound";

export type NavItem = {
  /** مفتاح ثابت — لا يتغيّر بتغيّر العنوان، فيصلح للاختبار وحفظ الحالة. */
  key: string;
  title: string;
  href: string;
  icon: IconName;
  /** `null` = لا يُشترط رمز. وإلا فالرمز شرط الظهور. */
  permission: PermissionCode | null;
  /**
   * يكفي **أحد** هذه الرموز لرؤية المدخل — للقسم الذي يجمع عملين لكلٍّ رمزه.
   * وحين يُذكر فهو الحاكم، و`permission` يبقى للتوثيق والاختبار.
   */
  permissionAny?: readonly PermissionCode[];
  /**
   * للمشاركين وحدهم: يظهر لمن له مشاركة في برنامج — ولو انتهت رحلته فيه،
   * ليصل إلى سجلّه. ومن لا مشاركة له (كالمدير) لا يرى مدخلاً لا يخصّه.
   */
  participantsOnly?: true;
  /** يظهر في الشريط السفلي على الجوال. الحدّ ٥ (§١١.٣)، والزائد في «المزيد». */
  primary: boolean;
  /**
   * موضعه **رأس الصفحة وحده**: يبقى مدخلاً مسجَّلاً هنا (فلكل صفحة مدخل)،
   * ولا يُكرَّر في القائمة الجانبية ولا في الشريط السفلي. تكرار المدخل الواحد
   * في ثلاثة مواضع يجعل الشاشة أزرارَ تنقّلٍ لا محتوى.
   */
  headerOnly?: true;
  /**
   * الوضع الذي يظهر فيه المدخل (`adr/0032`): `staff` لشاشات العمل،
   * و`participant` لتجربة المشارك. وما لا وضع له يظهر في الوضعين.
   */
  mode?: "staff" | "participant";
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
    key: "team",
    title: "الإدارة",
    href: "/team",
    icon: "ShieldCheck",
    // الأشخاص والأدوار قسمٌ واحد: من يقرأ أحدهما يراه (`adr/0031`).
    permission: "users.read",
    permissionAny: ["users.read", "roles.read"],
    primary: true,
    mode: "staff",
  },
  {
    key: "participants",
    title: "المشاركون",
    href: "/participants",
    icon: "Users",
    permission: "users.read",
    mode: "staff",
    primary: true,
  },
  {
    key: "programs",
    title: "البرامج",
    href: "/programs",
    icon: "BookOpen",
    permission: "programs.read",
    primary: true,
    mode: "staff",
  },
  {
    key: "journey",
    title: "رحلتي",
    href: "/journey",
    icon: "CalendarDays",
    // بلا رمز: المشارك ليس له صلاحية إدارية. وشرطه أن يكون مشاركاً، لا أن يملك شيئاً.
    permission: null,
    participantsOnly: true,
    primary: true,
    mode: "participant",
  },
  {
    key: "settings",
    title: "الإعدادات",
    href: "/settings",
    icon: "Settings",
    permission: "settings.read",
    primary: false,
    mode: "staff",
  },
  {
    key: "audit",
    title: "سجل التدقيق",
    href: "/audit",
    icon: "ScrollText",
    permission: "audit.read",
    primary: false,
    mode: "staff",
  },
  {
    key: "account",
    title: "حسابي",
    href: "/account",
    icon: "UserRound",
    // لكل داخل. ورأس الصفحة يحمل رابطه على كل شاشة، فلا يُكرَّر في غيره.
    permission: null,
    primary: false,
    headerOnly: true,
  },
] as const;

/** الحدّ الأقصى لتبويبات الشريط السفلي قبل ظهور «المزيد» (§١١.٣). */
export const BOTTOM_BAR_LIMIT = 5;

export type Viewer = {
  granted: ReadonlySet<PermissionCode>;
  /** وضع الجلسة — `undefined` يعني «لا ترشيح بالوضع» (الاختبارات والحالات القديمة). */
  mode?: "staff" | "participant";
  /** له مشاركة قائمة في برنامج — جارية أو منتهية. */
  isParticipant: boolean;
};

/** يرشّح ما يخصّ المستخدم. الباقي **يُخفى** لا يُعطَّل. */
export function visibleNavigation({ granted, isParticipant, mode }: Viewer): NavItem[] {
  return NAVIGATION.filter((item) => {
    const allowed = item.permissionAny
      ? item.permissionAny.some((code) => granted.has(code))
      : item.permission === null || granted.has(item.permission);
    const inMode = !mode || !item.mode || item.mode === mode;
    return allowed && inMode && (!item.participantsOnly || isParticipant);
  });
}

/** ما يُعرَض في القائمة الجانبية والشريط السفلي — بلا ما موضعه الرأس. */
export function listNavigation(items: NavItem[]): NavItem[] {
  return items.filter((item) => !item.headerOnly);
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
