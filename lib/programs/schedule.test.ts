import { describe, expect, it } from "vitest";
import { riyadhDayEnd, riyadhDayStart } from "@/lib/format";
import { composeSchedule, registrationEntry, scheduleStatus, type ScheduleEntry } from "./schedule";

const entry = (title: string, startsOn: string, endsOn: string | null = null): ScheduleEntry => ({
  id: title,
  title,
  startsOn,
  endsOn,
  note: "",
});

describe("حالة الموعد", () => {
  it("**المدى جارٍ من أوله إلى آخره** — شاملاً الطرفين", () => {
    const memorizing = entry("الحفظ", "2026-10-18", "2026-11-28");
    expect(scheduleStatus(memorizing, "2026-10-17")).toBe("upcoming");
    expect(scheduleStatus(memorizing, "2026-10-18")).toBe("now");
    expect(scheduleStatus(memorizing, "2026-11-28")).toBe("now");
    expect(scheduleStatus(memorizing, "2026-11-29")).toBe("done");
  });

  it("موعد اليوم الواحد جارٍ يومَه وحده", () => {
    const ceremony = entry("الحفل", "2026-12-12");
    expect(scheduleStatus(ceremony, "2026-12-11")).toBe("upcoming");
    expect(scheduleStatus(ceremony, "2026-12-12")).toBe("now");
    expect(scheduleStatus(ceremony, "2026-12-13")).toBe("done");
  });
});

describe("موعد التسجيل مشتقّ من نافذته", () => {
  it("**أيام الرياض لا أيام UTC** — الفتح أول يومه لا يرجع يوماً", () => {
    const e = registrationEntry(riyadhDayStart("2026-10-09"), riyadhDayEnd("2026-10-17"));
    expect(e).toMatchObject({ id: null, title: "التسجيل", startsOn: "2026-10-09", endsOn: "2026-10-17" });
  });

  it("طرفٌ واحد يكفي، وبلا طرفين لا موعد", () => {
    expect(registrationEntry(null, riyadhDayEnd("2026-10-17"))).toMatchObject({ startsOn: "2026-10-17", endsOn: null });
    expect(registrationEntry(riyadhDayStart("2026-10-09"), null)).toMatchObject({ startsOn: "2026-10-09", endsOn: null });
    expect(registrationEntry(null, null)).toBeNull();
  });

  it("نافذة اليوم الواحد موعدُ يومٍ لا مدى", () => {
    expect(registrationEntry(riyadhDayStart("2026-10-09"), riyadhDayEnd("2026-10-09"))?.endsOn).toBeNull();
  });
});

describe("ترتيب المواعيد", () => {
  it("**بيوم البداية** — والتسجيل في موضعه بينها", () => {
    const rows = [entry("الحفل", "2026-12-12"), entry("الحفظ", "2026-10-18", "2026-11-28")];
    const out = composeSchedule(rows, {
      opensAt: riyadhDayStart("2026-10-09"),
      closesAt: riyadhDayEnd("2026-10-17"),
    });
    expect(out.map((e) => e.title)).toEqual(["التسجيل", "الحفظ", "الحفل"]);
  });
});

describe("إغلاقٌ عند منتصف الليل", () => {
  it("يُعرض آخر يومٍ مفتوح لا يوم الإغلاق", () => {
    const e = registrationEntry(riyadhDayStart("2026-10-25"), "2026-11-15T00:00:00+03:00");
    expect(e?.endsOn).toBe("2026-11-14");
  });
});

describe("المدى بسطرين", () => {
  it("السنة مرةً، والشهر مرةً حين لا يتغيّر", async () => {
    const { scheduleRangeParts } = await import("./schedule");
    expect(scheduleRangeParts(entry("التسجيل", "2026-10-25", "2026-11-14"))).toEqual({
      hijri: "14 جمادى الأولى – 4 جمادى الآخرة 1448هـ",
      gregorian: "25 أكتوبر – 14 نوفمبر 2026م",
    });
    expect(scheduleRangeParts(entry("النهائي", "2026-12-13", "2026-12-17"))).toEqual({
      hijri: "4–8 رجب 1448هـ",
      gregorian: "13–17 ديسمبر 2026م",
    });
    expect(scheduleRangeParts(entry("الحفل", "2026-12-22"))).toEqual({ hijri: "13 رجب 1448هـ", gregorian: "22 ديسمبر 2026م" });
  });

  it("عبر سنتين: السنة في الطرفين", async () => {
    const { scheduleRangeParts } = await import("./schedule");
    expect(scheduleRangeParts(entry("مدى", "2026-12-28", "2027-01-03")).gregorian).toBe("28 ديسمبر 2026م – 3 يناير 2027م");
  });
});
