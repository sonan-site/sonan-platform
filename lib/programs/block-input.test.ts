import { describe, expect, it } from "vitest";
import { blockInput } from "./block-input";
import { BLOCK_SCHEMAS, BLOCK_TYPES, parseBlockContent } from "./blocks";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("قراءة محتوى العنصر من النموذج", () => {
  it("**الصفّ الفارغ يُسقَط** — النموذج ثابت الصفوف، والمحتوى بقدر ما كُتب", () => {
    const parsed = BLOCK_SCHEMAS.stats.parse(
      blockInput("stats", form({ "stat-0-value": "٥", "stat-0-label": "مسارات", "stat-3-value": "" })),
    );
    expect(parsed.items).toEqual([{ value: "٥", label: "مسارات" }]);
  });

  it("والصفّ نصفُ ممتلئ يبقى — فلا يضيع ما كُتب لأن قرينه فارغ", () => {
    const parsed = BLOCK_SCHEMAS.timeline.parse(
      blockInput("timeline", form({ "stage-0-title": "التسجيل" })),
    );
    expect(parsed.stages).toEqual([{ title: "التسجيل", dates: "", note: "" }]);
  });

  it("**والشروط قائمةُ نصوص** يُسقَط فارغها وتبقى بترتيبها", () => {
    const parsed = BLOCK_SCHEMAS.terms.parse(
      blockInput("terms", form({ "term-0": "للذكور", "term-1": "  ", "term-2": "سبع سنوات فأكثر" })),
    );
    expect(parsed.items).toEqual(["للذكور", "سبع سنوات فأكثر"]);
  });

  it("وصندوق التأشير يُقرأ ‹on› لا غير", () => {
    expect(BLOCK_SCHEMAS.tracks.parse(blockInput("tracks", form({ showCapacity: "on" }))).showCapacity).toBe(true);
    expect(BLOCK_SCHEMAS.tracks.parse(blockInput("tracks", form({}))).showCapacity).toBe(false);
  });
});

describe("مخطّطات العناصر", () => {
  it("**لكل نوعٍ مخطّط** — فلا نوعٌ يمرّ بلا حارس", () => {
    for (const type of BLOCK_TYPES) expect(BLOCK_SCHEMAS[type]).toBeDefined();
  });

  it("**والناقص يُردّ برسالةٍ عربية** لا بانهيار", () => {
    const missing = parseBlockContent("hero", {});
    expect(missing.ok).toBe(false);
    // الغائب رسالته عامة، والقصير رسالته باسم حقله — وكلتاهما عربية.
    if (!missing.ok) expect(missing.issues[0]).toMatch(/[؀-ۿ]/);

    const tooShort = parseBlockContent("hero", { title: "ا" });
    expect(tooShort.ok).toBe(false);
    if (!tooShort.ok) expect(tooShort.issues[0]).toContain("العنوان");
  });

  it("والافتراضات تُملأ فلا يُعرض حقلٌ فارغ في الصفحة", () => {
    const parsed = parseBlockContent("countdown", {});
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.content).toMatchObject({ heading: "يُغلق التسجيل" });
  });

  it("**والمحتوى التالف يُتخطّى ولا يُسقط الصفحة**", () => {
    expect(parseBlockContent("stats", { items: "ليست قائمة" }).ok).toBe(false);
    expect(parseBlockContent("stats", {}).ok).toBe(true);
  });
});
