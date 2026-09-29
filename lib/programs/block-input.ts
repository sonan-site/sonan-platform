import { BLOCK_ROWS, type BlockType } from "./blocks";

/**
 * قراءة محتوى العنصر من النموذج — **موضعٌ واحد للإضافة والتعديل**.
 *
 * والعناصر ذات القوائم تُقرأ بصفوفٍ مرقَّمة (`stat-0-value`…) ويُسقَط الفارغ —
 * نمطُ شرائح شاشة الدخول (`lib/settings/showcase.ts`). فلا أزرارَ صفٍّ تُدار
 * بحالة في المتصفّح، ولا نموذجٌ يفقد ما كُتب فيه حين يفشل الحفظ.
 */

type Raw = Record<string, unknown>;

const str = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();

/** صفوفٌ مرقَّمة: تُقرأ كلها ويُسقَط ما كان كلّ حقوله فارغاً. */
function rows<T extends Raw>(count: number, read: (i: number) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const row = read(i);
    if (Object.values(row).some((v) => String(v ?? "") !== "")) out.push(row);
  }
  return out;
}

export function blockInput(type: BlockType, form: FormData): Raw {
  switch (type) {
    case "header":
      return { title: str(form, "title"), subtitle: str(form, "subtitle") };

    case "hero":
      return {
        title: str(form, "title"),
        subtitle: str(form, "subtitle"),
        primaryLabel: str(form, "primaryLabel"),
        primaryHref: str(form, "primaryHref"),
        secondaryLabel: str(form, "secondaryLabel"),
        secondaryHref: str(form, "secondaryHref"),
      };

    case "free_text":
      return { heading: str(form, "heading"), text: str(form, "text") };

    case "image":
      return { attachmentId: form.get("attachmentId") ?? undefined, alt: str(form, "alt") };

    case "countdown":
      return { heading: str(form, "heading"), endedText: str(form, "endedText") };

    case "stats":
      return {
        heading: str(form, "heading"),
        items: rows(BLOCK_ROWS.stats, (i) => ({
          value: str(form, `stat-${i}-value`),
          label: str(form, `stat-${i}-label`),
        })),
      };

    case "timeline":
      return {
        heading: str(form, "heading"),
        stages: rows(BLOCK_ROWS.timeline, (i) => ({
          title: str(form, `stage-${i}-title`),
          dates: str(form, `stage-${i}-dates`),
          note: str(form, `stage-${i}-note`),
        })),
      };

    case "tracks":
      return {
        heading: str(form, "heading"),
        showCapacity: form.get("showCapacity") === "on",
        showUnits: form.get("showUnits") === "on",
      };

    case "prizes":
      return {
        heading: str(form, "heading"),
        places: rows(BLOCK_ROWS.prizes, (i) => ({
          label: str(form, `place-${i}-label`),
          value: str(form, `place-${i}-value`),
        })),
        note: str(form, "note"),
      };

    case "terms":
      return {
        heading: str(form, "heading"),
        // قائمةُ نصوصٍ لا صفوفُ حقول، فالإسقاط على النصّ نفسه.
        items: Array.from({ length: BLOCK_ROWS.terms }, (_, i) => str(form, `term-${i}`)).filter(
          (v) => v !== "",
        ),
      };

    case "registration":
      return { heading: str(form, "heading"), buttonLabel: str(form, "buttonLabel") };

    case "faq":
      return { heading: str(form, "heading") };

    case "cta":
      return {
        heading: str(form, "heading"),
        text: str(form, "text"),
        buttonLabel: str(form, "buttonLabel"),
        buttonHref: str(form, "buttonHref"),
      };
  }
}
