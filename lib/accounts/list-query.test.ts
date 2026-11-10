import { describe, expect, it } from "vitest";
import { parseAccountsQuery } from "./list-query";

describe("البحث", () => {
  it("بلا بحث ⇐ لا اسم ولا جوال", () => {
    expect(parseAccountsQuery({})).toMatchObject({ nameWords: [], phoneDigits: "" });
  });

  it("**الجوال كما يكتبه الناس** يطابق المخزَّن `+9665…` — بلا صفر البداية", () => {
    expect(parseAccountsQuery({ q: "0553088688" }).phoneDigits).toBe("553088688");
    expect(parseAccountsQuery({ q: "055 308 8688" }).phoneDigits).toBe("553088688");
    expect(parseAccountsQuery({ q: "+966553088688" }).phoneDigits).toBe("966553088688");
  });

  it("وجزءٌ منه كآخر أربعة أرقام", () => {
    expect(parseAccountsQuery({ q: "8688" })).toMatchObject({ nameWords: [], phoneDigits: "8688" });
  });

  it("**والأرقام العربية** تُقرأ لاتينية", () => {
    expect(parseAccountsQuery({ q: "٠٥٥٣٠٨٨٦٨٨" }).phoneDigits).toBe("553088688");
  });

  it("**الحدّ الأدنى بعد صفر البداية** — `055` و`000` لا تُعدّ جوالاً فتطابق الكثير", () => {
    expect(parseAccountsQuery({ q: "055" })).toMatchObject({ nameWords: ["055"], phoneDigits: "" });
    expect(parseAccountsQuery({ q: "000" })).toMatchObject({ nameWords: ["000"], phoneDigits: "" });
    expect(parseAccountsQuery({ q: "12" })).toMatchObject({ nameWords: ["12"], phoneDigits: "" });
  });

  it("**الاسم كلماتٌ** تُطابَق كلٌّ وحدها — «محمد علي» تجد «محمد بن علي»", () => {
    expect(parseAccountsQuery({ q: "  محمد  علي " }).nameWords).toEqual(["محمد", "علي"]);
  });

  it("وحروف المطابقة لا تبقى في كلمة", () => {
    expect(parseAccountsQuery({ q: "a%b_c*d" }).nameWords).toEqual(["a", "b", "c", "d"]);
    expect(parseAccountsQuery({ q: "%%" }).nameWords).toEqual([]);
  });

  it("ويُقصّ عند مئة حرف", () => {
    expect(parseAccountsQuery({ q: "ا".repeat(150) }).nameWords[0]).toHaveLength(100);
  });

  it("**القيمة المكرّرة في الرابط** لا تُسقط الصفحة — يؤخذ أولها", () => {
    expect(parseAccountsQuery({ q: ["أحمد", "علي"], page: ["2", "5"] })).toMatchObject({
      nameWords: ["أحمد"],
      page: 2,
    });
  });
});

describe("الفرز", () => {
  it("**الافتراضي: الأحدث أولاً**", () => {
    expect(parseAccountsQuery({}).sort).toEqual({ column: "created_at", ascending: false });
  });

  it("مفاتيح الجدول تُترجم إلى أعمدة القاعدة", () => {
    expect(parseAccountsQuery({ sort: "fullName", dir: "asc" }).sort).toEqual({ column: "full_name", ascending: true });
    expect(parseAccountsQuery({ sort: "joinedAt", dir: "desc" }).sort).toEqual({ column: "created_at", ascending: false });
  });

  it("ومفتاحٌ مجهول يُتجاهل — لا يصل عمودٌ من الرابط إلى الاستعلام", () => {
    expect(parseAccountsQuery({ sort: "phone", dir: "asc" }).sort).toEqual({ column: "created_at", ascending: false });
  });
});

describe("الصفحة", () => {
  it("تبدأ من واحد، وما لا يصلح رقماً يعود إليه", () => {
    expect(parseAccountsQuery({}).page).toBe(1);
    expect(parseAccountsQuery({ page: "3" }).page).toBe(3);
    expect(parseAccountsQuery({ page: "0" }).page).toBe(1);
    expect(parseAccountsQuery({ page: "-2" }).page).toBe(1);
    expect(parseAccountsQuery({ page: "abc" }).page).toBe(1);
  });
});
