import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * إحصاءات النشاط (adr/0061): التسجيل عن صاحبه وحده · «الداخل» من الجلسة · الموقوف لا يُعدّ · النطاق في
 * القاعدة · المدخلات المغلقة · العدّ المميّز بالفئة والبرنامج والمسار بتوقيت الرياض · التجميع بعد ٦٠ يوماً
 * يطابق الحيّ ويتكرّر آمناً · المحو المتتالي.
 *
 * **كله في معاملةٍ تُلغى** (مراجعة م٥): `test:db` على القاعدة الحيّة، وما يُكتب في `activity_counts` بلا
 * هوية فلا يُنظَّف. والأيام المختبرة من ٢٠٢٥ — قبل تشغيل الميزة، فلا يختلط بها نشاطٌ حقيقي.
 */

let db: Client;
const GLOBAL = "00000000-0000-4000-8000-000000000c01";
const SCOPED = "00000000-0000-4000-8000-000000000c02";
const NOBODY = "00000000-0000-4000-8000-000000000c03";
const U1 = "00000000-0000-4000-8000-000000000c04"; // طالب: البرنامج أ، المسار أ١
const U2 = "00000000-0000-4000-8000-000000000c05"; // طالب: أ (المسار أ٢) وب
const U3 = "00000000-0000-4000-8000-000000000c06"; // فريق
const U4 = "00000000-0000-4000-8000-000000000c07"; // لا مشاركة ولا دور
const SUSPENDED = "00000000-0000-4000-8000-000000000c08";
const PURGED = "00000000-0000-4000-8000-000000000c09";
const USERS = [GLOBAL, SCOPED, NOBODY, U1, U2, U3, U4, SUSPENDED, PURGED];
const FRESH_SESSION = "00000000-0000-4000-8000-0000000000d1";
const OLD_SESSION = "00000000-0000-4000-8000-0000000000d2";

// الإثنين ١٠ مارس ٢٠٢٥ بالرياض: ٩ ص = ٠٦:٠٠ UTC، و١٠ ص = ٠٧:٠٠ UTC.
const DAY = "2025-03-10";
const H9 = "2025-03-10T06:00:00Z";
const H10 = "2025-03-10T07:00:00Z";

let programA: string;
let programB: string;
let trackA1: string;
let trackB: string;

