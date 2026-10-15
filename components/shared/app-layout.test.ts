import { describe, expect, it } from "vitest";
import { journeyTabs } from "./app-layout";

const ID = "0f0e0d0c-0b0a-4000-8000-000000000001";

describe("تبويبات الطالب (adr/0050)", () => {
  it("**في اليوم والخطة وإنجازي وحدها**، والحاليّ موسوم", () => {
    expect(journeyTabs(`/journey/${ID}`)?.map((t) => t.current)).toEqual([true, false, false]);
    expect(journeyTabs(`/journey/${ID}/plan`)?.map((t) => t.current)).toEqual([false, true, false]);
    expect(journeyTabs(`/journey/${ID}/progress`)?.map((t) => t.label)).toEqual(["اليوم", "الخطة", "إنجازي"]);
    expect(journeyTabs(`/journey/${ID}/plan`)?.[0]?.href).toBe(`/journey/${ID}`);
  });

  it("**لا تبويبات في الاختبار الموقوت** ولا في قائمة البرامج", () => {
    expect(journeyTabs(`/journey/${ID}/exam/${ID}`)).toBeNull();
    expect(journeyTabs("/journey")).toBeNull();
    expect(journeyTabs("/account")).toBeNull();
  });
});
