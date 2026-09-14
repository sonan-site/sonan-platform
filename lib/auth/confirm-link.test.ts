import { describe, expect, it } from "vitest";
import { parseConfirmLink } from "./confirm-link";

const parse = (query: string) => parseConfirmLink(new URLSearchParams(query));

describe("رابط البريد", () => {
  it("الدعوة والاستعادة وتأكيد البريد تُقبل بوجهتها", () => {
    expect(parse("token_hash=abc&type=invite&next=/activate")).toEqual({
      tokenHash: "abc",
      type: "invite",
      next: "/activate",
    });
    expect(parse("token_hash=abc&type=recovery&next=/activate")?.type).toBe("recovery");
    expect(parse("token_hash=abc&type=email&next=/journey")?.type).toBe("email");
  });

  it("**نوعٌ لا تصدره المنصة يُردّ**", () => {
    expect(parse("token_hash=abc&type=magiclink")).toBeNull();
    expect(parse("token_hash=abc&type=email_change")).toBeNull();
    expect(parse("token_hash=abc")).toBeNull();
  });

  it("بلا رمز يُردّ", () => {
    expect(parse("type=recovery")).toBeNull();
  });

  it("**الوجهة الخارجية لا تُتّبع** — تمرّ بقاعدة الدخول نفسها", () => {
    expect(parse("token_hash=abc&type=recovery&next=//evil.example")?.next).toBe("/dashboard");
  });
});
