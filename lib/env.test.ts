import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

describe("مخطط متغيّرات البيئة", () => {
  it("يقبل بيئة كاملة صالحة", () => {
    expect(parseEnv(valid).NEXT_PUBLIC_SUPABASE_URL).toBe(valid.NEXT_PUBLIC_SUPABASE_URL);
  });

  it("يفشل عند نقص متغيّر خادم، ويسمّيه في الرسالة", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...partial } = valid;
    expect(() => parseEnv(partial)).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("يرشد إلى ملف المثال عند الفشل", () => {
    expect(() => parseEnv({})).toThrowError(/\.env\.example/);
  });

  it("يفشل عند عنوان غير صالح", () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })).toThrowError();
  });

  it("لا يشترط مفتاح الخادم في نطاق العميل", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...partial } = valid;
    expect(() => parseEnv(partial, "client")).not.toThrow();
  });
});
