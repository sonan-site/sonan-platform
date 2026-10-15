import { describe, expect, it } from "vitest";
import { lastSignInAt, signedInRecently } from "./recent-sign-in";

const NOW = 1_800_000_000;

describe("حداثة الدخول في الجلسة (ب٢ · د-٩)", () => {
  it("**أحدث مدخلٍ ذي وقت** — وصيغة السلاسل بلا وقت لا تُعدّ", () => {
    expect(lastSignInAt([{ method: "oauth", timestamp: NOW - 100 }, { method: "password", timestamp: NOW - 5 }])).toBe(NOW - 5);
    expect(lastSignInAt(["oauth"])).toBeNull();
    expect(lastSignInAt(undefined)).toBeNull();
  });

  it("**خلال عشر دقائق حديث، وبعدها لا**", () => {
    expect(signedInRecently([{ method: "oauth", timestamp: NOW - 599 }], NOW)).toBe(true);
    expect(signedInRecently([{ method: "oauth", timestamp: NOW - 601 }], NOW)).toBe(false);
  });

  it("**عاملٌ ثانٍ حديث لا يُعدّ دخولاً** — فلا يتجاوز به الحاجز من وجد الجلسة مفتوحة", () => {
    expect(signedInRecently([{ method: "oauth", timestamp: NOW - 3600 }, { method: "totp", timestamp: NOW - 5 }], NOW)).toBe(false);
    expect(signedInRecently([{ method: "webauthn", timestamp: NOW - 5 }], NOW)).toBe(false);
  });

  it("**وقتٌ في المستقبل البعيد لا يفتح الباب**", () => {
    expect(signedInRecently([{ method: "oauth", timestamp: NOW + 3600 }], NOW)).toBe(false);
    expect(signedInRecently([{ method: "oauth", timestamp: NOW + 30 }], NOW)).toBe(true);
  });
});
