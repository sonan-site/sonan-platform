import { describe, expect, it } from "vitest";
import { filterCountries } from "@/components/shared/country-select";

describe("بحث الدول", () => {
  it("بلا بحث تظهر كل الدول والسعودية أولاً", () => {
    const all = filterCountries("");
    expect(all[0]!.code).toBe("SA");
    expect(all.length).toBeGreaterThan(200);
  });

  it("بالاسم العربي", () => {
    expect(filterCountries("الكويت").map((c) => c.code)).toContain("KW");
  });

  it("بالمفتاح، بـ«+» وبدونه", () => {
    expect(filterCountries("+971").map((c) => c.code)).toContain("AE");
    expect(filterCountries("971").map((c) => c.code)).toContain("AE");
  });

  it("بما لا يطابق شيئاً يرجع فارغاً", () => {
    expect(filterCountries("زززز")).toEqual([]);
  });
});
