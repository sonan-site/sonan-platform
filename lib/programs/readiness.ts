/**
 * جاهزية البرنامج للإطلاق — منطق خالص.
 *
 * الشاشات كانت تعرض كل مكوّن على حدة، فلا يعرف المُعِدّ **ما الذي ينقصه**
 * إلا بتفقّد ستّ شاشات واحدة واحدة. وهذا يجمعها في قائمة واحدة: ما اكتمل،
 * وما يحجب الإطلاق، وأين يُصلَح كلٌّ منها.
 *
 * وهي **وصفٌ لا قيد**: لا تمنع النشر ولا تُغيّر سلوكاً. النشر قرار الراعي،
 * وهذه تُريه ما يقرّر عليه.
 */

export type ReadinessInput = {
  tracks: number;
  /** مسارات لها نصيب محدَّد من المادة. */
  tracksWithParts: number;
  contentUnits: number;
  taskFields: number;
  /** أشكال أيام فيها واجب واحد على الأقل. */
  templatesWithFields: number;
  /** مسارات لها خطة بأيام. */
  tracksWithPlanDays: number;
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
      key: "templates",
      label: "شكل يوم بواجباته",
      consequence: "شكل اليوم يجمع الواجبات ومقاديرها، وبلا مقادير لا يُحسب نطاق.",
      done: input.templatesWithFields > 0,
      fix: "content",
    },
    {
      key: "plans",
      label: "خطة لكل مسار",
      consequence: "بلا خطة لا يبدأ المشارك، مهما اكتمل ما قبلها.",
      done: input.tracks > 0 && input.tracksWithPlanDays === input.tracks,
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
