import { describe, expect, it } from "vitest";
import { documentQuery, findByDocument } from "./identity-search";

describe("رقم الوثيقة في وضعه الصريح", () => {
  it("**أيّ رقمٍ صالح** — هوية، أو جواز بحروفه، أو رقمٌ أجنبي يبدأ بصفر", () => {
    expect(documentQuery("1023456789")).toBe("1023456789");
    expect(documentQuery("٢٥٤٣ ٢٢٤ ٢٩٥")).toBe("2543224295");
    expect(documentQuery("a12-34567")).toBe("A1234567");
    expect(documentQuery("012345678")).toBe("012345678");
    expect(documentQuery("12345")).toBe("12345");
  });

  it("وما لا يصلح رقماً ⇐ `null`", () => {
    expect(documentQuery("محمد")).toBeNull();
    expect(documentQuery("1234")).toBeNull();
  });
});

describe("findByDocument", () => {
  it("**ما لا يصلح رقماً لا يُبحث به** — فلا سطر في السجلّ", async () => {
    let called = false;
    const rpc = () => {
      called = true;
      return Promise.resolve({ data: null, error: null });
    };
    expect(await findByDocument(rpc, "محمد")).toBeUndefined();
    expect(called).toBe(false);
  });

  it("ويُرجع الحساب، أو `null` إن لم يوجد أو تعذّر", async () => {
    expect(await findByDocument(() => Promise.resolve({ data: "u1", error: null }), "1023456789")).toBe("u1");
    expect(await findByDocument(() => Promise.resolve({ data: null, error: null }), "1023456789")).toBeNull();
  });
});
