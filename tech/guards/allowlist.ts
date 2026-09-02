import type { ListEntry } from "./harness.ts";

/**
 * القائمتان (`platform.md §١٣`).
 *
 * **استثناء مشروع** — يُسكِت المخالفة. لكل بند حجّة **وشرط انقضاء**:
 * استثناء بلا شرط انقضاء أبديّ، والأبديّ ليس استثناءً بل قاعدة مخفيّة.
 *
 * **دَين معلَن** — يُوثّق ولا يُسكِت: البوّابة تبقى حمراء. فالإعلان توثيقٌ
 * للألم لا إذنٌ بتجاهله.
 */

export const EXCEPTIONS: ListEntry[] = [
  {
    guard: "guard-style",
    rule: "raw-color",
    path: "config/tokens.css",
    reason: "هذا هو المصدر الوحيد للألوان. منعه فيه يعني ألّا يوجد لون في المنصة.",
    until: "لا ينقضي — بحكم تعريف الملف.",
  },
  {
    guard: "guard-style",
    rule: "raw-size",
    path: "config/tokens.css",
    reason: "نفس السبب: سلالم المسافات والنصّ تُعرَّف هنا.",
    until: "لا ينقضي — بحكم تعريف الملف.",
  },
  {
    guard: "guard-style",
    rule: "native-date",
    path: "lib/format/index.ts",
    reason: "منفذ الوقت الوحيد. `now()` هنا هي ما يمنع `new Date()` في كل مكان آخر.",
    until: "لا ينقضي — بحكم تعريف الوحدة.",
  },
  {
    guard: "guard-structure",
    rule: "raw-table",
    path: "components/shared/data-table.tsx",
    reason: "الجدول الجامع نفسه. منع `<table>` فيه يمنع وجود جدول أصلاً.",
    until: "لا ينقضي — بحكم تعريف المكوّن.",
  },
  {
    guard: "guard-structure",
    rule: "nav-outside-source",
    path: "components/shared/app-layout.tsx",
    reason: "التخطيط الجامع هو الموضع الوحيد الذي يُصيّر عناصر `<nav>`.",
    until: "لا ينقضي — بحكم تعريف المكوّن.",
  },
  {
    guard: "guard-structure",
    rule: "local-layout",
    path: "app/(auth)/layout.tsx",
    reason:
      "شاشات ما قبل المصادقة لا شريط جانبي فيها ولا تنقّل: إظهار أقسام لا تُفتح " +
      "إعلانٌ عن قدرة غير موجودة. تخطيط مختلف بقصد، لا نسخة ثانية من الجامع.",
    until: "لا ينقضي — بحكم اختلاف السياق.",
  },
  {
    guard: "guard-completeness",
    rule: "page-without-nav-entry",
    path: "app/(platform)/showcase",
    reason:
      "معرض الجوامع صفحة مرجعية للبناء لا للمستخدم، تُفتح بالرابط المباشر. " +
      "التصريح الذي يوجبه completeness-contract §٢.ب مكتوب في ترويستها.",
    until: "عند الاستغناء عن المعرض بعد اكتمال المرحلة الأولى.",
  },
  // ── قواعد أعمال موثّقة لم تُبنَ ميزتها بعد ──
  // ليست دَيناً: لا شيء ناقص، بل الميزة لم يحن دورها في الترتيب المعتمد.
  ...(
    [
      ["BR-CAP-01", "س١ — الهيكل الإداري"],
      ["BR-ADM-01", "س٣ — التسجيل والقبول"],
      ["BR-TRK-01", "س٣ — التسجيل والقبول"],
      ["BR-GEN-01", "س٦ — واجهة المشارك والتوليد"],
      ["BR-GEN-02", "س٦ — واجهة المشارك والتوليد"],
      ["BR-GEN-03", "س٦ — واجهة المشارك والتوليد"],
      ["BR-EXAM-01", "المرحلة الثانية — adr/0022"],
      ["BR-SESS-01", "المرحلة الثانية — adr/0022"],
      ["BR-SESS-02", "المرحلة الثانية — adr/0022"],
      ["BR-SESS-03", "المرحلة الثانية — adr/0022"],
      ["BR-PEN-01", "المرحلة الثانية — adr/0022"],
    ] as const
  ).map(([code, step]) => ({
    guard: "guard-completeness",
    rule: `rule-without-code:${code}`,
    path: "docs/ENTITIES.md",
    reason: `القاعدة موثّقة، وميزتها لم تُبنَ بعد.`,
    until: `عند بناء ${step}.`,
  })),
];

export const DECLARED_DEBT: ListEntry[] = [
  // فارغة الآن. أي بند هنا **يُبقي البوّابة حمراء** حتى يُعالَج.
];
