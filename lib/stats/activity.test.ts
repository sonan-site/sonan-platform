import { describe, expect, it } from "vitest";
import { addDays, bucketsFor, hoursLabel, parseStatsQuery, periodLabel, spanDays, tickLabel } from "./activity";

const TODAY = "2026-11-15";
const GLOBAL = { global: true, programs: [] };
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";

describe("الأيام", () => {
  it("الإزاحة على التقويم عبر الشهور، والطول شاملاً طرفيه", () => {
    expect(addDays("2026-11-15", -6)).toBe("2026-11-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(spanDays("2026-11-09", "2026-11-15")).toBe(7);
    expect(spanDays(TODAY, TODAY)).toBe(1);
  });

  it("**الساعة لأسبوعين، و٣ ساعات لشهر، و٦ لشهرين، واليوم لسنة** — فلا يُرسم ١٤٤٠ عموداً", () => {
    expect(bucketsFor(7)).toEqual(["hour", "3h", "6h", "day"]);
    expect(bucketsFor(30)).toEqual(["3h", "6h", "day"]);
    expect(bucketsFor(60)).toEqual(["6h", "day"]);
    expect(bucketsFor(200)).toEqual(["day"]);
  });
});

describe("المرشّحات من الرابط", () => {
  it("الأصل: سبعة أيام باليوم، والكل", () => {
    expect(parseStatsQuery({}, TODAY, GLOBAL)).toEqual({
      range: "7",
      from: "2026-11-09",
      to: TODAY,
      bucket: "day",
      audience: "all",
      program: null,
      track: null,
    });
  });

  it("اليوم بالساعة، وفترةٌ لا تتاح للمدى تعود إلى أصله", () => {
    expect(parseStatsQuery({ range: "today" }, TODAY, GLOBAL)).toMatchObject({ from: TODAY, to: TODAY, bucket: "hour" });
    expect(parseStatsQuery({ range: "60", bucket: "hour" }, TODAY, GLOBAL)).toMatchObject({ bucket: "day" });
    expect(parseStatsQuery({ range: "60", bucket: "6h" }, TODAY, GLOBAL)).toMatchObject({ bucket: "6h" });
  });

  it("المدى المخصّص: لا مستقبل، ولا مقلوب، ولا أطول من سنة", () => {
    expect(parseStatsQuery({ range: "custom", from: "2026-11-01", to: "2026-11-10" }, TODAY, GLOBAL)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-10",
    });
    expect(parseStatsQuery({ range: "custom", to: "2027-01-01" }, TODAY, GLOBAL)).toMatchObject({ to: TODAY });
    expect(parseStatsQuery({ range: "custom", from: "2026-11-12", to: "2026-11-10" }, TODAY, GLOBAL)).toMatchObject({
      from: "2026-11-04",
    });
    expect(parseStatsQuery({ range: "custom", from: "2024-01-01" }, TODAY, GLOBAL).from).toBe("2025-11-15");
  });

  it("**البرنامج والمسار للطلاب وحدهم**", () => {
    expect(parseStatsQuery({ audience: "staff", program: P1, track: T1 }, TODAY, GLOBAL)).toMatchObject({
      program: null,
      track: null,
    });
    expect(parseStatsQuery({ audience: "student", program: P1, track: T1 }, TODAY, GLOBAL)).toMatchObject({
      program: P1,
      track: T1,
    });
    expect(parseStatsQuery({ audience: "student", track: T1 }, TODAY, GLOBAL)).toMatchObject({ track: null });
  });

  it("**المحصور: الطلاب وحدهم، وبرنامجٌ من نطاقه**", () => {
    const scoped = { global: false, programs: [P1] };
    expect(parseStatsQuery({ audience: "all" }, TODAY, scoped)).toMatchObject({ audience: "student", program: P1 });
    expect(parseStatsQuery({ audience: "student", program: P2 }, TODAY, scoped)).toMatchObject({ program: P1 });
  });
});

describe("تسميات الفترات بتوقيت الرياض", () => {
  // ٢١:٠٠ UTC = منتصف الليل في الرياض، الإثنين ١٦ نوفمبر.
  const midnight = "2026-11-15T21:00:00Z";
  const evening = "2026-11-15T15:00:00Z"; // ٦ م الأحد

  it("الساعة والفترة الأوسع، واليوم بلا ساعات", () => {
    expect(hoursLabel(evening, "hour")).toBe("6 م");
    expect(hoursLabel(evening, "6h")).toBe("6 م – 12 ص");
    expect(hoursLabel(evening, "day")).toBe("");
    expect(periodLabel(evening, "hour")).toContain("الأحد");
  });

  it("محور الزمن: أول ساعات اليوم باسم يومه", () => {
    expect(tickLabel(midnight, "hour")).toBe("الاثنين");
    expect(tickLabel(evening, "3h")).toBe("6 م");
  });
});