async function as<T = Record<string, unknown>>(
  uid: string | null,
  sql: string,
  params: unknown[] = [],
  claims: Record<string, unknown> = {},
): Promise<{ rows: T[]; error: string | null; code: string | null }> {
  const role = uid ? "authenticated" : "anon";
  await db.query("savepoint s");
  try {
    await db.query(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(uid ? { sub: uid, role, ...claims } : { role }),
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

type Row = { period_start: Date; active: number; signed_in: number };
const stats = (
  uid: string,
  bucket: string,
  audience: string,
  program: string | null = null,
  track: string | null = null,
  from = DAY,
  to = DAY,
) =>
  as<Row>(uid, `select * from public.fn_activity_stats($1::date, $2::date, $3, $4, $5, $6)`, [
    from,
    to,
    bucket,
    audience,
    program,
    track,
  ]);
/** أعداد الفترات غير الصفرية — «بداية الفترة بالرياض: نشطون/داخلون». */
const nonzero = (rows: Row[]) =>
  rows
    .filter((r) => r.active > 0)
    .map((r) => `${new Date(r.period_start.getTime() + 3 * 3_600_000).toISOString().slice(11, 16)}:${r.active}/${r.signed_in}`);

async function grant(uid: string, name: string, codes: string[], scope: string | null = null) {
  const role = (await one(`insert into public.roles (name) values ($1) returning id`, [name])).id;
  for (const code of codes) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [role, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [uid, role, scope]);
}

const hourRow = (uid: string, hour: string, signedIn = false) =>
  db.query(`insert into public.activity_hours (user_id, hour, signed_in) values ($1, $2, $3)`, [uid, hour, signedIn]);

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  await db.query("begin");
  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `activity-${i}@test.local`,
    ]);
    // الصلاحية تشترط ملفاً قائماً (`fn_has_permission`).
    await db.query(
      `insert into public.profiles (user_id, full_name, first_name, father_name, grandfather_name, family_name, gender,
                                    birth_date, nationality, phone)
       values ($1, $2, 'سالم', 'محمد', 'علي', 'التجربة', 'male', '2012-03-01', 'SA', $3)`,
      [uid, `حساب ${i}`, `+96650000081${i}`],
    );
  }
  await db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [SUSPENDED]);

  const section = (await one(`insert into public.sections (name) values ('قسم الإحصاءات') returning id`)).id;
  const program = async (slug: string) =>
    (await one(`insert into public.programs (section_id, name, slug) values ($1, $2, $2) returning id`, [section, slug])).id;
  const track = async (p: string, name: string) =>
    (await one(`insert into public.tracks (program_id, name) values ($1, $2) returning id`, [p, name])).id;
  programA = await program("zz-activity-a");
  programB = await program("zz-activity-b");
  trackA1 = await track(programA, "أ١");
  const trackA2 = await track(programA, "أ٢");
  trackB = await track(programB, "ب");
  const join = (uid: string, p: string, t: string) =>
    db.query(`insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3)`, [uid, p, t]);
  await join(U1, programA, trackA1);
  await join(U2, programA, trackA2);
  await join(U2, programB, trackB);

  await grant(GLOBAL, "إحصاءات عامة", ["stats.read"]);
  await grant(SCOPED, "إحصاءات برنامج", ["stats.read"], programA);
  await grant(U3, "فريق تجريبي", ["exams.judge"]);

  await db.query(
    `insert into auth.sessions (id, user_id, created_at, updated_at) values
       ($1, $3, now() - interval '30 minutes', now()),
       ($2, $3, now() - interval '5 hours', now())`,
    [FRESH_SESSION, OLD_SESSION, NOBODY],
  );

  // ٩ ص: الأربعة (الثاني داخل) · ١٠ ص: الأول وحده داخلاً.
  for (const uid of [U1, U3, U4]) await hourRow(uid, H9);
  await hourRow(U2, H9, true);
  await hourRow(U1, H10, true);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("التسجيل", () => {
  const mine = async (uid: string) =>
    (await one(`select count(*)::int n, bool_or(signed_in) s from public.activity_hours where user_id = $1`, [uid])) as {
      n: number;
      s: boolean | null;
    };

  it("**يكتب ساعة صاحبه مرّةً — والتكرار لا يضاعفها**", async () => {
    expect((await as(NOBODY, `select public.fn_activity_touch()`)).error).toBeNull();
    expect((await as(NOBODY, `select public.fn_activity_touch()`)).error).toBeNull();
    const r = await one(
      `select count(*)::int n from public.activity_hours where user_id = $1 and hour = date_trunc('hour', now(), 'UTC')`,
      [NOBODY],
    );
    expect(r.n).toBe(1);
  });

  it("**«الداخل» من بدء الجلسة: الحديثة تُعلَّم، والقديمة لا**", async () => {
    await db.query(`delete from public.activity_hours where user_id = $1`, [NOBODY]);
    await as(NOBODY, `select public.fn_activity_touch()`, [], { session_id: OLD_SESSION });
    expect((await mine(NOBODY)).s).toBe(false);

    await as(NOBODY, `select public.fn_activity_touch()`, [], { session_id: FRESH_SESSION });
    const flagged = await one(
      `select signed_in from public.activity_hours where user_id = $1 and hour = date_trunc('hour', now() - interval '30 minutes', 'UTC')`,
      [NOBODY],
    );
    expect(flagged.signed_in).toBe(true);
  });

  it("جلسةٌ لغيره أو معرّفٌ تالف لا تُعلِّم", async () => {
    await as(U4, `select public.fn_activity_touch()`, [], { session_id: FRESH_SESSION });
    await as(U4, `select public.fn_activity_touch()`, [], { session_id: "ليس-معرّفاً" });
    const r = await one(
      `select bool_or(signed_in) s from public.activity_hours where user_id = $1 and hour > now() - interval '1 day'`,
      [U4],
    );
    expect(r.s).toBe(false);
  });

  it("**الموقوف لا يُعدّ، والزائر لا يصل**", async () => {
    await as(SUSPENDED, `select public.fn_activity_touch()`);
    expect((await mine(SUSPENDED)).n).toBe(0);
    expect((await as(null, `select public.fn_activity_touch()`)).code).toBe("42501");
  });

  it("**لا منفذ مباشر:** الجدولان لا يُقرآن ولا يُكتبان من العميل", async () => {
    expect((await as(GLOBAL, `select count(*)::int n from public.activity_hours`)).rows[0]).toEqual({ n: 0 });
    expect((await as(GLOBAL, `select count(*)::int n from public.activity_counts`)).rows[0]).toEqual({ n: 0 });
    const write = await as(U1, `insert into public.activity_hours (user_id, hour) values ($1, date_trunc('hour', now()))`, [U1]);
    expect(write.code).toBe("42501");
    // ولا تجميع من خارج المجدوِل.
    expect((await as(GLOBAL, `select public.fn_activity_rollup()`)).code).toBe("42501");
  });
});

