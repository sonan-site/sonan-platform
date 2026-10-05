import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * إعدادات المحرّك الموروثة — الهجرة ٠٥٧ (`adr/0038`).
 *
 * الموروث يتبع البرنامج، والمخصّص يحلّ محلّه في مساره وحده، والإرجاع يعيده.
 * ووقت نهاية الرصد بتاريخ سريانه: التغيير لا يسري على ما قبله.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackA: string;
let trackB: string;
let roleId: string;

const ADMIN = "00000000-0000-4000-8000-000000000571";
const OUTSIDER = "00000000-0000-4000-8000-000000000572";
const USERS = [ADMIN, OUTSIDER];

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

const set = (track: string | null, key: string, value: unknown, uid = ADMIN) =>
  asUser(uid, () =>
    db.query(`select public.fn_set_engine_setting($1, $2, $3, $4::jsonb)`, [
      programId,
      track,
      key,
      JSON.stringify(value),
    ]),
  );

type Effective = {
  daily_limit: number;
  work_days: number[];
  exceptions: string[];
  credit_enabled: boolean;
  start_date: string | null;
  progress_measure: string;
};

async function effective(track: string | null): Promise<Effective> {
  const { rows } = await db.query<Effective>(
    `select daily_limit, work_days, exceptions::text[] as exceptions, credit_enabled,
            start_date::text as start_date, progress_measure::text as progress_measure
     from public.fn_engine_settings($1, $2)`,
    [programId, track],
  );
  return rows[0]!;
}

async function deadline(track: string | null, day: string): Promise<string> {
  const { rows } = await db.query<{ v: string }>(`select public.fn_deadline_at($1, $2, $3::date)::text as v`, [
    programId,
    track,
    day,
  ]);
  return rows[0]!.v;
}

async function isProgramDay(track: string | null, day: string): Promise<boolean> {
  const { rows } = await db.query<{ v: boolean }>(`select public.fn_is_program_day($1, $2, $3::date) as v`, [
    programId,
    track,
    day,
  ]);
  return rows[0]!.v;
}

/** تاريخ سريان آخر صفّ بهذا الوقت في النطاق. */
async function effectiveFrom(track: string | null, time: string): Promise<string> {
  const { rows } = await db.query<{ f: string }>(
    `select effective_from::text as f from public.deadline_history
     where program_id = $1 and track_id is not distinct from $2::uuid and deadline = $3::time and deleted_at is null
     order by effective_from desc limit 1`,
    [programId, track, time],
  );
  return rows[0]!.f;
}

