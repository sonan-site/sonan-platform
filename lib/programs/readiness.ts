/**
 * جاهزية البرنامج للإطلاق — منطق خالص.
 *
 * الشاشات كانت تعرض كل مكوّن على حدة، فلا يعرف المُعِدّ **ما الذي ينقصه**
 * إلا بتفقّد ستّ شاشات واحدة واحدة. وهذا يجمعها في قائمة واحدة: ما اكتمل،
 * وما يحجب الإطلاق، وأين يُصلَح كلٌّ منها.
 *
 * ومنها **الخطوة التالية** (`nextStep`): المعالج يعرض واحدة لا سبعاً، فمن
 * فتح برنامجه يعرف ما يفعله الآن لا ما ينقصه كلّه (`adr/0029`).
 */

export type ReadinessInput = {
  tracks: number;
  /** مسارات لها نصيب محدَّد من المادة. */
  tracksWithParts: number;
  contentUnits: number;
  taskFields: number;
  /** مسارات لخطتها الفعلية أيامٌ وقيم — الافتراضية أو المخصّصة (`adr/0038`). */
  tracksWithPlan: number;
  publicBlocks: number;
  published: boolean;
};

export type ReadinessItem = {
  key: string;
  label: string;
  /** ماذا يعني نقصه — بلغة المُعِدّ لا بلغة الجدول. */
  consequence: string;
  done: boolean;
  /** المسار النسبي للشاشة التي تُصلحه، أو `null` إن كانت هذه الصفحة. */
  fix: "content" | "plans" | "page" | "status" | "tracks";
};

export function readiness(input: ReadinessInput): ReadinessItem[] {
  return [
    {
      key: "tracks",
      label: "المسارات",
      consequence: "بلا مسار لا يجد المسجِّل ما يختاره.",
      done: input.tracks > 0,
      fix: "tracks",
    },
    {
      key: "content",
      label: "المادة المرقَّمة",
      consequence: "المادة مرجع كل واجب — وبلا ترقيم لا يُبنى شيء فوقها.",
      done: input.contentUnits > 0,
      fix: "content",
    },
    {
      key: "parts",
      label: "نصيب كل مسار من المادة",
      consequence: "المسار بلا نصيب لا يرى مشاركوه واجباً.",
      done: input.tracks > 0 && input.tracksWithParts === input.tracks,
      fix: "content",
    },
    {
      key: "fields",
      label: "واجبات اليوم",
      consequence: "بلا واجبات لا يبقى لليوم مضمون.",
      done: input.taskFields > 0,
      fix: "content",
    },
    {
      key: "plans",
      label: "خطة لكل مسار",
      consequence: "بلا خطة لا يبدأ المشارك، مهما اكتمل ما قبلها.",
      done: input.tracks > 0 && input.tracksWithPlan === input.tracks,
      fix: "plans",
    },
    {
      key: "page",
      label: "الصفحة المعلنة",
      consequence: "الصفحة هي ما يراه الزائر قبل التسجيل — وبلا محتوى تظهر فارغة.",
      done: input.publicBlocks > 0,
      fix: "page",
    },
    {
      key: "published",
      label: "النشر",
      consequence: "غير المنشور لا يظهر للزوّار ولا يُفتَح تسجيله.",
      done: input.published,
      fix: "status",
    },
  ];
}

export function readinessSummary(items: ReadinessItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** أين يُصلَح كل بند — تبويبٌ من تبويبات البرنامج، لكل بندٍ موضع. */
export const FIX_TAB: Record<ReadinessItem["fix"], string> = {
  tracks: "tracks",
  content: "content",
  plans: "plans",
  page: "page",
  status: "",
};

export type NextStep = {
  /** مفتاح البند الأول غير المكتمل. */
  key: string;
  /** ما يفعله الآن — بصيغة أمر. */
  title: string;
  /** التبويب الذي يُفعل فيه: اسمه النسبي، و«» لنظرة عامة. */
  tab: string;
  /** نصّ الزرّ المؤدّي إليه. */
  cta: string;
};

const STEP_TITLE: Record<string, { title: string; cta: string }> = {
  tracks: { title: "أضِف مسارات البرنامج", cta: "افتح المسارات" },
  content: { title: "أدخِل المادة المرقَّمة", cta: "افتح المادة" },
  parts: { title: "حدّد نصيب كل مسار من المادة", cta: "افتح المادة" },
  fields: { title: "سمِّ واجبات اليوم", cta: "افتح المادة" },
  plans: { title: "ابنِ خطة البرنامج — أو خطةً لكل مسار", cta: "افتح الخطط" },
  page: { title: "ابنِ الصفحة المعلنة", cta: "افتح الصفحة المعلنة" },
  published: { title: "انشر البرنامج", cta: "افتح النظرة العامة" },
};

/**
 * الخطوة الواحدة التالية، أو `null` إن اكتمل كل شيء.
 *
 * **الترتيب هو ترتيب البناء لا ترتيب العرض**: لا نصيب قبل مادة، ولا خطة قبل
 * حقولها. و`readiness` مرتّبة بهذا الترتيب أصلاً، فأول ناقصٍ فيها هو التالي.
 */
export function nextStep(items: ReadinessItem[]): NextStep | null {
  const pending = items.find((i) => !i.done);
  if (!pending) return null;
  const text = STEP_TITLE[pending.key] ?? { title: pending.label, cta: "افتح" };
  return { key: pending.key, title: text.title, tab: FIX_TAB[pending.fix], cta: text.cta };
}
