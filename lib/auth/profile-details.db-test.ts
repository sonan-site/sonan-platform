import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isProfileComplete, type ProfileCompleteness } from "./account-state";

/**
 * بيانات الحساب في القاعدة — الهجرة ٠٣٦.
 *
 * الصيغ مفروضة بقيود لا بالشاشة، والاسم الكامل يُحسب من أجزائه، و«المكتمل»
 * في القاعدة يطابق نظيره في TypeScript حرفاً.
 */

let db: Client;
const USER = "00000000-0000-4000-8000-000000000da1";

const PARTS = {
  first_name: "إبراهيم",
  father_name: "محمد",
  family_name: "الحسين",
  gender: "male",
  birth_date: "1990-01-01",
  nationality: "SA",
  phone: "+966512345678",
};

async function reset(values: Record<string, string | null>) {
  await db.query(`delete from public.profiles where user_id = $1`, [USER]);
  const columns = Object.keys(values);
  await db.query(
    `insert into public.profiles (user_id, full_name, ${columns.join(", ")})
     values ($1, 'قديم', ${columns.map((_, i) => `$${i + 2}`).join(", ")})`,
    [USER, ...Object.values(values)],
  );
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
  await db.query(
    `insert into auth.users (id, email, aud, role) values ($1, 'profile-details@test.local', 'authenticated', 'authenticated')`,
    [USER],
  );
});

afterAll(async () => {
  await db.query(`delete from public.profiles where user_id = $1`, [USER]);
  await db.query(`delete from auth.users where id = $1`, [USER]);
  await db?.end();
});

describe("صيغ بيانات الحساب", () => {
  it("**الاسم الكامل يُحسب من أجزائه** ويتبع تعديلها", async () => {
    await reset({ ...PARTS, grandfather_name: "عبدالله" });
    const read = async () =>
      (await db.query<{ full_name: string }>(`select full_name from public.profiles where user_id = $1`, [USER]))
        .rows[0]!.full_name;
    expect(await read()).toBe("إبراهيم محمد عبدالله الحسين");
    await db.query(`update public.profiles set grandfather_name = null where user_id = $1`, [USER]);
    expect(await read()).toBe("إبراهيم محمد الحسين");
  });

  it("**الجوال بغير الصيغة الدولية يُرفض**", async () => {
    await expect(reset({ ...PARTS, phone: "0512345678" })).rejects.toThrow(/chk_profiles_phone_e164/);
  });

  it("الرقم الإضافي المساوي للأساسي يُرفض", async () => {
    await expect(reset({ ...PARTS, phone_secondary: PARTS.phone })).rejects.toThrow(/chk_profiles_phone_secondary/);
  });

  it("تاريخ ميلاد في المستقبل يُرفض", async () => {
    await expect(reset({ ...PARTS, birth_date: "2999-01-01" })).rejects.toThrow(/في المستقبل/);
  });

  it("الجنسية بغير رمز الحرفين تُرفض", async () => {
    await expect(reset({ ...PARTS, nationality: "Saudi" })).rejects.toThrow(/chk_profiles_nationality/);
  });

  it("**الجوال يقبل الفراغ حتى الاستكمال** — والملف بلا جوال ناقص", async () => {
    await reset({ ...PARTS, phone: null });
    const { rows } = await db.query<{ complete: boolean }>(
      `select public.fn_profile_is_complete(p) as complete from public.profiles p where user_id = $1`,
      [USER],
    );
    expect(rows[0]!.complete).toBe(false);
  });
});

describe("«المكتمل» في القاعدة = نظيره في TypeScript", () => {
  const cases: [string, Partial<ProfileCompleteness>][] = [
    ["مكتمل", {}],
    ["بلا اسم أول", { first_name: null }],
    ["بلا أب", { father_name: null }],
    ["بلا عائلة", { family_name: null }],
    ["بلا جنس", { gender: null }],
    ["بلا ميلاد", { birth_date: null }],
    ["بلا جنسية", { nationality: null }],
    ["بلا جوال", { phone: null }],
  ];

  for (const [name, change] of cases) {
    it(name, async () => {
      const row = { ...PARTS, ...change } as Record<string, string | null>;
      await reset(row);
      const { rows } = await db.query<{ complete: boolean }>(
        `select public.fn_profile_is_complete(p) as complete from public.profiles p where user_id = $1`,
        [USER],
      );
      const ts = isProfileComplete({ deleted_at: null, ...(row as Omit<ProfileCompleteness, "deleted_at">) });
      expect(rows[0]!.complete).toBe(ts);
    });
  }
});
