import { describe, expect, it } from "vitest";
import { documentQuery } from "./identity-search";

describe("نصّ البحث رقمُ وثيقة؟", () => {
  it("**الهوية والإقامة** — بأرقامٍ عربية ومسافات", () => {
    expect(documentQuery("1023456789")).toBe("1023456789");
    expect(documentQuery("٢٥٤٣ ٢٢٤ ٢٩٥")).toBe("2543224295");
  });

  it("**والجواز بحروفه** — صغيرةً أو بشَرطة", () => {
    expect(documentQuery("a12-34567")).toBe("A1234567");
  });

  it("**والجوال ليس وثيقة** — يبدأ بـ0 أو + أو 966 أو 00", () => {
    expect(documentQuery("0553088688")).toBeNull();
    expect(documentQuery("+966553088688")).toBeNull();
    expect(documentQuery("966553088688")).toBeNull();
    expect(documentQuery("00966553088688")).toBeNull();
  });

  it("**والاسم والقصير ليسا وثيقة** — أقلّ من ستّ خاناتٍ لا يُبحث به", () => {
    expect(documentQuery("محمد")).toBeNull();
    expect(documentQuery("8688")).toBeNull();
    expect(documentQuery("12345")).toBeNull();
    expect(documentQuery("محمد 1023456789")).toBeNull();
  });
});
