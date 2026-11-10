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

  it("و`%` `_` حرفان كغيرهما — الدالة لا تطابق بـ`ilike`", () => {
    expect(parseAccountsQuery({ q: "a%b_c" }).nameWords).toEqual(["a%b_c"]);
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

describe("التصفية", () => {
  it("بلا تصفية ⇐ الكل", () => {
    expect(parseAccountsQuery({})).toMatchObject({ program: null, status: null });
  });

  it("**بلا برنامج**، أو ببرنامجٍ بمعرّفه", () => {
    const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    expect(parseAccountsQuery({ program: "none" }).program).toBe("none");
    expect(parseAccountsQuery({ program: id.toUpperCase() }).program).toBe(id);
  });

  it("**وما لا يُعرف يُتجاهل** — لا تصل قيمةٌ من الرابط إلى الدالة إلا مما تفهمه", () => {
    expect(parseAccountsQuery({ program: "any" }).program).toBeNull();
    expect(parseAccountsQuery({ program: "x'; drop" }).program).toBeNull();
    expect(parseAccountsQuery({ status: "deleted" }).status).toBeNull();
  });

  it("**والتكرار المحتمل:** بالاسم والميلاد، أو بالجوال — وما سواهما يُتجاهل", () => {
    expect(parseAccountsQuery({ dup: "identity" }).duplicate).toBe("identity");
    expect(parseAccountsQuery({ dup: "phone" }).duplicate).toBe("phone");
    expect(parseAccountsQuery({ dup: "name" }).duplicate).toBeNull();
  });

  it("والحالة: نشط · موقوف · في السلّة", () => {
    expect(parseAccountsQuery({ status: "active" }).status).toBe("active");
    expect(parseAccountsQuery({ status: "suspended" }).status).toBe("suspended");
    expect(parseAccountsQuery({ status: "bin" }).status).toBe("bin");
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

  it("**وما يتجاوز مدى الإزاحة** يعود إلى الأولى لا يُسقط الصفحة", () => {
    expect(parseAccountsQuery({ page: "1e12" }).page).toBe(1);
    expect(parseAccountsQuery({ page: "Infinity" }).page).toBe(1);
  });
});
