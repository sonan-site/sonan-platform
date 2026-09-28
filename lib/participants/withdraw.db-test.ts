import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * الانسحاب من برنامج والدعوات المعلّقة — الهجرة ٠٤٤ · `adr/0032`.
 *
 * الانسحاب **مشاركة صاحبها وحده**، والسجلّ يبقى والمقعد يتحرّر. والدعوة
 * المعلّقة حسابُ مصادقةٍ بلا ملف، ولا يراها إلا من يقرأ المستخدمين.
 */

let db: Client;
let sectionId: string;
let programId: string;
let playerParticipant: string;
let otherParticipant: string;
let roleId: string;

const PLAYER = "00000000-0000-4000-8000-0000000000f1";
const OTHER = "00000000-0000-4000-8000-0000000000f2";
const ADMIN = "00000000-0000-4000-8000-0000000000f3";
const INVITED = "00000000-0000-4000-8000-0000000000f4";
const USERS = [PLAYER, OTHER, ADMIN, INVITED];

async function asUser<T>(uid: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function liveParticipants(): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*) as n from public.participants where program_id = $1 and deleted_at is null`,
    [programId],
  );
  return Number(rows[0]!.n);
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `withdraw-${i}@test.local`],
    );
    // المدعوّ بلا ملف بقصد: هذه حالته قبل أن يُفعّل حسابه.
    if (uid !== INVITED) {
      await db.query(
        `insert into public.profiles (user_id, full_name, phone) values ($1, 'مشارك انسحاب', $2)`,
        [uid, `+96650000030${i}`],
      );
    }
  }

  sectionId = (await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار الانسحاب') returning id`,
  )).rows[0]!.id;
  programId = (await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug, capacity) values ($1, 'برنامج الانسحاب', 'withdraw-test', 2) returning id`,
    [sectionId],
  )).rows[0]!.id;

  const parts = await db.query<{ id: string; user_id: string }>(
    `insert into public.participants (user_id, program_id) values ($1, $3), ($2, $3) returning id, user_id`,
    [PLAYER, OTHER, programId],
  );
  playerParticipant = parts.rows.find((p) => p.user_id === PLAYER)!.id;
  otherParticipant = parts.rows.find((p) => p.user_id === OTHER)!.id;

  roleId = (await db.query<{ id: string }>(
    `insert into public.roles (name) values ('دور اختبار الانسحاب') returning id`,
  )).rows[0]!.id;
  await db.query(
    `insert into public.role_permissions (role_id, permission_code) values ($1, 'users.read')`,
    [roleId],
  );
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
    await db.query(`delete from public.role_permissions where role_id = $1`, [roleId]);
    await db.query(`delete from public.roles where id = $1`, [roleId]);
  }
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("الانسحاب من برنامج", () => {
  it("**لا ينسحب أحدٌ عن غيره**", async () => {
    await expect(
      asUser(PLAYER, () =>
        db.query(`select public.fn_withdraw_participation($1)`, [otherParticipant]),
      ),
    ).rejects.toThrow(/لا مشاركة لك بهذا المعرّف/);
    expect(await liveParticipants()).toBe(2);
  });

  it("**وصاحبها ينسحب: السجلّ يبقى والمقعد يتحرّر**", async () => {
    expect(await liveParticipants()).toBe(2);

    await asUser(PLAYER, () =>
      db.query(`select public.fn_withdraw_participation($1)`, [playerParticipant]),
    );

    const { rows } = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.participants where id = $1`,
      [playerParticipant],
    );
    expect(rows[0]!.deleted_at).not.toBeNull();
    // المقعد يتحرّر: السعة اثنان، والأحياء صاروا واحداً.
    expect(await liveParticipants()).toBe(1);

    const audit = await db.query(
      `select 1 from public.audit_log where entity_id = $1 and action = 'participation_withdrawn'`,
      [playerParticipant],
    );
    expect(audit.rowCount).toBe(1);
  });

  it("والمنسحب لا ينسحب مرتين", async () => {
    await expect(
      asUser(PLAYER, () =>
        db.query(`select public.fn_withdraw_participation($1)`, [playerParticipant]),
      ),
    ).rejects.toThrow(/لا مشاركة لك/);
  });

  it("**ويسجّل من جديد بعد انسحابه** — الفهرس الفريد على الأحياء وحدهم", async () => {
    await db.query(`insert into public.participants (user_id, program_id) values ($1, $2)`, [
      PLAYER,
      programId,
    ]);
    expect(await liveParticipants()).toBe(2);
  });
});

describe("الدعوات المعلّقة", () => {
  it("**من دُعي ولم يُفعّل حسابه يظهر**، ومن له ملف لا يظهر", async () => {
    const { rows } = await asUser(ADMIN, () =>
      db.query<{ email: string }>(`select email from public.fn_pending_invites()`),
    );
    const emails = rows.map((r) => r.email);
    expect(emails).toContain("withdraw-3@test.local");
    expect(emails).not.toContain("withdraw-0@test.local");
  });

  it("ومن لا يقرأ المستخدمين لا يرى شيئاً", async () => {
    const { rowCount } = await asUser(PLAYER, () =>
      db.query(`select * from public.fn_pending_invites()`),
    );
    expect(rowCount).toBe(0);
  });
});
