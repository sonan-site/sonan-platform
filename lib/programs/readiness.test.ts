import { describe, expect, it } from "vitest";
import { readiness, readinessSummary, type ReadinessInput } from "./readiness";

const full: ReadinessInput = {
  tracks: 2,
  tracksWithParts: 2,
  contentUnits: 20,
  taskFields: 2,
  templatesWithFields: 1,
  tracksWithPlanDays: 2,
  publicBlocks: 3,
  published: true,
};

function itemsOf(input: Partial<ReadinessInput>) {
  return readiness({ ...full, ...input });
}
function missing(input: Partial<ReadinessInput>) {
  return itemsOf(input).filter((i) => !i.done).map((i) => i.key);
}

describe("جاهزية البرنامج", () => {
  it("البرنامج المكتمل بلا نواقص", () => {
    expect(missing({})).toEqual([]);
    expect(readinessSummary(itemsOf({}))).toEqual({ done: 8, total: 8 });
  });

  it("**مسار واحد بلا نصيب يُبقي البند ناقصاً** — لا يكفي أن يُحدَّد بعضها", () => {
    expect(missing({ tracksWithParts: 1 })).toContain("parts");
  });

  it("مسار واحد بلا خطة يُبقي البند ناقصاً", () => {
    expect(missing({ tracksWithPlanDays: 1 })).toContain("plans");
  });

  it("برنامج فارغ: كل البنود ناقصة", () => {
    const empty = missing({
      tracks: 0,
      tracksWithParts: 0,
      contentUnits: 0,
      taskFields: 0,
      templatesWithFields: 0,
      tracksWithPlanDays: 0,
      publicBlocks: 0,
      published: false,
    });
    expect(empty).toHaveLength(8);
  });

  it("**بلا مسارات لا يُعَدّ النصيب ولا الخطة مكتملين** — وإلا لبدا الفارغ جاهزاً", () => {
    const none = missing({ tracks: 0, tracksWithParts: 0, tracksWithPlanDays: 0 });
    expect(none).toContain("parts");
    expect(none).toContain("plans");
  });

  it("كل بند يقول ماذا يعني نقصه", () => {
    expect(itemsOf({}).every((i) => i.consequence.length > 10)).toBe(true);
  });

  it("كل بند يشير إلى الشاشة التي تُصلحه", () => {
    expect(itemsOf({}).every((i) => i.fix.length > 0)).toBe(true);
  });
});
