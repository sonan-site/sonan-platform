import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARABIC_NAME, isArabicName } from "@/lib/validation/profile";

/**
 * الاسم بالحروف العربية في القاعدة (adr/0062 · الهجرة 20261118100000).
 *
 * المشغّل يرفض الجزء الجديد أو المتغيّر وحده — فالقائم بحروفٍ لاتينية يُوقَف ويُعدَّل جواله ويُمحى
 * كغيره — وإنشاء الحساب لا يُرفض باسمٍ لاتيني في بياناته (يُستكمل في صفحته). والصيغة في القاعدة
 * تطابق نظيرتها في TypeScript حرفاً.
 */

let db: Client;
const OLD = "00000000-0000-4000-8000-0000000062a1";
const NEW = "00000000-0000-4000-8000-0000000062a2";
const ADMIN = "00000000-0000-4000-8000-0000000062a3";
const SIGNUP = "00000000-0000-4000-8000-0000000062a4";
const USERS = [OLD, NEW, ADMIN, SIGNUP];
const roleIds: string[] = [];

const PARTS = {
  first_name: "سالم",
  father_name: "محمد",
  grandfather_name: "علي",
  family_name: "التجربة",
  gender: "male",
  birth_date: "2012-03-01",
  nationality: "SA",
};

async function insertProfile(uid: string, parts: Record<string, string>, phone: string) {
  const cols = Object.keys(parts);
  await db.query(
    `insert into public.profiles (user_id, full_name, phone, ${cols.join(", ")})
     values ($1, '', $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")})`,
    [uid, phone, ...Object.values(parts)],
  );
}