async function today(): Promise<string> {
  const { rows } = await db.query<{ d: string }>(`select public.fn_local_now()::date::text as d`);
  return rows[0]!.d;
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `engine-${i}@test.local`],
    );
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الإعدادات', $2)`, [
      uid,
      `+96650005710${i}`,
    ]);
  }
  sectionId = (
    await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم الإعدادات') returning id`)
  ).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug) values ($1, 'برنامج الإعدادات', 'engine-settings-test') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  trackA = (
    await db.query<{ id: string }>(`insert into public.tracks (program_id, name) values ($1, 'أ') returning id`, [
      programId,
    ])
  ).rows[0]!.id;
  trackB = (
    await db.query<{ id: string }>(`insert into public.tracks (program_id, name) values ($1, 'ب') returning id`, [
      programId,
    ])
  ).rows[0]!.id;
  roleId = (
    await db.query<{ id: string }>(`insert into public.roles (name) values ('دور الإعدادات') returning id`)
  ).rows[0]!.id;
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [roleId, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
    await db.query(`delete from public.calendar_exceptions where program_id = $1`, [programId]);
    await db.query(`delete from public.deadline_history where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
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

describe("الوراثة والتخصيص", () => {
  it("المسار يرث قيم البرنامج الافتراضية", async () => {
    const s = await effective(trackA);
    expect(s.daily_limit).toBe(2);
    expect(s.credit_enabled).toBe(true);
    expect(s.work_days).toEqual([0, 1, 2, 3, 4, 6]);
  });

  it("**تغيير البرنامج يسري على الموروث، ولا يمسّ المخصّص**", async () => {
    await set(null, "daily_limit", 3);
    expect((await effective(trackA)).daily_limit).toBe(3);

    await asUser(ADMIN, () => db.query(`select public.fn_customize_engine_setting($1, 'daily_limit')`, [trackA]));
    await set(trackA, "daily_limit", 5);
    await set(null, "daily_limit", 4);
    expect((await effective(trackA)).daily_limit).toBe(5);
    expect((await effective(trackB)).daily_limit).toBe(4);

    await asUser(ADMIN, () => db.query(`select public.fn_inherit_engine_setting($1, 'daily_limit')`, [trackA]));
    expect((await effective(trackA)).daily_limit).toBe(4);
  });

  it("أيام العمل: يومٌ واحد على الأقل، وأرقامها ٠–٦", async () => {
    await set(null, "work_days", [0, 1, 2, 3, 4]);
    expect((await effective(trackA)).work_days).toEqual([0, 1, 2, 3, 4]);
    await expect(set(null, "work_days", [])).rejects.toThrow(/يوم عمل واحد/);
    await expect(set(null, "work_days", [7])).rejects.toThrow(/يوم عمل واحد/);
  });

  it("**القائمة الفارغة تخصيصٌ لا غياب** — وكتابتها على مسار تشترط تخصيصها", async () => {
    await set(null, "exceptions", ["2026-12-01", "2026-12-02"]);
    await expect(set(trackB, "exceptions", [])).rejects.toThrow(/خصّص أيام التوقف/);
    await asUser(ADMIN, () => db.query(`select public.fn_customize_engine_setting($1, 'exceptions')`, [trackB]));
    expect((await effective(trackB)).exceptions).toHaveLength(2);
    await set(trackB, "exceptions", []);
    expect((await effective(trackA)).exceptions).toHaveLength(2);
    expect((await effective(trackB)).exceptions).toHaveLength(0);
    expect(await isProgramDay(trackA, "2026-12-01")).toBe(false);
    expect(await isProgramDay(trackB, "2026-12-01")).toBe(true);
    // الجمعة ليست يوم عمل، والأحد يوم عمل.
    expect(await isProgramDay(trackA, "2026-12-04")).toBe(false);
    expect(await isProgramDay(trackA, "2026-12-06")).toBe(true);
  });
});

describe("وقت نهاية الرصد بتاريخ سريانه", () => {
  it("بلا سجلّ: ٢٣:٠٠", async () => {
    expect(await deadline(trackA, "2026-10-01")).toBe("23:00:00");
  });

  it("**التغيير لا يمسّ ما قبله**، ويسري من اليوم ما لم يمضِ وقته", async () => {
    const day = await today();
    await set(null, "deadline", "22:00");
    const from = await effectiveFrom(null, "22:00");
    expect(from >= day).toBe(true);
    expect(await deadline(trackA, "2026-01-01")).toBe("23:00:00");
    expect(await deadline(trackA, from)).toBe("22:00:00");

    // وقتٌ مضى اليوم لا يسري إلا من الغد.
    await set(null, "deadline", "00:01");
    expect((await effectiveFrom(null, "00:01")) > day).toBe(true);

    await set(null, "deadline", "21:30");
    const { rows } = await db.query<{ c: number }>(
      `select count(*)::int as c from public.deadline_history
       where program_id = $1 and track_id is null and deleted_at is null`,
      [programId],
    );
    expect(rows[0]!.c).toBeGreaterThanOrEqual(2);
    expect(await deadline(trackA, await effectiveFrom(null, "21:30"))).toBe("21:30:00");
  });

  it("المسار المخصّص يحمل السجلّ معه", async () => {
    await expect(set(trackB, "deadline", "20:00")).rejects.toThrow(/خصّص وقت نهاية الرصد/);
    await asUser(ADMIN, () => db.query(`select public.fn_customize_engine_setting($1, 'deadline')`, [trackB]));
    await set(trackB, "deadline", "20:00");
    const from = await effectiveFrom(trackB, "20:00");
    expect(await deadline(trackB, from)).toBe("20:00:00");
    expect(await deadline(trackA, from)).not.toBe("20:00:00");
    expect(await deadline(trackB, "2026-01-01")).toBe("23:00:00");
    await expect(set(null, "deadline", "25:00")).rejects.toThrow(/ساعة ودقيقة/);
  });
});

describe("تاريخ البداية", () => {
  it("**يُخصَّص لمسار ولو غاب عن البرنامج**، ويرجع موروثاً", async () => {
    await asUser(ADMIN, () => db.query(`select public.fn_customize_engine_setting($1, 'start_date')`, [trackA]));
    await set(trackA, "start_date", "2026-11-05");
    await set(null, "start_date", "2026-12-01");
    expect((await effective(trackA)).start_date).toBe("2026-11-05");
    expect((await effective(trackB)).start_date).toBe("2026-12-01");
    await asUser(ADMIN, () => db.query(`select public.fn_inherit_engine_setting($1, 'start_date')`, [trackA]));
    expect((await effective(trackA)).start_date).toBe("2026-12-01");
    await set(null, "start_date", null);
  });
});

describe("المدخل الواحد", () => {
  it("قارئات الإعدادات داخلية — لا يقرأ مستخدمٌ إعدادات برنامجٍ بمعرّفه", async () => {
    await expect(
      asUser(OUTSIDER, () => db.query(`select * from public.fn_engine_settings($1, null)`, [programId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("بقية المفاتيح", async () => {
    await set(null, "start_date", "2026-11-01");
    expect((await effective(trackA)).start_date).toBe("2026-11-01");
    await set(null, "start_date", null);
    expect((await effective(trackA)).start_date).toBeNull();
    await set(null, "progress_measure", "days");
    expect((await effective(trackA)).progress_measure).toBe("days");
    await set(null, "credit_enabled", false);
    expect((await effective(trackA)).credit_enabled).toBe(false);
    await expect(set(null, "nonsense", 1)).rejects.toThrow(/إعداد غير معروف/);
  });

  it("**الكتابة المباشرة ممنوعة**، وتعديل بقية البرنامج مفتوح", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`update public.programs set daily_limit = 9 where id = $1`, [programId])),
    ).rejects.toThrow(/تُكتب من شاشتها/);
    await expect(
      asUser(ADMIN, () => db.query(`update public.tracks set daily_limit = 9 where id = $1`, [trackA])),
    ).rejects.toThrow(/تُكتب من شاشتها/);
    const { rowCount } = await asUser(ADMIN, () =>
      db.query(`update public.programs set name = 'برنامج الإعدادات ٢' where id = $1`, [programId]),
    );
    expect(rowCount).toBe(1);
  });

  it("من لا يملك الكتابة يُرفض", async () => {
    await expect(set(null, "daily_limit", 3, OUTSIDER)).rejects.toThrow(/لا صلاحية/);
  });
});
