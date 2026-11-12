import { describe, expect, it } from "vitest";
import { generateTempPassword, TEMP_PASSWORD_KEY, tempPasswordState } from "./temp-password";

const EXPIRES = "2026-11-14T12:00:00.000Z";
const expiresMs = Date.parse(EXPIRES);
const meta = { [TEMP_PASSWORD_KEY]: EXPIRES };
const signedAt = (ms: number, method = "password") => [{ method, timestamp: Math.floor(ms / 1000) }];

describe("الكلمة المؤقتة", () => {
  it("تُملى بلا لبس: خمسة أحرف وأربعة أرقام، بلا المتشابهات", () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toMatch(/^[a-hjkmnp-z]{5}-[2-9]{4}$/);
    }
  });

  it("**بلا علامة لا شيء**", () => {
    expect(tempPasswordState({ providers: ["email"] }, signedAt(expiresMs), expiresMs)).toBe("none");
    expect(tempPasswordState(null, null, expiresMs)).toBe("none");
  });

  it("**من دخل قبل انقضائها يُتمّ ولو تأخّر — ومن دخل بعده بها لا**", () => {
    expect(tempPasswordState(meta, signedAt(expiresMs - 1000), expiresMs + 3_600_000)).toBe("pending");
    expect(tempPasswordState(meta, signedAt(expiresMs + 1000), expiresMs + 2000)).toBe("expired");
  });

  it("ومن دخل بـ Google يعيّن كلمته أياً كان الأجل", () => {
    expect(tempPasswordState(meta, signedAt(expiresMs + 60_000, "oauth"), expiresMs + 120_000)).toBe("pending");
  });

  it("بلا amr يُحكم بالآن — والعلامة التالفة منتهية", () => {
    expect(tempPasswordState(meta, undefined, expiresMs - 1)).toBe("pending");
    expect(tempPasswordState(meta, undefined, expiresMs + 1)).toBe("expired");
    expect(tempPasswordState({ [TEMP_PASSWORD_KEY]: "غد" }, signedAt(0), 0)).toBe("expired");
  });
});
