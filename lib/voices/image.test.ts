import { describe, expect, it } from "vitest";
import { fitWithin, isVoiceImagePath, isVoiceImageSource, voiceImagePath } from "./image";

const U = "00000000-0000-4000-8000-000000000c61";
const V = "fb31b8c1-792e-4320-82a3-fec5bf579281";
const F = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

describe("مسار صورة «صوتك»", () => {
  it("يُبنى بالصيغة التي تفرضها القاعدة", () => {
    expect(voiceImagePath(U, V, F)).toBe(`${U}/${V}/${F}.jpg`);
    expect(isVoiceImagePath(voiceImagePath(U, V, F), U, V)).toBe(true);
  });

  it("يُرفض لغير صاحبه أو رسالته أو بامتدادٍ آخر أو مشوَّهاً", () => {
    expect(isVoiceImagePath(`${U}/${V}/${F}.jpg`, V, V)).toBe(false);
    expect(isVoiceImagePath(`${U}/${V}/${F}.jpg`, U, U)).toBe(false);
    expect(isVoiceImagePath(`${U}/${V}/${F}.png`, U, V)).toBe(false);
    expect(isVoiceImagePath(`${U}/${V}/../${F}.jpg`, U, V)).toBe(false);
    expect(isVoiceImagePath(`${U}/${V}/x.jpg`, U, V)).toBe(false);
  });

  it("الأصل: الصور الثلاثة وحدها", () => {
    expect(isVoiceImageSource("image/webp")).toBe(true);
    expect(isVoiceImageSource("image/gif")).toBe(false);
    expect(isVoiceImageSource("application/pdf")).toBe(false);
  });
});

describe("التصغير", () => {
  it("أطول ضلعٍ ٢٠٠٠ والنسبة محفوظة", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1170, 2532)).toEqual({ width: 924, height: 2000 });
  });

  it("الصغيرة لا تُكبَّر", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
