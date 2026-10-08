import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * هوية المشارك (`adr/0047`، الهجرة ٠٧١).
 *
 * لا يقرؤها إلا صاحبها · الإدارة تراها مقنّعة · الكاملة لحامل `identities.read`
 * · الرقم لا يتكرّر · ويُقفل بعد تثبيته إلا لحامل `identities.write`
 * · ويُمحى بمحو الحساب.
 */

let db: Client;
const roles: string[] = [];

const OWNER = "00000000-0000-4000-8000-000000000f71";
const OTHER = "00000000-0000-4000-8000-000000000f72";
const VIEWER = "00000000-0000-4000-8000-000000000f73"; // users.read
const AUDITOR = "00000000-0000-4000-8000-000000000f74"; // identities.read
const FIXER = "00000000-0000-4000-8000-000000000f75"; // identities.write
const USERS = [OWNER, OTHER, VIEWER, AUDITOR, FIXER];

async function as<T extends Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null }> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const { rows } = await db.query<T>(sql, params);
    await db.query("commit");
    return { rows, error: null };
  } catch (error) {
    await db.query("rollback");
    return { rows: [], error: (error as Error).message };
  }
}

async function grantRole(uid: string, codes: string[]) {
  const role = (
    await db.query<{ id: string }>(`insert into public.roles (name) values ($1) returning id`, [
      `دور الهوية ${uid.slice(-2)}`,
    ])
  ).rows[0]!.id;
  roles.push(role);
  for (const code of codes) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [role, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [uid, role]);
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `identity-${i}@test.local`],
    );
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الهوية', $2)`, [
      uid,
      `+96650000077${i}`,
    ]);
  }
  await grantRole(VIEWER, ["users.read"]);
  await grantRole(AUDITOR, ["identities.read"]);
  await grantRole(FIXER, ["identities.write"]);
});

afterAll(async () => {
  await db.query(`delete from public.profile_identities where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.user_roles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [roles]);
  await db.query(`delete from public.roles where id = any($1::uuid[])`, [roles]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.end();
});

describe("profile_identities", () => {
  it("**صاحبها يحفظها ويقرؤها**", async () => {
    const saved = await as(
      OWNER,
      `insert into public.profile_identities (user_id, national_id) values ($1, '1023456789')`,
      [OWNER],
    );
    expect(saved.error).toBeNull();
    const read = await as<{ national_id: string }>(OWNER, `select national_id from public.profile_identities`);
    expect(read.rows.map((r) => r.national_id)).toEqual(["1023456789"]);
  });

  it("**وغيره لا يراها ولا يكتبها باسمه** — ولو كان يقرأ المستخدمين", async () => {
    expect((await as(OTHER, `select 1 from public.profile_identities`)).rows).toHaveLength(0);
    expect((await as(VIEWER, `select 1 from public.profile_identities`)).rows).toHaveLength(0);
    const forged = await as(
      OTHER,
      `insert into public.profile_identities (user_id, national_id) values ($1, '1999999999')`,
      [OWNER],
    );
    expect(forged.error).toMatch(/row-level security/);
  });

  it("**الإدارة تراها مقنّعة، وحامل identities.read كاملة**", async () => {
    const masked = await as<{ national_id: string; is_full: boolean }>(
      VIEWER,
      `select national_id, is_full from public.fn_identity_masked($1)`,
      [OWNER],
    );
    expect(masked.rows[0]).toEqual({ national_id: "1••••••89", is_full: false });

    const full = await as<{ national_id: string; is_full: boolean }>(
      AUDITOR,
      `select national_id, is_full from public.fn_identity_masked($1)`,
      [OWNER],
    );
    expect(full.rows[0]).toEqual({ national_id: "1023456789", is_full: true });

    expect((await as(OTHER, `select * from public.fn_identity_masked($1)`, [OWNER])).rows).toHaveLength(0);
  });

  it("**الرقم لا يتكرّر** — حسابٌ واحد لكل شخص", async () => {
    const dup = await as(
      OTHER,
      `insert into public.profile_identities (user_id, national_id) values ($1, '1023456789')`,
      [OTHER],
    );
    expect(dup.error).toMatch(/uq_profile_identities_national_id/);
  });

  it("والصيغة مفروضة: عشرة أرقام تبدأ بـ1 أو 2", async () => {
    const bad = await as(
      OTHER,
      `insert into public.profile_identities (user_id, national_id) values ($1, '3023456789')`,
      [OTHER],
    );
    expect(bad.error).toMatch(/chk_profile_identities_national_id/);
  });

  it("**الرقم المثبَّت لا يغيّره صاحبه** — وجوال وليّ الأمر يتغيّر", async () => {
    const changed = await as(
      OWNER,
      `update public.profile_identities set national_id = '1111111111' where user_id = $1`,
      [OWNER],
    );
    expect(changed.error).toMatch(/لا يُغيَّر بعد تثبيته/);
    const guardian = await as(
      OWNER,
      `update public.profile_identities set guardian_phone = '+966501112233' where user_id = $1`,
      [OWNER],
    );
    expect(guardian.error).toBeNull();
  });

  it("**وحامل identities.write يصحّحه**", async () => {
    const fixed = await as<{ national_id: string }>(
      FIXER,
      `update public.profile_identities set national_id = '1023456788' where user_id = $1 returning national_id`,
      [OWNER],
    );
    expect(fixed.error).toBeNull();
    expect(fixed.rows[0]?.national_id).toBe("1023456788");
  });
});
