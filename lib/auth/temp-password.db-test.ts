import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * كلمة المرور المؤقتة (adr/0060): حامل `users.password` يُصدر لطالبٍ في نطاقه · حساب الفريق لمدير
 * المنصة وحده · لا لنفسه · الموقوف والمحذوف لا · المدة من الخادم · كل إصدارٍ يُسجَّل باسم مُصدِره.
 * والتعيين نفسه بمفتاح الخدمة خارج القاعدة — فلا يُختبر هنا.
 */

let db: Client;
const SUPER = "00000000-0000-4000-8000-000000000b01";
const GLOBAL = "00000000-0000-4000-8000-000000000b02";
const SCOPED = "00000000-0000-4000-8000-000000000b03";
const NOBODY = "00000000-0000-4000-8000-000000000b04";
const STUDENT_A = "00000000-0000-4000-8000-000000000b05";
const STUDENT_B = "00000000-0000-4000-8000-000000000b06";
const STAFF = "00000000-0000-4000-8000-000000000b07";
const SUSPENDED = "00000000-0000-4000-8000-000000000b08";
const USERS = [SUPER, GLOBAL, SCOPED, NOBODY, STUDENT_A, STUDENT_B, STAFF, SUSPENDED];

let programA: string;

async function as<T = Record<string, unknown>>(
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null; code: string | null }> {
  const role = uid ? "authenticated" : "anon";
  await db.query("savepoint s");
  try {
    await db.query(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(uid ? { sub: uid, role } : { role }),
    ]);
    const { rows } = await db.query(sql, params);
    await db.query("reset role");
    await db.query("release savepoint s");
    return { rows: rows as T[], error: null, code: null };
  } catch (error) {
    await db.query("rollback to savepoint s");
    await db.query("reset role");
    const e = error as { message: string; code?: string };
    return { rows: [], error: e.message, code: e.code ?? null };
  }
}

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const allowed = async (by: string, target: string) =>
  (await as<{ ok: boolean }>(by, `select public.fn_temp_password_allowed($1) ok`, [target])).rows[0]?.ok;
const inTwoDays = `now() + interval '48 hours'`;

