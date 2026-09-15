import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** `fn_close_my_account` — الهجرة ٠٣٤. بدور `authenticated` وهويّة صاحب الحساب. */

let db: Client;
let sectionId: string;
let programId: string;
let roleId: string;

const PLAYER = "00000000-0000-4000-8000-000000000ca1";
const ADMIN = "00000000-0000-4000-8000-000000000ca2";
const USERS = [PLAYER, ADMIN];

async function asUser<T>(uid: string | null, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : "",
    ]);
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `close-account-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'صاحب حساب', '+966500000000')`,
      [uid],
    );
  }

  sectionId = (await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم إغلاق الحساب') returning id`,
  )).rows[0]!.id;
  programId = (await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug, status, capacity)
     values ($1, 'برنامج الإغلاق', 'close-account-test', 'published', 1) returning id`,
    [sectionId],
  )).rows[0]!.id;
  await db.query(`insert into public.participants (user_id, program_id) values ($1, $2)`, [
    PLAYER,
    programId,
  ]);

  roleId = (await db.query<{ id: string }>(
    `insert into public.roles (name) values ('دور اختبار الإغلاق') returning id`,
  )).rows[0]!.id;
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  if (programId) {
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  if (roleId) {
    await db.query(`delete from public.user_roles where role_id = $1`, [roleId]);
    await db.query(`delete from public.roles where id = $1`, [roleId]);
  }
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("إغلاق الحساب", () => {
  it("**المجهول يُرفض**", async () => {
    await expect(asUser(null, () => db.query(`select public.fn_close_my_account()`))).rejects.toThrow(
      /سجّل الدخول/,
    );
  });

  it("**صاحب الدور الإداري يُرفض ولا يتغيّر شيء** — لا يُغلق المدير المنصة على نفسه", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_close_my_account()`)),
    ).rejects.toThrow(/دور إداري/);
    const { rows } = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.profiles where user_id = $1`,
      [ADMIN],
    );
    expect(rows[0]?.deleted_at).toBeNull();
  });

  it("**المشارك يُغلق ← ملفه ومشاركته محذوفان حذفاً ليّناً، والتدقيق مكتوب، والمقعد متحرّر**", async () => {
    expect(
      (await db.query(`select public.fn_registration_state($1) as s`, [programId])).rows[0].s,
    ).toBe("full");

    await asUser(PLAYER, () => db.query(`select public.fn_close_my_account()`));

    const profile = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.profiles where user_id = $1`,
      [PLAYER],
    );
    expect(profile.rows[0]?.deleted_at).not.toBeNull();

    const live = await db.query(
      `select 1 from public.participants where user_id = $1 and deleted_at is null`,
      [PLAYER],
    );
    expect(live.rowCount).toBe(0);

    const audit = await db.query<{ after: { participations_left: number } }>(
      `select after from public.audit_log where actor_id = $1 and action = 'account_closed'`,
      [PLAYER],
    );
    expect(audit.rows[0]?.after.participations_left).toBe(1);

    expect(
      (await db.query(`select public.fn_registration_state($1) as s`, [programId])).rows[0].s,
    ).toBe("open");
  });

  it("والمغلق لا يُغلق ثانية", async () => {
    await expect(
      asUser(PLAYER, () => db.query(`select public.fn_close_my_account()`)),
    ).rejects.toThrow(/مغلق سلفاً/);
  });
});
