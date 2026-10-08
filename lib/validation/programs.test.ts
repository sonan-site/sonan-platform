import { describe, expect, it } from "vitest";
import { programSchema, registrationWindowSchema, scheduleEntryUpdateSchema } from "./programs";

const valid = {
  sectionId: "00000000-0000-4000-8000-000000000001",
  name: "مسابقة سنن",
  summary: "",
  slug: "sunan-1448",
  kind: "competition",
  participantLabel: "متسابق",
  contact: "",
  capacity: "",
  registrationOpensAt: "",
  registrationClosesAt: "",
  passingPercentage: "80",
  awardPercentage: "90",
};

describe("نافذة التسجيل", () => {
  it("**الفتح أول يومه والإغلاق آخر يومه** — بتوقيت الرياض لا منتصف ليل UTC", () => {
    const parsed = programSchema.parse({
      ...valid,
      registrationOpensAt: "2026-10-09",
      registrationClosesAt: "2026-10-17",
    });
    expect(new Date(parsed.registrationOpensAt!).toISOString()).toBe("2026-10-08T21:00:00.000Z");
    expect(new Date(parsed.registrationClosesAt!).toISOString()).toBe("2026-10-17T20:59:59.999Z");
  });

  it("نافذة يومٍ واحد صالحة — يُفتح ويُغلق في اليوم نفسه", () => {
    const parsed = programSchema.safeParse({
      ...valid,
      registrationOpensAt: "2026-10-09",
      registrationClosesAt: "2026-10-09",
    });
    expect(parsed.success).toBe(true);
  });

  it("الإغلاق قبل الفتح مرفوض", () => {
    const parsed = programSchema.safeParse({
      ...valid,
      registrationOpensAt: "2026-10-17",
      registrationClosesAt: "2026-10-09",
    });
    expect(parsed.error?.issues[0]?.path).toEqual(["registrationClosesAt"]);
  });

  it("الفارغ يبقى بلا حدّ", () => {
    const parsed = programSchema.parse(valid);
    expect(parsed.registrationOpensAt).toBeNull();
    expect(parsed.registrationClosesAt).toBeNull();
  });
});

describe("تعديل المواعيد", () => {
  it("**تعديل الموعد يشترط معرّفه** ويحفظ حقوله كالإضافة", () => {
    const base = { programId: valid.sectionId, title: "الحفل", startsOn: "2026-11-30", endsOn: "", note: "" };
    expect(scheduleEntryUpdateSchema.safeParse(base).success).toBe(false);
    const parsed = scheduleEntryUpdateSchema.parse({ ...base, entryId: valid.sectionId });
    expect(parsed).toMatchObject({ title: "الحفل", endsOn: null });
  });

  it("**نافذة التسجيل من المواعيد بحدَّي يوم الرياض** — والإغلاق قبل الفتح مرفوض", () => {
    const parsed = registrationWindowSchema.parse({
      programId: valid.sectionId,
      registrationOpensAt: "2026-10-09",
      registrationClosesAt: "2026-10-17",
    });
    expect(new Date(parsed.registrationClosesAt!).toISOString()).toBe("2026-10-17T20:59:59.999Z");
    expect(
      registrationWindowSchema.safeParse({
        programId: valid.sectionId,
        registrationOpensAt: "2026-10-17",
        registrationClosesAt: "2026-10-09",
      }).success,
    ).toBe(false);
  });
});
