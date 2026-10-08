import { describe, expect, it } from "vitest";
import { attentionItems, type AttentionRow } from "./attention";

const row = (over: Partial<AttentionRow>): AttentionRow => ({
  kind: "track_change",
  programId: "p1",
  programName: "مسابقة سنن",
  amount: 1,
  ...over,
});

describe("ما يحتاج انتباهك", () => {
  it("**الترتيب ترتيب الضرر لا ترتيب الاستعلام**", () => {
    const items = attentionItems([
      row({ kind: "full", amount: 30 }),
      row({ kind: "profile_missing", programId: null, programName: null, amount: 2 }),
      row({ kind: "orphan_track", amount: 3 }),
      row({ kind: "track_change", amount: 1 }),
    ]);
    expect(items.map((i) => i.key)).toEqual([
      "orphan_track:p1",
      "track_change:p1",
      "full:p1",
      "profile_missing:-",
    ]);
  });

  it("**ولكل بندٍ طريقُ إصلاحه** — لا إخبارَ بعطبٍ بلا مخرج", () => {
    for (const kind of [
      "orphan_track",
      "track_without_plan",
      "track_change",
      "closed_with_followers",
      "no_contact",
      "full",
      "profile_missing",
    ]) {
      const [item] = attentionItems([row({ kind, amount: 1 })]);
      expect(item?.href, kind).toMatch(/^\/[a-z]/);
      expect(item?.cta, kind).not.toBe("");
      expect(item?.consequence, kind).not.toBe("");
    }
  });

  it("والصفر ليس بنداً — القاعدة قد تُرجعه فلا يُعرض", () => {
    expect(attentionItems([row({ amount: 0 })])).toHaveLength(0);
  });

  it("**والمفتاح المجهول يُتجاهَل** ولا يُعرض رمزاً خاماً للمدير", () => {
    expect(attentionItems([row({ kind: "something_new" })])).toHaveLength(0);
  });

  it("والرقم يظهر بالأرقام الهندية في نصّ البند", () => {
    const [item] = attentionItems([row({ kind: "track_change", amount: 3 })]);
    expect(item?.title).toContain("3");
    expect(item?.title).toContain("مسابقة سنن");
  });

  it("وبرنامجان بالنوع نفسه بندان لا بند", () => {
    const items = attentionItems([
      row({ kind: "no_contact", programId: "p1" }),
      row({ kind: "no_contact", programId: "p2" }),
    ]);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });
});