/** حسابٌ قديم بحروفٍ لاتينية — يسبق المشغّل، فيُدرج من وراء ظهره كما كانت الـ١٣٤. */
async function legacyProfile(uid: string, phone: string) {
  await db.query("begin");
  try {
    await db.query("alter table public.profiles disable trigger trg_profiles_arabic_name");
    await insertProfile(uid, { ...PARTS, first_name: "Salem", family_name: "Altajriba" }, phone);
    await db.query("alter table public.profiles enable trigger trg_profiles_arabic_name");
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function asUser<T>(uid: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function rejects(sql: string, params: unknown[]) {
  await expect(db.query(sql, params)).rejects.toMatchObject({ code: "23514" });
}

const count = async (uid: string) =>
  asUser(uid, async () => (await db.query<{ n: number }>(`select public.fn_non_arabic_names() as n`)).rows[0]!.n);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
  for (const [i, id] of [OLD, NEW, ADMIN].entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      id,
      `arabic-name-${i}@test.local`,
    ]);
  }
  await legacyProfile(OLD, "+966500000621");
  await insertProfile(ADMIN, PARTS, "+966500000623");
  const role = (await db.query<{ id: string }>(`insert into public.roles (name) values ('قارئ أسماء') returning id`)).rows[0]!.id;
  roleIds.push(role);
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'users.read')`, [role]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, role]);
});

afterAll(async () => {
  if (roleIds.length) {
    await db.query(`delete from public.user_roles where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.roles where id = any($1::uuid[])`, [roleIds]);
  }
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[]) or entity_id::text = any($1::text[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("الاسم بالحروف العربية (adr/0062)", () => {
  it("**الصيغة واحدة في القاعدة وTypeScript**", async () => {
    const samples = [
      "سالم", "عبد الله", "مُحَمَّد", "آل-سعود", "ابن ٱلقيم", "پرویز", "عائشہ", "ئيلاف", "يحيى", "الشيخة",
      "Salem", "سالمA", "سالم1", "١سالم", "-سالم", "سالم.", "ـسالم", "سالم'", " سالم", "",
      // نهايةٌ بشَرطةٍ أو مسافة · ألفٌ خنجرية أولاً · علامة اتجاهٍ خفية (المراجعة).
      "سالم-", "سالم ", `${String.fromCharCode(0x670)}سالم`, `سالم${String.fromCharCode(0x200f)}`, "بنِ",
    ];
    const { rows } = await db.query<{ name: string; ok: boolean }>(
      `select n as name, private.is_arabic_name(n) as ok from unnest($1::text[]) n`,
      [samples],
    );
    for (const r of rows) expect(r.ok, r.name).toBe(ARABIC_NAME.test(r.name));
    // والجزء الغائب (فراغٌ أو مسافات) مقبولٌ في الطرفين — نقصٌ يحكم به «المكتمل».
    const parts = (v: string | null) => ({ first_name: "سالم", father_name: "محمد", grandfather_name: v, family_name: "التجربة" });
    for (const v of [null, "", "  ", "Ali", "علي"]) {
      const sql = (await db.query<{ ok: boolean }>(`select private.name_part_ok($1) as ok`, [v])).rows[0]!.ok;
      expect(sql, String(v)).toBe(isArabicName(parts(v)));
    }
  });

  it("**الجديد بغير العربية يُرفض** — إدراجاً وتعديلاً", async () => {
    await rejects(
      `insert into public.profiles (user_id, full_name, phone, first_name, father_name, family_name) values ($1, '', '+966500000622', 'Ali', 'محمد', 'التجربة')`,
      [NEW],
    );
    await insertProfile(NEW, PARTS, "+966500000622");
    for (const col of ["first_name", "father_name", "grandfather_name", "family_name"]) {
      await rejects(`update public.profiles set ${col} = 'Latin' where user_id = $1`, [NEW]);
    }
    await db.query(`update public.profiles set first_name = 'سالمٌ' where user_id = $1`, [NEW]);
  });

  it("**القائم لا يُمسّ:** يُعدَّل جواله ويُوقَف باسمه اللاتيني، ولا يُبدَّل جزءٌ منه بلاتيني آخر", async () => {
    await db.query(`update public.profiles set phone = '+966500000631', birth_date = '2012-03-02' where user_id = $1`, [OLD]);
    // الجزء نفسه في جملة التعديل (كما يرسل النموذج كل الأجزاء) لا يُرفض ما لم يتغيّر.
    await db.query(`update public.profiles set first_name = 'Salem', father_name = 'محمد' where user_id = $1`, [OLD]);
    await rejects(`update public.profiles set family_name = 'Other' where user_id = $1`, [OLD]);
    // وتصحيح جزءٍ بالعربية يمرّ ولو بقي غيره لاتينياً لم يتغيّر.
    await db.query(`update public.profiles set family_name = 'التجربة' where user_id = $1`, [OLD]);
    const { rows } = await db.query<{ full_name: string }>(`select full_name from public.profiles where user_id = $1`, [OLD]);
    expect(rows[0]!.full_name).toBe("Salem محمد علي التجربة");
  });

  it("**إنشاء الحساب باسمٍ لاتيني لا يُرفض** — بلا ملف، فيُستكمل في صفحته", async () => {
    await db.query(
      `insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, 'arabic-name-signup@test.local', 'authenticated', 'authenticated', $2)`,
      [SIGNUP, JSON.stringify({ ...PARTS, first_name: "Salem", phone: "+966500000624" })],
    );
    const { rows } = await db.query(`select 1 from public.profiles where user_id = $1`, [SIGNUP]);
    expect(rows).toHaveLength(0);
  });

  it("**العدّاد لقارئ الحسابات**، وغيره يعدّ نفسه", async () => {
    const before = await count(ADMIN);
    expect(before).toBeGreaterThanOrEqual(1);
    expect(await count(OLD)).toBe(1);
    expect(await count(NEW)).toBe(0);
    await db.query(`update public.profiles set first_name = 'سالم' where user_id = $1`, [OLD]);
    expect(await count(ADMIN)).toBe(before - 1);
    expect(await count(OLD)).toBe(0);
  });
});
