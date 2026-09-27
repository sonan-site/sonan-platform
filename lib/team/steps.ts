import type { NextStep } from "@/lib/programs/readiness";

/**
 * خطوة الفريق التالية — منطق نقيّ.
 *
 * الترتيب ترتيب العمل: من يعمل معك يُدعى، ثم يُعرَّف الدور، ثم يُسنَد. والدعوة
 * وحدها لا تفتح باباً — كانت الجملة مكتوبة في الشاشة بلا طريق إلى الأدوار.
 */
export type TeamCounts = { people: number; roles: number; assignments: number };

export function teamNextStep(counts: TeamCounts): {
  done: number;
  total: number;
  next: NextStep | null;
} {
  const steps: { key: string; title: string; tab: string; cta: string; done: boolean }[] = [
    {
      key: "invite",
      title: "ادعُ من يعمل معك",
      tab: "",
      cta: "افتح الأشخاص",
      // حسابك أنت صفٌّ في الملفات، فالدعوة تُعدّ خطوةً ما لم يكن معك أحد.
      done: counts.people > 1,
    },
    {
      key: "roles",
      title: "عرّف دوراً بصلاحياته",
      tab: "roles",
      cta: "افتح الأدوار",
      done: counts.roles > 1,
    },
    {
      key: "assignments",
      title: "أسنِد الأدوار لأصحابها",
      tab: "assignments",
      cta: "افتح الإسنادات",
      done: counts.assignments > 1,
    },
  ];

  const pending = steps.find((s) => !s.done);
  return {
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    next: pending ? { key: pending.key, title: pending.title, tab: pending.tab, cta: pending.cta } : null,
  };
}