describe("النطاق", () => {
  it("**العام يرى الكل**", async () => {
    expect((await stats(GLOBAL, "day", "all")).error).toBeNull();
    expect((await stats(GLOBAL, "day", "staff")).error).toBeNull();
    expect((await stats(GLOBAL, "day", "student", programB)).error).toBeNull();
  });

  it("**المحصور: طلاب برنامجه وحدهم**", async () => {
    expect((await stats(SCOPED, "day", "student", programA)).error).toBeNull();
    expect((await stats(SCOPED, "day", "student", programA, trackA1)).error).toBeNull();
    expect((await stats(SCOPED, "day", "student", programB)).code).toBe("42501");
    expect((await stats(SCOPED, "day", "student")).code).toBe("42501");
    expect((await stats(SCOPED, "day", "all")).code).toBe("42501");
    expect((await stats(SCOPED, "day", "staff")).code).toBe("42501");
  });

  it("من لا صلاحية له لا يرى شيئاً — والخريطة بالنطاق نفسه", async () => {
    expect((await stats(NOBODY, "day", "all")).code).toBe("42501");
    const heat = await as(SCOPED, `select * from public.fn_activity_heatmap($1::date, $1::date, 'all')`, [DAY]);
    expect(heat.code).toBe("42501");
  });
});

describe("المدخلات", () => {
  it("**قوائم مغلقة ومدى محدود** (23514)", async () => {
    expect((await stats(GLOBAL, "week", "all")).code).toBe("23514");
    expect((await stats(GLOBAL, "day", "everyone")).code).toBe("23514");
    expect((await stats(GLOBAL, "day", "all", null, null, "2025-03-11", "2025-03-10")).code).toBe("23514");
    expect((await stats(GLOBAL, "day", "all", null, null, "2024-03-01", "2025-03-10")).code).toBe("23514");
  });

  it("**البرنامج للطلاب وحدهم، والمسار من برنامجه**", async () => {
    expect((await stats(GLOBAL, "day", "staff", programA)).code).toBe("23514");
    expect((await stats(GLOBAL, "day", "student", null, trackA1)).code).toBe("23514");
    expect((await stats(GLOBAL, "day", "student", programB, trackA1)).code).toBe("23514");
  });
});

/** ما يُنتظر للحيّ وللمجمَّع معاً — فالتجميع يُختبر بمطابقته الحيَّ. */
async function expectCounts() {
  // الكل: الأربعة في ٩، والأول في ١٠ — واليوم أربعة مميّزون، داخلاهم الثاني والأول.
  expect(nonzero((await stats(GLOBAL, "hour", "all")).rows)).toEqual(["09:00:4/1", "10:00:1/1"]);
  expect(nonzero((await stats(GLOBAL, "6h", "all")).rows)).toEqual(["06:00:4/2"]);
  expect(nonzero((await stats(GLOBAL, "day", "all")).rows)).toEqual(["00:00:4/2"]);
  // الفريق والطلاب — والثاني في برنامجين يُعدّ مرّةً في إجمالي الطلاب.
  expect(nonzero((await stats(GLOBAL, "day", "staff")).rows)).toEqual(["00:00:1/0"]);
  expect(nonzero((await stats(GLOBAL, "day", "student")).rows)).toEqual(["00:00:2/2"]);
  expect(nonzero((await stats(GLOBAL, "3h", "student", programA)).rows)).toEqual(["09:00:2/2"]);
  expect(nonzero((await stats(GLOBAL, "day", "student", programB)).rows)).toEqual(["00:00:1/1"]);
  expect(nonzero((await stats(GLOBAL, "hour", "student", programA, trackA1)).rows)).toEqual(["09:00:1/0", "10:00:1/1"]);
  expect(nonzero((await stats(GLOBAL, "day", "student", programB, trackB)).rows)).toEqual(["00:00:1/1"]);
  // والمحصور يرى برنامجه بالأعداد نفسها.
  expect(nonzero((await stats(SCOPED, "day", "student", programA)).rows)).toEqual(["00:00:2/2"]);
}

