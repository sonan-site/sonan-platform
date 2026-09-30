import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ما يشغل المسار — الهجرة ٠٥٥.
 *
 * زرّ حذف المسار يُعطَّل بسببٍ مكتوب (`ق-٢٠`)، والسبب عدُّ مشاركيه. والعدّ
 * `definer` بحارسٍ صريح: **من لا يكتب في البرنامج لا يرى صفّاً**، لا صفراً
 * يوهمه أن المسار خالٍ فيُعرَض له زرٌّ سيُرفض.
 */

let db: Client;
let sectionId: string;
let programId: string;
let fullTrack: string;
let emptyTrack: string;
let goneTrack: string;
let planId: string;
let writerRole: string;
let readerRole: string;

const WRITER = "00000000-0000-4000-8000-000000000f51";
const READER = "00000000-0000-4000-8000-000000000f52";
const MEMBER = "00000000-0000-4000-8000-000000000f53";
const USERS = [WRITER, READER, MEMBER];

type UsageRow = { track_id: string; live_participants: number; plans: number };

async function usageFor(uid: string): Promise<UsageRow[]> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const { rows } = await db.query<UsageRow>(
      `select track_id, live_participants, plans from public.fn_track_usage($1)`,
      [programId],
    );
    await db.query("commit");
    return rows;
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
      [uid, `usage-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الشغل', $2)`,
      [uid, `+96650000075${i}`],
    );
  }

  sectionId = (
    await db.query<{ id: string }>(
      `insert into public.sections (name) values ('قسم شغل المسار') returning id`,
    )
  ).rows[0]!.id;

  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug)
       values ($1, 'برنامج شغل المسار', 'track-usage-test') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;

  const track = async (name: string, order: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.tracks (program_id, name, sort_order) values ($1, $2, $3) returning id`,
        [programId, name, order],
      )
    ).rows[0]!.id;

  fullTrack = await track("مسار مأهول", 0);
  emptyTrack = await track("مسار خالٍ", 1);
  goneTrack = await track("مسار محذوف", 2);

  await db.query(`update public.tracks set deleted_at = now() where id = $1`, [goneTrack]);

  planId = (
    await db.query<{ id: string }>(
      `insert into public.plans (track_id, name) values ($1, 'خطة المأهول') returning id`,
      [fullTrack],
    )
  ).rows[0]!.id;

  await db.query(
    `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3)`,
    [MEMBER, programId, fullTrack],
  );

  writerRole = (
    await db.query<{ id: string }>(
      `insert into public.roles (name) values ('دور كاتب الشغل') returning id`,
    )
  ).rows[0]!.id;
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(
      `insert into public.role_permissions (role_id, permission_code) values ($1, $2)`,
      [writerRole, code],
    );
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    WRITER,
    writerRole,
  ]);

  readerRole = (
    await db.query<{ id: string }>(
      `insert into public.roles (name) values ('دور قارئ الشغل') returning id`,
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.role_permissions (role_id, permission_code) values ($1, 'programs.read')`,
    [readerRole],
  );
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    READER,
    readerRole,
  ]);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.participants where program_id = $1`, [programId]);
  if (planId) await db.query(`delete from public.plans where id = $1`, [planId]);
  await db.query(`delete from public.tracks where program_id = $1`, [programId]);
  await db.query(`delete from public.programs where id = $1`, [programId]);
  await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db.query(`delete from public.user_roles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [
    [writerRole, readerRole],
  ]);
  await db.query(`delete from public.roles where id = any($1::uuid[])`, [[writerRole, readerRole]]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.end();
});

describe("fn_track_usage", () => {
  it("**تعدّ المشاركين الأحياء وخطط المسار** — وهما ما يمنع الحذف وما يذهب معه", async () => {
    const rows = await usageFor(WRITER);
    const full = rows.find((r) => r.track_id === fullTrack);
    const empty = rows.find((r) => r.track_id === emptyTrack);

    expect(full).toMatchObject({ live_participants: 1, plans: 1 });
    expect(empty).toMatchObject({ live_participants: 0, plans: 0 });
  });

  it("والمحذوف لا يُعدّ — الشاشة لا تعرضه فلا معنى لشغله", async () => {
    const rows = await usageFor(WRITER);
    expect(rows.map((r) => r.track_id)).not.toContain(goneTrack);
  });

  it("**ومن لا يكتب لا يرى صفّاً** — لا صفراً يوهمه أن المسار خالٍ", async () => {
    expect(await usageFor(READER)).toHaveLength(0);
    expect(await usageFor(MEMBER)).toHaveLength(0);
  });

  it("وانسحاب المشارك يُفرغ المسار، فيصير الحذف ممكناً", async () => {
    await db.query(`update public.participants set deleted_at = now() where track_id = $1`, [
      fullTrack,
    ]);
    const rows = await usageFor(WRITER);
    expect(rows.find((r) => r.track_id === fullTrack)?.live_participants).toBe(0);
    await db.query(`update public.participants set deleted_at = null where track_id = $1`, [
      fullTrack,
    ]);
  });
});
