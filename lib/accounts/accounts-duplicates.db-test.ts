import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * علامة «مكرّر محتمل» في `fn_accounts_list` (الهجرة 20261110130000 · الدفعة ٣).
 *
 * سببان منفصلان: **الاسم الكامل والميلاد معاً** (`same_identity`) تكرارٌ محتمل حقاً، و**الجوال نفسه**
 * (`same_phone`) أغلبه إخوةٌ سجّلهم وليّهم — فلا يختلطان. والاسم يُقارَن بعد طيّ المسافات.
 * والقاعدة قد تحوي حسابات غير هذه، فكل استعلامٍ يُحصر بكلمةٍ في أسمائها.
 */

let db: Client;
let roleId: string;

const MARK = "قائمةالتكرار";
const FIRST = "00000000-0000-4000-8000-000000000f51";
const AGAIN = "00000000-0000-4000-8000-000000000f52";
const SIBLING = "00000000-0000-4000-8000-000000000f53";
const NAMESAKE = "00000000-0000-4000-8000-000000000f54";
const ADMIN = "00000000-0000-4000-8000-000000000f55";
const USERS = [FIRST, AGAIN, SIBLING, NAMESAKE, ADMIN];

type Row = { full_name: string; same_identity: string[]; same_phone: string[]; total: string };

async function list(duplicate: string | null = null): Promise<Row[]> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
    const { rows } = await db.query<Row>(
      `select full_name, same_identity, same_phone, total
       from public.fn_accounts_list($1, null, null, null, 'created_at', false, 25, 0, $2)`,
      [[MARK], duplicate],
    );
    await db.query("commit");
    return rows;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

const byName = (rows: Row[], name: string) => rows.find((r) => r.full_name === name)!;

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const people: [string, string, string, string | null][] = [
    // سجّل ثانيةً: الاسم والميلاد نفساهما، والجوال آخر — والمسافات الزائدة لا تُخفيه.
    [FIRST, `سالم ${MARK}`, "+966500000751", "2010-05-01"],
    [AGAIN, `سالم   ${MARK}`, "+966500000752", "2010-05-01"],
    // أخوه: جوال وليّه نفسه، واسمٌ آخر.
    [SIBLING, `خالد ${MARK}`, "+966500000751", "2012-01-01"],
    // سَمِيّه: الاسم نفسه وميلادٌ آخر — ليس تكراراً.
    [NAMESAKE, `سالم ${MARK}`, "+966500000754", "2011-03-03"],
    [ADMIN, "مدير قائمة التكرار", "+966500000755", null],
  ];
  for (const [i, [uid, name, phone, birth]] of people.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `accounts-dup-${i}@test.local`,
    ]);
    await db.query(
      `insert into public.profiles (user_id, full_name, phone, birth_date, created_at)
       values ($1, $2, $3, $4, now() - make_interval(days => $5))`,
      [uid, name, phone, birth, 10 - i],
    );
  }

  roleId = (await db.query<{ id: string }>(`insert into public.roles (name) values ('دور قائمة التكرار') returning id`)).rows[0]!.id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'users.read')`, [roleId]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);
});

afterAll(async () => {
  if (roleId) {
    await db.query(`delete from public.user_roles where role_id = $1`, [roleId]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [roleId]);
    await db.query(`delete from public.roles where id = $1`, [roleId]);
  }
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("التكرار المحتمل", () => {
  it("**الاسم والميلاد معاً** — والمسافات الزائدة لا تُخفيه، والسَّمِيّ بميلادٍ آخر ليس تكراراً", async () => {
    const rows = await list();
    expect(byName(rows, `سالم ${MARK}`).same_identity).toEqual([`سالم   ${MARK}`]);
    expect(byName(rows, `سالم   ${MARK}`).same_identity).toEqual([`سالم ${MARK}`]);
    expect(rows.filter((r) => r.full_name === `سالم ${MARK}`)).toHaveLength(2);
    expect(rows.find((r) => r.full_name === `سالم ${MARK}` && r.same_identity.length === 0)).toBeDefined();
  });

  it("**والجوال المشترك منفصلٌ عنه** — الأخ بجوال وليّه لا يُعدّ مكرّراً", async () => {
    const sibling = byName(await list(), `خالد ${MARK}`);
    expect(sibling.same_phone).toEqual([`سالم ${MARK}`]);
    expect(sibling.same_identity).toEqual([]);
  });

  it("**والتصفية بكلٍّ منهما**", async () => {
    expect((await list("identity")).map((r) => r.full_name).sort()).toEqual([`سالم   ${MARK}`, `سالم ${MARK}`].sort());
    expect((await list("phone")).map((r) => r.full_name).sort()).toEqual([`خالد ${MARK}`, `سالم ${MARK}`].sort());
    expect(Number((await list("identity"))[0]!.total)).toBe(2);
  });
});
