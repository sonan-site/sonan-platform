import { describe, expect, it } from "vitest";
import { notificationMessage } from "@/lib/notifications/notifications";
import { classifyPushFailure, deviceFromUserAgent, isAllowedEndpoint, pushPayload, type ClaimedNotification } from "./shared";

describe("عنوان الجهاز — خدمات الإشعار وحدها (adr/0064 · م٢)", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b-x_y",
    "https://web.push.apple.com/QGx-y_z",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2bx",
  ])("يقبل %s", (url) => expect(isAllowedEndpoint(url)).toBe(true));

  it.each([
    "http://fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com@evil.example/x",
    "https://evil.push.apple.com.evil.example/x",
    "https://example.com/push",
    "https://fcm.googleapis.com/",
    `https://fcm.googleapis.com/${"a".repeat(1100)}`,
    42,
  ])("يرفض %s", (url) => expect(isAllowedEndpoint(url)).toBe(false));
});

describe("نوع الجهاز لا وصف متصفحه (م١١)", () => {
  it("يردّه إلى أربعة", () => {
    expect(deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)")).toBe("ios");
    expect(deviceFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(deviceFromUserAgent(null)).toBe("other");
  });
});

describe("ردّ خدمة الإشعار (م١)", () => {
  it("الاشتراك الميت وحده يُحذف، وخطأ الإعداد لا يُحتسب على الجهاز", () => {
    expect(classifyPushFailure(410)).toBe("gone");
    expect(classifyPushFailure(404)).toBe("gone");
    expect(classifyPushFailure(403)).toBe("config");
    expect(classifyPushFailure(400)).toBe("config");
    expect(classifyPushFailure(413)).toBe("config");
    expect(classifyPushFailure(429)).toBe("transient");
    expect(classifyPushFailure(503)).toBe("transient");
    expect(classifyPushFailure(undefined)).toBe("transient");
  });
});

describe("حمولة الإشعار — نصّ «تنبيهاتي» نفسه", () => {
  const base: ClaimedNotification = {
    id: "n1",
    recipient_id: "u1",
    kind: "track_change_decided",
    track_name: "عشرة أجزاء",
    decision: "approved",
    body: null,
    created_at: "2026-11-26T10:00:00Z",
  };

  it("النصّ مطابقٌ لما في الجرس، والوجهة «تنبيهاتي»", () => {
    const p = pushPayload(base)!;
    const inBell = notificationMessage({
      id: "n1",
      kind: "track_change_decided",
      participantId: "x",
      programName: null,
      trackName: "عشرة أجزاء",
      decision: "approved",
      fields: null,
      createdAt: base.created_at,
      unread: true,
    }).text;
    expect(p).toEqual({ title: "منصة سنن", body: inBell, url: "/notifications", tag: "n1" });
  });

  it("تعديل البيانات بأسماء الحقول بلا قيمها", () => {
    expect(pushPayload({ ...base, kind: "profile_corrected", body: "phone" })!.body).toMatch(/^عدّلت الإدارة بياناتك/);
  });

  it("نوعٌ لا تعرفه الواجهة لا يُرسَل", () => {
    expect(pushPayload({ ...base, kind: "unknown_kind" })).toBeNull();
  });
});
