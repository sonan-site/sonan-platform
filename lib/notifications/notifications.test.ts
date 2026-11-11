import { describe, expect, it } from "vitest";
import { isTimestamp, notificationMessage, type MyNotification } from "./notifications";

const base: MyNotification = {
  id: "n1",
  kind: "track_change_decided",
  participantId: "00000000-0000-4000-8000-000000000001",
  programName: "مسابقة سنن",
  trackName: "الأربعون النووية",
  decision: "approved",
  fields: null,
  createdAt: "2026-11-04T10:00:00.123456+00:00",
  unread: true,
};

describe("نصّ الإشعار", () => {
  it("**القبول والرفض** باسم المسار المطلوب، ووجهته رحلته", () => {
    expect(notificationMessage(base)).toEqual({
      text: "قُبل طلب انتقالك إلى مسار «الأربعون النووية»",
      href: "/journey/00000000-0000-4000-8000-000000000001",
    });
    expect(notificationMessage({ ...base, decision: "rejected" }).text).toBe("لم يُقبل طلب انتقالك إلى مسار «الأربعون النووية»");
  });

  it("**نشر النتائج** بلا نتيجةٍ في النص", () => {
    expect(notificationMessage({ ...base, kind: "results_published", decision: null }).text).toBe(
      "نُشرت نتائج مسار «الأربعون النووية» — اطّلع على نتيجتك",
    );
  });

  it("بلا اسم مسارٍ ولا مشاركة: بديلٌ لا يقلب المعنى، وبلا رابط", () => {
    expect(notificationMessage({ ...base, trackName: null, participantId: null })).toEqual({
      text: "قُبل طلب انتقالك إلى المسار المطلوب",
      href: null,
    });
    expect(notificationMessage({ ...base, kind: "results_published", trackName: null }).text).toBe("نُشرت نتائج مسارك — اطّلع على نتيجتك");
  });
});

describe("تعديل الإدارة لبياناته", () => {
  it("**أسماء الحقول بلا قيمها** بترتيب النموذج، ووجهته «حسابي»", () => {
    expect(
      notificationMessage({ ...base, kind: "profile_corrected", participantId: null, fields: "birth_date,first_name,unknown" }),
    ).toEqual({ text: "عدّلت الإدارة بياناتك: الاسم الأول، تاريخ الميلاد", href: "/account" });
    expect(notificationMessage({ ...base, kind: "profile_corrected", fields: null }).text).toBe("عدّلت الإدارة بياناتك");
  });
});

describe("حدّ الوسم", () => {
  it("يقبل طابع القاعدة بأجزاء الثانية، ويردّ غيره", () => {
    expect(isTimestamp(base.createdAt)).toBe(true);
    expect(isTimestamp("أمس")).toBe(false);
    expect(isTimestamp(null)).toBe(false);
  });
});
