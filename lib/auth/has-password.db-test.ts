import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * «له كلمة مرور» من مصدرها — الهجرة ٠٩٣ (د-٩). حساب Google أضاف كلمة مرور بلا هوية بريد
 * كان يُرى «بلا كلمة مرور»، فيغيّرها دون أن تُطلب منه الحالية.
 */

let db: Client;
const WITH_PW = "00000000-0000-4000-8000-000000000931";
const NO_PW = "00000000-0000-4000-8000-000000000932";
const NULL_PW = "00000000-0000-4000-8000-000000000933";
const USERS = [WITH_PW, NO_PW, NULL_PW];

async function asUser<T>(uid: string | null, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query(uid ? "set local role authenticated" : "set local role anon");
    if (uid) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    }
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

const has = (uid: string | null) =>
  asUser(uid, async () => (await db.query<{ v: boolean }>(`select public.fn_my_has_password() v`)).rows[0]!.v);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
  // بلا هوية بريد في الحالتين — كحساب Google: الأول أضاف كلمة مرور، والثاني لا.
  await db.query(
    `insert into auth.users (id, email, aud, role, encrypted_password) values
       ($1, 'has-pw-1@test.local', 'authenticated', 'authenticated', '$2a$10$abcdefghijklmnopqrstuv'),
       ($2, 'has-pw-2@test.local', 'authenticated', 'authenticated', ''),
       ($3, 'has-pw-3@test.local', 'authenticated', 'authenticated', null)`,
    USERS,
  );
});

afterAll(async () => {
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("fn_my_has_password", () => {
  it("**من encrypted_password لا من هوية البريد**", async () => {
    expect(await has(WITH_PW)).toBe(true);
    expect(await has(NO_PW)).toBe(false);
    expect(await has(NULL_PW)).toBe(false);
  });

  it("**لا تُمنح للزائر**", async () => {
    await expect(has(null)).rejects.toThrow(/permission denied/);
  });
});