async function grant(uid: string, name: string, codes: string[], scope: string | null = null) {
  const role = (await one(`insert into public.roles (name) values ($1) returning id`, [name])).id;
  for (const code of codes) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [role, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [uid, role, scope]);
}

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  await db.query("begin");
  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role, encrypted_password, raw_app_meta_data)
       values ($1, $2, 'authenticated', 'authenticated', 'x', $3)`,
      [uid, `temp-pw-${i}@test.local`, { providers: i === 5 ? ["email", "google"] : ["email"] }],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, first_name, father_name, grandfather_name, family_name, gender,
                                    birth_date, nationality, phone)
       values ($1, $2, 'سالم', 'محمد', 'علي', 'التجربة', 'male', '2012-03-01', 'SA', $3)`,
      [uid, `حساب ${i}`, `+96650000071${i}`],
    );
  }
  await db.query(`insert into public.profile_identities (user_id, guardian_phone) values ($1, '+966500000799')`, [STUDENT_A]);
  await db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [SUSPENDED]);

  const section = (await one(`insert into public.sections (name) values ('قسم الكلمة المؤقتة') returning id`)).id;
  const programs: string[] = [];
  for (const slug of ["zz-temp-a", "zz-temp-b"]) {
    const program = (
      await one(`insert into public.programs (section_id, name, slug) values ($1, $2, $2) returning id`, [section, slug])
    ).id;
    const track = (await one(`insert into public.tracks (program_id, name) values ($1, 'مسار') returning id`, [program])).id;
    programs.push(program);
    // الطالب «أ» في البرنامج الأول، و«ب» في الثاني، والموقوف في الأول.
    const members = slug === "zz-temp-a" ? [STUDENT_A, SUSPENDED] : [STUDENT_B];
    for (const uid of members) {
      await db.query(`insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3)`, [uid, program, track]);
    }
  }
  programA = programs[0]!;

  const system = (await one(`select id from public.roles where is_system = true and deleted_at is null limit 1`)).id;
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [SUPER, system]);
  await grant(GLOBAL, "دعم الدخول العام", ["users.password"]);
  await grant(SCOPED, "دعم الدخول لبرنامج", ["users.password"], programA);
  await grant(STAFF, "محكّم تجريبي", ["exams.judge"]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("الإذن", () => {
  it("**دور النظام يحملها**", async () => {
    const r = await one(
      `select count(*)::int n from public.role_permissions rp join public.roles r on r.id = rp.role_id
        where r.is_system and rp.permission_code = 'users.password' and rp.deleted_at is null`,
    );
    expect(r.n).toBeGreaterThan(0);
  });

  it("**النطاق العام لكل طالب — والمحصور لطلاب برنامجه وحده**", async () => {
    expect(await allowed(GLOBAL, STUDENT_A)).toBe(true);
    expect(await allowed(GLOBAL, STUDENT_B)).toBe(true);
    expect(await allowed(SCOPED, STUDENT_A)).toBe(true);
    expect(await allowed(SCOPED, STUDENT_B)).toBe(false);
  });

  it("**حساب الفريق لمدير المنصة وحده (قرار أ)**", async () => {
    expect(await allowed(GLOBAL, STAFF)).toBe(false);
    expect(await allowed(SCOPED, STAFF)).toBe(false);
    expect(await allowed(SUPER, STAFF)).toBe(true);
    // ولا يُصدر حامل الصلاحية لمن يحملها — فهو حساب فريقٍ أيضاً.
    expect(await allowed(GLOBAL, SCOPED)).toBe(false);
  });

  it("لا لنفسه، ولا لمن لا صلاحية له، ولا للزائر", async () => {
    expect(await allowed(SUPER, SUPER)).toBe(false);
    expect(await allowed(NOBODY, STUDENT_A)).toBe(false);
    expect((await as(null, `select public.fn_temp_password_allowed($1)`, [STUDENT_A])).error).not.toBeNull();
  });
});

describe("شاشة الإصدار", () => {
  it("**الجوالان وطريقة الدخول لمن أُذن له**", async () => {
    const r = await as<{ phone: string; guardian_phone: string; has_google: boolean; is_staff: boolean; account_state: string }>(
      SCOPED,
      `select * from public.fn_temp_password_target($1)`,
      [STUDENT_A],
    );
    expect(r.error).toBeNull();
    expect(r.rows[0]).toMatchObject({
      phone: "+966500000714",
      guardian_phone: "+966500000799",
      has_google: false,
      is_staff: false,
      account_state: "active",
    });
    const google = await as<{ has_google: boolean }>(GLOBAL, `select has_google from public.fn_temp_password_target($1)`, [STUDENT_B]);
    expect(google.rows[0]?.has_google).toBe(true);
  });

  it("**ولا شيء لغيره — بخطأ الصلاحية**", async () => {
    const r = await as(SCOPED, `select * from public.fn_temp_password_target($1)`, [STUDENT_B]);
    expect(r.code).toBe("42501");
  });
});

describe("الإصدار", () => {
  it("**يُسجَّل باسم مُصدِره وأجله — بلا الكلمة**", async () => {
    const r = await as<{ id: string }>(SCOPED, `select public.fn_temp_password_issue($1, ${inTwoDays}) id`, [STUDENT_A]);
    expect(r.error).toBeNull();
    const log = await one(
      `select actor_id, entity_table, entity_id, after from public.audit_log
        where action = 'temp_password_issued' and after->>'user_id' = $1 order by created_at desc limit 1`,
      [STUDENT_A],
    );
    expect(log.actor_id).toBe(SCOPED);
    expect(log.entity_table).toBe("profiles");
    expect(log.entity_id).toBe(r.rows[0]!.id);
    expect(Object.keys(log.after).sort()).toEqual(["expires_at", "user_id"]);
  });

  it("**لا لغير المأذون — ولا يُسجَّل شيء**", async () => {
    const before = (await one(`select count(*)::int n from public.audit_log where action = 'temp_password_issued'`)).n;
    const r = await as(SCOPED, `select public.fn_temp_password_issue($1, ${inTwoDays})`, [STUDENT_B]);
    expect(r.code).toBe("42501");
    expect((await one(`select count(*)::int n from public.audit_log where action = 'temp_password_issued'`)).n).toBe(before);
  });

  it("**الموقوف لا تُفتح له**", async () => {
    const r = await as(GLOBAL, `select public.fn_temp_password_issue($1, ${inTwoDays})`, [SUSPENDED]);
    expect(r.code).toBe("23514");
  });

  it("والمدة بين الآن ويومين ونصف", async () => {
    expect((await as(GLOBAL, `select public.fn_temp_password_issue($1, now() - interval '1 minute')`, [STUDENT_A])).code).toBe("23514");
    expect((await as(GLOBAL, `select public.fn_temp_password_issue($1, now() + interval '10 days')`, [STUDENT_A])).code).toBe("23514");
    expect((await as(GLOBAL, `select public.fn_temp_password_issue($1, null)`, [STUDENT_A])).code).toBe("23514");
  });
});
