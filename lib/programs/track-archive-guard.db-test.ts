import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * المسار المؤرشف لا يبقى تحته مشارك — الهجرة ٠٤٧ · `TECH-DEBT د-٦`.
 *
 * `fn_archive_track` كانت الحارس الوحيد، وسياسة `tracks_update` تُجيز لحامل
 * `programs.write` كتابة `deleted_at` مباشرةً — فيُلتَفّ عليها بطلبٍ واحد.
 * والمشغّل يحرس **الحالة** لا الطريق، فيُغلق المدخلين: أرشفةُ مسارٍ مأهول،
 * وإسنادُ مشاركٍ إلى مؤرشف.
 */

let db: Client;
let sectionId: string;
let programId: string;
let liveTrack: string;
let doomedTrack: string;
let spareTrack: string;
let participantId: string;
let roleId: string;

const PLAYER = "00000000-0000-4000-8000-000000000e21";
const OTHER = "00000000-0000-4000-8000-000000000e22";
const ADMIN = "00000000-0000-4000-8000-000000000e23";
const USERS = [PLAYER, OTHER, ADMIN];

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

async function archivedAt(trackId: string): Promise<string | null> {
  const { rows } = await db.query<{ deleted_at: string | null }>(
    `select deleted_at from public.tracks where id = $1`,
    [trackId],
  );
  return rows[0]!.deleted_at;
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `archive-guard-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'مشارك الأرشفة', $2)`,
      [uid, `+96650000050${i}`],
    );
  }

  sectionId = (
    await db.query<{ id: string }>(
      `insert into public.sections (name) values ('قسم حارس الأرشفة') returning id`,
    )
  ).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug)
       values ($1, 'برنامج الأرشفة', 'archive-guard-test') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;

  const names = ["مسار قائم", "مسار يُؤرشف", "مسار خالٍ"];
  const tracks = await db.query<{ id: string; name: string }>(
    `insert into public.tracks (program_id, name)
     select $1, n from unnest($2::text[]) as n returning id, name`,
    [programId, names],
  );
  liveTrack = tracks.rows.find((t) => t.name === names[0])!.id;
  doomedTrack = tracks.rows.find((t) => t.name === names[1])!.id;
  spareTrack = tracks.rows.find((t) => t.name === names[2])!.id;

  participantId = (
    await db.query<{ id: string }>(
      `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3) returning id`,
      [PLAYER, programId, doomedTrack],
    )
  ).rows[0]!.id;

  roleId = (
    await db.query<{ id: string }>(
      `insert into public.roles (name) values ('دور حارس الأرشفة') returning id`,
    )
  ).rows[0]!.id;
  for (const code of ["programs.read", "programs.write", "participants.read"]) {
    await db.query(
      `insert into public.role_permissions (role_id, permission_code) values ($1, $2)`,
      [roleId, code],
    );
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    ADMIN,
    roleId,
  ]);
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  if (roleId) {
    await db.query(`delete from public.user_roles where role_id = $1`, [roleId]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [roleId]);
    await db.query(`delete from public.roles where id = $1`, [roleId]);
  }
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("أرشفة المسار", () => {
  it("**الكتابة المباشرة لم تعد تلتفّ على الحارس** — وهي الثغرة بعينها", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(`update public.tracks set deleted_at = now() where id = $1`, [doomedTrack]),
      ),
    ).rejects.toThrow(/في المسار مشاركون — انقلهم قبل أرشفته/);
    expect(await archivedAt(doomedTrack)).toBeNull();
  });

  it("والدالة تقول ما يقوله المشغّل — سببٌ واحد لطريقين", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_archive_track($1)`, [doomedTrack])),
    ).rejects.toThrow(/في المسار مشاركون — انقلهم قبل أرشفته/);
  });

  it("**والمدخل المقابل مسدودٌ سلفاً** — لا يُسنَد مشاركٌ إلى مسارٍ مؤرشف", async () => {
    // مسارٌ خالٍ يُؤرشَف بلا اعتراض، ثم يُحاوَل الإسناد إليه.
    await asUser(ADMIN, () =>
      db.query(`update public.tracks set deleted_at = now() where id = $1`, [spareTrack]),
    );
    expect(await archivedAt(spareTrack)).not.toBeNull();

    // الرافض هنا `fn_guard_participant_capacity` (الهجرة ٠٣٩) لا مشغّلٌ جديد —
    // يُفحَص ليُعرَف أن الحالة مسدودة من الطرفين، فلا يُضاف حارسٌ ثانٍ بلا داعٍ.
    await expect(
      db.query(
        `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3)`,
        [OTHER, programId, spareTrack],
      ),
    ).rejects.toThrow(/هذا المسار غير متاح/);

    await expect(
      db.query(`update public.participants set track_id = $1 where id = $2`, [
        spareTrack,
        participantId,
      ]),
    ).rejects.toThrow(/هذا المسار غير متاح/);
  });

  it("**ومن غادره مشاركوه يُؤرشَف**", async () => {
    await db.query(`update public.participants set track_id = $1 where id = $2`, [
      liveTrack,
      participantId,
    ]);
    await asUser(ADMIN, () =>
      db.query(`update public.tracks set deleted_at = now() where id = $1`, [doomedTrack]),
    );
    expect(await archivedAt(doomedTrack)).not.toBeNull();
  });

  it("والاستعادة لا تُحرَس — ردّ المسار لأصحابه ليس أرشفةً", async () => {
    await db.query(`update public.tracks set deleted_at = null where id = $1`, [doomedTrack]);
    expect(await archivedAt(doomedTrack)).toBeNull();
  });
});
