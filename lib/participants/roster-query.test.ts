import { describe, expect, it } from "vitest";
import { applyRosterQuery, parseRosterQuery, type RosterItem } from "./roster-query";

const STATUSES = ["registered", "memorizing", "withdrawn"];
const T1 = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const T2 = "7a2b3c4d-5e6f-4a70-8b8c-9d0e1f2a3b4c";

const item = (over: Partial<RosterItem>): RosterItem => ({
  name: "مشارك",
  registrationNo: null,
  trackId: T1,
  trackName: "المسار الأول",
  trackOrder: 0,
  status: "memorizing",
  joinedAt: "2026-11-01T00:00:00Z",
  doneDays: 0,
  dayCount: 40,
  ...over,
});

const ROSTER: RosterItem[] = [
  item({ name: "محمد بن علي", registrationNo: "SN-1448-0012", doneDays: 10 }),
  item({ name: "أحمد صالح", registrationNo: "SN-1448-0003", trackId: T2, trackName: "المسار الخامس", trackOrder: 4, doneDays: 30 }),
  item({ name: "بدر", registrationNo: "SN-1448-0007", trackId: null, trackName: "بلا مسار", trackOrder: null, status: "registered", dayCount: 0 }),
  item({ name: "جابر", registrationNo: "SN-1448-0020", status: "withdrawn", doneDays: 5 }),
];

const run = (params: Parameters<typeof parseRosterQuery>[0], size = 25) =>
  applyRosterQuery(ROSTER, parseRosterQuery(params, STATUSES), size);
const names = (r: { rows: RosterItem[] }) => r.rows.map((x) => x.name);

describe("البحث", () => {
  it("**كلمات الاسم كلٌّ وحدها** — «محمد علي» تجد «محمد بن علي»", () => {
    expect(names(run({ q: "محمد علي" }))).toEqual(["محمد بن علي"]);
  });

  it("**ورقم التسجيل بجزئه**، وبأرقامٍ عربية", () => {
    expect(names(run({ q: "0012" }))).toEqual(["محمد بن علي"]);
    expect(names(run({ q: "٠٠٠٣" }))).toEqual(["أحمد صالح"]);
    expect(names(run({ q: "sn-1448-0007" }))).toEqual(["بدر"]);
  });

  it("بلا بحث ⇐ الكل بترتيب القاعدة", () => {
    expect(run({}).total).toBe(4);
    expect(names(run({}))[0]).toBe("محمد بن علي");
  });
});

describe("التصفية", () => {
  it("**بالمسار، وبلا مسار**", () => {
    expect(names(run({ track: T2 }))).toEqual(["أحمد صالح"]);
    expect(names(run({ track: "none" }))).toEqual(["بدر"]);
  });

  it("وبالحالة", () => {
    expect(names(run({ status: "withdrawn" }))).toEqual(["جابر"]);
  });

  it("**وما لا يُعرف يُتجاهل** — مسارٌ ليس معرّفاً، وحالةٌ ليست من حالات البرنامج", () => {
    expect(parseRosterQuery({ track: "x'; drop", status: "deleted" }, STATUSES)).toMatchObject({ track: null, status: null });
  });

  it("والبحث والتصفية معاً", () => {
    expect(names(run({ q: "SN", track: T1, status: "memorizing" }))).toEqual(["محمد بن علي"]);
  });
});

describe("الفرز", () => {
  it("بالاسم تصاعدياً وتنازلياً", () => {
    expect(names(run({ sort: "name", dir: "asc" }))).toEqual(["أحمد صالح", "بدر", "جابر", "محمد بن علي"]);
    expect(names(run({ sort: "name", dir: "desc" }))[0]).toBe("محمد بن علي");
  });

  it("**بالإنجاز** — ومن لا خطة له في الذيل في الاتجاهين", () => {
    expect(names(run({ sort: "progress", dir: "desc" }))).toEqual(["أحمد صالح", "محمد بن علي", "جابر", "بدر"]);
    expect(names(run({ sort: "progress", dir: "asc" }))).toEqual(["جابر", "محمد بن علي", "أحمد صالح", "بدر"]);
  });

  it("**بالمسار بترتيبه في البرنامج** لا بأبجدية اسمه — وبلا مسار في الذيل", () => {
    expect(names(run({ sort: "track", dir: "asc" })).at(-1)).toBe("بدر");
    expect(names(run({ sort: "track", dir: "desc" }))[0]).toBe("أحمد صالح");
    expect(names(run({ sort: "track", dir: "desc" })).at(-1)).toBe("بدر");
  });

  it("ومفتاحٌ مجهول ⇐ بلا فرز", () => {
    expect(parseRosterQuery({ sort: "phone" }, STATUSES).sort).toBeNull();
  });
});

describe("الصفحات", () => {
  it("**الصفحة بقدرها والعدد الكلّي معها**", () => {
    const second = run({ page: "2", sort: "name" }, 3);
    expect(names(second)).toEqual(["محمد بن علي"]);
    expect(second.total).toBe(4);
  });

  it("وما يتجاوز المدى يعود إلى الأولى", () => {
    expect(parseRosterQuery({ page: "1e12" }, STATUSES).page).toBe(1);
    expect(parseRosterQuery({ page: ["2", "9"] }, STATUSES).page).toBe(2);
  });
});