describe("العدّ بتوقيت الرياض", () => {
  it("**الفترات الفارغة صفرٌ لا تختفي**", async () => {
    const r = await stats(GLOBAL, "day", "all", null, null, DAY, "2025-03-12");
    expect(r.rows.map((x) => x.active)).toEqual([4, 0, 0]);
    expect((await stats(GLOBAL, "hour", "all")).rows).toHaveLength(24);
    expect((await stats(GLOBAL, "6h", "all")).rows).toHaveLength(4);
  });

  it("**عددٌ مميّز بالفئة والبرنامج والمسار**", expectCounts);

  it("الخريطة: متوسط يوم الأسبوع والساعة (الإثنين = ١)", async () => {
    const r = await as<{ weekday: number; hour: number; average: string }>(
      GLOBAL,
      `select * from public.fn_activity_heatmap($1::date, $1::date, 'all') where average > 0`,
      [DAY],
    );
    expect(r.rows.map((c) => `${c.weekday}:${c.hour}:${Number(c.average)}`)).toEqual(["1:9:4", "1:10:1"]);
  });

  it("**محو الحساب يمحو ساعاته**", async () => {
    await hourRow(PURGED, "2025-04-01T06:00:00Z");
    // كما يفعل `fn_purge_account` في آخره: الملف ثم حساب الدخول.
    await db.query(`delete from public.profiles where user_id = $1`, [PURGED]);
    await db.query(`delete from auth.users where id = $1`, [PURGED]);
    expect((await one(`select count(*)::int n from public.activity_hours where user_id = $1`, [PURGED])).n).toBe(0);
  });
});

describe("التجميع بعد ٦٠ يوماً", () => {
  it("**يُجمِّع ثم يحذف — والأعداد تطابق الحيّ**", async () => {
    const before = await one(`select count(*)::int n from public.activity_hours where hour < $1`, ["2025-03-11T00:00:00Z"]);
    expect(before.n).toBe(5);
    const deleted = (await one(`select public.fn_activity_rollup() n`)).n;
    expect(deleted).toBeGreaterThanOrEqual(5);
    expect((await one(`select count(*)::int n from public.activity_hours where hour < $1`, ["2025-03-11T00:00:00Z"])).n).toBe(0);
    await expectCounts();
  });

  it("**بلا هوية، وبالمستوى الصريح**", async () => {
    const levels = await db.query(
      `select audience, level, count(*)::int n from public.activity_counts
        where period_start >= $1 and period_start < $2 and bucket = 'day'
          and (program_id is null or program_id in ($3, $4))
        group by 1, 2 order by 1, 2`,
      ["2025-03-09T21:00:00Z", "2025-03-10T21:00:00Z", programA, programB],
    );
    expect(levels.rows).toEqual([
      { audience: "all", level: "total", n: 1 },
      { audience: "staff", level: "total", n: 1 },
      { audience: "student", level: "program", n: 2 },
      { audience: "student", level: "total", n: 1 },
      { audience: "student", level: "track", n: 3 },
    ]);
  });

  it("**التكرار آمن**: لا يُجمَّع شيءٌ مرّتين", async () => {
    const count = async () => (await one(`select count(*)::int n from public.activity_counts`)).n;
    const n = await count();
    expect((await one(`select public.fn_activity_rollup() n`)).n).toBe(0);
    expect(await count()).toBe(n);
    await expectCounts();
  });
});
