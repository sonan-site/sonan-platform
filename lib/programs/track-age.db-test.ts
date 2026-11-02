import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * حدّا العمر لكل مسار (`adr/0047`، الهجرة `20261102090000_track_age`).
 *
 * بالسنوات الكاملة يوم التسجيل بتوقيت الرياض، والأعلى شامل. والإنفاذ مشغّلٌ على
 * `participants` يغطي `fn_register` والإدراج المباشر والإسناد من فراغ — والنقل من مسارٍ
 * إلى مسار خارج النطاق (البند ١١ من التعليمة: يُذكر ولا يُعالَج).
 */

let db: Client;
let sectionId: string;
let programId: string;
/** الخمسة بحدود التعليمة، والسادس بلا حدّ. */
let tracks: string[] = [];

const LIMITS: [number | null, number | null][] = [
  [7, 15],
  [7, 18],
  [7, null],
  [7, null],
  [15, null],
  [null, null],
];

// العمر يوم الاختبار — وتاريخ الميلاد يُحسب في القاعدة بتوقيت الرياض لا في JS.
const AGES = [6, 7, 15, 16, 18, 19] as const;
const userOf = (age: number) => `00000000-0000-4000-8000-0000000a${String(age).padStart(4, "0")}`;
// يبلغ 16 غداً: عمره اليوم 15.
const TOMORROW16 = "00000000-0000-4000-8000-0000000b0016";
// بلا تاريخ ميلاد.
const NOBIRTH = "00000000-0000-4000-8000-0000000c0000";
const USERS = [...AGES.map(userOf), TOMORROW16, NOBIRTH];

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

const fitting = async (uid: string) =>
  (await as<{ id: string }>(uid, `select public.fn_my_tracks_for_age($1) as id`, [programId])).rows.map((r) => r.id);

const needs = async (uid: string) =>
  (await as<{ code: string }>(uid, `select code from public.fn_registration_needs($1)`, [programId])).rows.map(
    (r) => r.code,
  );

const selfInsert = (uid: string, trackId: string | null) =>
  as<{ id: string }>(
    uid,
    `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3) returning id`,
    [uid, programId, trackId],
  );

const clearParticipants = () => db.query(`delete from public.participants where program_id = $1`, [programId]);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const people: [string, string | null][] = [
    ...AGES.map((a): [string, string] => [userOf(a), `${a} years`]),
    [TOMORROW16, "16 years -1 day"],
    [NOBIRTH, null],
  ];
  for (const [i, [uid, span]] of people.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `track-age-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, gender, birth_date, nationality, phone)
       values ($1, 'مسجِّل العمر', 'male',
               case when $2::text is null then null
                    else ((now() at time zone 'Asia/Riyadh')::date - $2::interval)::date end,
               'SA', '+966501119' || lpad($3::text, 3, '0'))`,
      [uid, span, i],
    );
  }

  sectionId = (
    await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم عمر المسار') returning id`)
  ).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, min_age) values ($1, 'برنامج عمر المسار', 'track-age-test', 7)
       returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  tracks = [];
  for (const [i, [min, max]] of LIMITS.entries()) {
    tracks.push(
      (
        await db.query<{ id: string }>(
          `insert into public.tracks (program_id, name, sort_order, min_age, max_age)
           values ($1, $2, $3, $4, $5) returning id`,
          [programId, `مسار ${i + 1}`, i, min, max],
        )
      ).rows[0]!.id,
    );
  }

  // النشر يحرسه `fn_guard_program_publish` — والاختبار يقيس التسجيل لا الجاهزية.
  await db.query(`set session_replication_role = replica`);
  await db.query(`update public.programs set status = 'published' where id = $1`, [programId]);
  await db.query(`set session_replication_role = origin`);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await clearParticipants();
  await db.query(`delete from public.tracks where program_id = $1`, [programId]);
  await db.query(`delete from public.programs where id = $1`, [programId]);
  await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.end();
});

