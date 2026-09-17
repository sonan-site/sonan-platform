import { describe, expect, it } from "vitest";
import { parseLinkFragment } from "./link-fragment";

describe("رابط الاسترجاع والدعوة — ما بعد #", () => {
  it("**الجلسة تُقرأ من الرابط**", () => {
    expect(parseLinkFragment("#access_token=aaa&expires_in=3600&refresh_token=bbb&type=recovery")).toEqual({
      kind: "session",
      accessToken: "aaa",
      refreshToken: "bbb",
    });
  });

  it("الرابط المنتهي يُعرف منتهياً", () => {
    expect(
      parseLinkFragment("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"),
    ).toEqual({ kind: "error", expired: true });
  });

  it("وخطأ آخر غير منتهٍ", () => {
    expect(parseLinkFragment("#error=server_error")).toEqual({ kind: "error", expired: false });
  });

  it("رابط بلا جلسة ولا خطأ — لا شيء", () => {
    expect(parseLinkFragment("")).toEqual({ kind: "none" });
    expect(parseLinkFragment("#access_token=aaa")).toEqual({ kind: "none" });
  });
});
