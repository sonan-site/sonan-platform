import { describe, expect, it } from "vitest";
import { optionsError, parseOptions } from "./admission-options";

describe("خيارات سؤال القائمة", () => {
  it("سطرٌ لكل خيار: يُشذَّب، والفارغ يُهمل، والترتيب كما كُتب", () => {
    expect(parseOptions("  منصة X \n\n إنستقرام\r\nأخرى  \n")).toEqual(["منصة X", "إنستقرام", "أخرى"]);
  });

  it("خياران فأكثر، بلا تكرار، وحدٌّ للطول والعدد", () => {
    expect(optionsError(["أ"])).toMatch(/خيارين/);
    expect(optionsError(["أ", "أ"])).toMatch(/تكرار/);
    expect(optionsError(["أ", "ب".repeat(81)])).toMatch(/80/);
    expect(optionsError(Array.from({ length: 31 }, (_, i) => `خيار ${i}`))).toMatch(/30/);
    expect(optionsError(["قناة الجمعية في الواتساب", "أخرى"])).toBeNull();
  });
});