describe("حدّا العمر لكل مسار", () => {
  it("**الجدول: يظهر أم يُخفى لكل عمرٍ ومسار** — الأعلى شامل، والفارغ بلا حدّ", async () => {
    // [المسارات الخمسة ثم السادس بلا حدّ] لكل عمر.
    const expected: Record<number, boolean[]> = {
      6: [false, false, false, false, false, true],
      7: [true, true, true, true, false, true],
      15: [true, true, true, true, true, true],
      16: [false, true, true, true, true, true],
      18: [false, true, true, true, true, true],
      19: [false, false, true, true, true, true],
    };
    for (const age of AGES) {
      const ids = new Set(await fitting(userOf(age)));
      expect(tracks.map((t) => ids.has(t)), `العمر ${age}`).toEqual(expected[age]);
    }
  });

  it("**حدّ اليوم بتوقيت الرياض**: من يبلغ 16 غداً ما زال 15", async () => {
    const ids = new Set(await fitting(TOMORROW16));
    expect(ids.has(tracks[0]!)).toBe(true);
    expect(ids.has(tracks[4]!)).toBe(true);
  });

  it("بلا تاريخ ميلاد: ما لا حدّ له وحده", async () => {
    expect(await fitting(NOBIRTH)).toEqual([tracks[5]]);
    const { rows } = await db.query<{ a: boolean; b: boolean }>(
      `select public.fn_age_fits(null, null, null) a, public.fn_age_fits(7, null, null) b`,
    );
    expect(rows[0]).toEqual({ a: true, b: false });
  });

  it("**الإدراج المباشر** خارج الحد يُرفض، وداخله يمرّ، وما لا حدّ له يمرّ", async () => {
    const out = await selfInsert(userOf(16), tracks[0]!);
    expect(out.error).toMatch(/عمر المشارك خارج حدّ هذا المسار/);
    expect((await selfInsert(userOf(16), tracks[1]!)).error).toBeNull();
    await clearParticipants();
    expect((await selfInsert(userOf(6), tracks[5]!)).error).toBeNull();
    await clearParticipants();
  });

  it("صفّ غيره يُرفض بالسياسة لا برسالة العمر — فلا يكشف الفرقُ شريحة عمره", async () => {
    const out = await as(
      userOf(19),
      `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3)`,
      [userOf(16), programId, tracks[0]],
    );
    expect(out.error).toMatch(/row-level security/);
    expect(out.error).not.toMatch(/عمر المشارك/);
  });

  it("الرفض بالعمر يسبق «اكتمل العدد» (المشغّل قبل حارس السعة)", async () => {
    const full = (
      await db.query<{ id: string }>(
        `insert into public.tracks (program_id, name, sort_order, min_age, capacity)
         values ($1, 'مسار ممتلئ', 9, 15, 1) returning id`,
        [programId],
      )
    ).rows[0]!.id;
    try {
      expect((await selfInsert(userOf(16), full)).error).toBeNull();
      expect((await selfInsert(userOf(7), full)).error).toMatch(/عمر المشارك خارج حدّ هذا المسار/);
    } finally {
      await clearParticipants();
      await db.query(`delete from public.tracks where id = $1`, [full]);
    }
  });

  it("**fn_register** خارج الحد يُرفض برسالته", async () => {
    const out = await as(userOf(19), `select public.fn_register($1, $2, '{}'::jsonb)`, [programId, tracks[1]]);
    expect(out.error).toMatch(/عمر المشارك خارج حدّ هذا المسار/);
    const ok = await as(userOf(19), `select public.fn_register($1, $2, '{}'::jsonb)`, [programId, tracks[2]]);
    expect(ok.error).toBeNull();
    await clearParticipants();
  });

  it("**الإسناد من فراغ** يُفحص، و**النقل** من مسارٍ إلى مسار لا يُفحص (البند ١١)", async () => {
    const { rows } = await selfInsert(userOf(16), null);
    const pid = rows[0]!.id;
    await expect(db.query(`update public.participants set track_id = $1 where id = $2`, [tracks[0], pid])).rejects.toThrow(
      /عمر المشارك خارج حدّ هذا المسار/,
    );
    await db.query(`update public.participants set track_id = $1 where id = $2`, [tracks[2], pid]);
    // النقل خارج النطاق بقرار الراعي — يثبت هذا الاختبار السلوكَ القائم لا يقرّه.
    await db.query(`update public.participants set track_id = $1 where id = $2`, [tracks[0], pid]);
    const { rows: after } = await db.query<{ track_id: string }>(
      `select track_id from public.participants where id = $1`,
      [pid],
    );
    expect(after[0]!.track_id).toBe(tracks[0]);
    await clearParticipants();
  });

  it("تغيير الحدود بعد التسجيل لا يمسّ المسجَّلين", async () => {
    const { rows } = await selfInsert(userOf(16), tracks[2]!);
    await db.query(`update public.tracks set max_age = 10 where id = $1`, [tracks[2]]);
    const { rows: still } = await db.query(`select 1 from public.participants where id = $1 and deleted_at is null`, [
      rows[0]!.id,
    ]);
    expect(still).toHaveLength(1);
    await db.query(`update public.tracks set max_age = null where id = $1`, [tracks[2]]);
    await clearParticipants();
  });

  it("**المتطلبات**: «لا يتاح لعمرك» حين لا مسار، لا مع حدّ البرنامج، والمحذوف لا يُحسب", async () => {
    expect(await needs(userOf(19))).toEqual([]);
    // دون حدّ البرنامج (7): رسالةٌ واحدة لا اثنتان.
    expect(await needs(userOf(6))).toEqual(["age"]);

    await db.query(`update public.tracks set deleted_at = now() where id = any($1::uuid[])`, [tracks.slice(2)]);
    try {
      expect(await needs(userOf(19))).toEqual(["no_track_for_age"]);
      expect(await needs(userOf(15))).toEqual([]);
      const { rows } = await as<{ b: string[] }>(userOf(19), `select public.fn_registration_blockers($1) b`, [
        programId,
      ]);
      expect(rows[0]!.b).toEqual(["لا يتاح لعمرك أي مسار في هذه المسابقة"]);
      // العمر المجهول لا يُقال له «عمرك» — وحدّ البرنامج يقول سببه.
      expect(await needs(NOBIRTH)).toEqual(["age"]);
    } finally {
      await db.query(`update public.tracks set deleted_at = null where id = any($1::uuid[])`, [tracks.slice(2)]);
    }
  });

  it("قيود الجدول: 1–100، والأدنى لا يزيد على الأعلى", async () => {
    await expect(db.query(`update public.tracks set min_age = 0 where id = $1`, [tracks[5]])).rejects.toThrow();
    await expect(db.query(`update public.tracks set max_age = 101 where id = $1`, [tracks[5]])).rejects.toThrow();
    await expect(
      db.query(`update public.tracks set min_age = 10, max_age = 9 where id = $1`, [tracks[5]]),
    ).rejects.toThrow();
  });
});
