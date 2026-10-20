import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * بداية احتساب الموعد — الهجرة ٠٩٦ (خطة المدة الثلاثينية · ش١).
 *
 * برنامجٌ يبدأ السبت ٣١ أكتوبر ٢٠٢٦، كل أيام الأسبوع، وخطة ثلاثين يوماً. المسار «أ» يحسب الموعد
 * **من بداية البرنامج**، والمسار «ب» مخصّصٌ على **يوم التحاق المشارك** (السلوك القائم).
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackA: string;
let trackB: string;
let roleId: string;
let planId: string;
let hifz: string;
let onTime: string;
let lateA: string;
let lateB: string;

const ADMIN = "00000000-0000-4000-8000-000000000961";
const ON_TIME = "00000000-0000-4000-8000-000000000962";
const LATE_A = "00000000-0000-4000-8000-000000000963";
const LATE_B = "00000000-0000-4000-8000-000000000964";
const USERS = [ADMIN, ON_TIME, LATE_A, LATE_B];

type State = { state: string; due_days: number; done_days: number; expected_day: number; start_date: string };

async function asUser<T>(uid: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

const id = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
const stateAt = async (pid: string, ts: string) =>
  (await db.query<{ s: State }>(`select public.fn_journey_state_at($1, $2::timestamptz) s`, [pid, ts])).rows[0]!.s;
const archive = async (pid: string) =>
  (
    await db.query<{ d: string; status: string }>(
      `select calendar_date::text d, status::text from public.commitment_archive where participant_id = $1 and deleted_at is null order by 1`,
      [pid],
    )
  ).rows;
const setting = (track: string | null, key: string, value: unknown) =>
  asUser(ADMIN, () =>
    db.query(`select public.fn_set_engine_setting($1, $2, $3, $4::jsonb)`, [programId, track, key, JSON.stringify(value)]),
  );

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `due-from-${i}@test.local`,
    ]);
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الموعد', $2)`, [
      uid,
      `+96650009610${i}`,
    ]);
  }
  sectionId = await id(`insert into public.sections (name) values ('قسم الموعد') returning id`);
  programId = await id(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج الموعد', 'due-from-test') returning id`,
    [sectionId],
  );
  roleId = await id(`insert into public.roles (name) values ('دور الموعد') returning id`);
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [roleId, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);
  await asUser(ADMIN, () =>
    db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [programId, JSON.stringify([{ name: "الإيمان", count: 30 }])]),
  );
  trackA = await id(`insert into public.tracks (program_id, name) values ($1, 'أ') returning id`, [programId]);
  trackB = await id(`insert into public.tracks (program_id, name) values ($1, 'ب') returning id`, [programId]);
  for (const t of [trackA, trackB]) {
    await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 30)`, [t]);
  }
  hifz = await id(
    `insert into public.task_fields (program_id, label, kind, is_base) values ($1, 'حفظ', 'ranged', true) returning id`,
    [programId],
  );
  planId = (
    await asUser(ADMIN, () => db.query<{ id: string }>(`select public.fn_create_plan($1, null, false) id`, [programId]))
  ).rows[0]!.id;
  const values = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, field_id: hifz, amount: 1 }));
  await asUser(ADMIN, () =>
    db.query(`select public.fn_save_plan($1, $2::jsonb, 'اختبار')`, [planId, JSON.stringify({ day_count: 30, values })]),
  );
  await db.query(`update public.plan_versions set created_at = '2026-10-01T09:00:00+03' where plan_id = $1`, [planId]);

  await setting(null, "start_date", "2026-10-31");
  await setting(null, "work_days", [0, 1, 2, 3, 4, 5, 6]);
  await setting(null, "due_from", "program_start");
  // المسار «ب» يُبقي السلوك القائم.
  await asUser(ADMIN, () => db.query(`select public.fn_customize_engine_setting($1, 'due_from')`, [trackB]));
  await setting(trackB, "due_from", "join");

  const join = (uid: string, track: string, at: string) =>
    id(
      `insert into public.participants (user_id, program_id, track_id, status, joined_at, judge_from)
       values ($1, $2, $3, 'registered', $4, $4) returning id`,
      [uid, programId, track, at],
    );
  onTime = await join(ON_TIME, trackA, "2026-10-25T10:00:00+03");
  lateA = await join(LATE_A, trackA, "2026-11-14T10:00:00+03");
  lateB = await join(LATE_B, trackB, "2026-11-14T10:00:00+03");

  // التزم يوماً بيوم: اليوم n في تاريخه (٣١ أكتوبر + n − 1) مساءً — عشرة أيام.
  for (let n = 1; n <= 10; n++) {
    const date = new Date(Date.UTC(2026, 9, 31 + n - 1)).toISOString().slice(0, 10);
    await db.query(
      `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
       values ($1, $2, $3, $4, $5::timestamptz)`,
      [onTime, planId, trackA, n, `${date}T20:00:00+03`],
    );
  }
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
    for (const table of ["commitment_archive", "field_marks", "field_counts", "day_openings", "day_completions"]) {
      await db.query(
        `delete from public.${table} where participant_id in (select id from public.participants where program_id = $1)`,
        [programId],
      );
    }
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    for (const table of ["plan_versions", "plan_values"]) {
      await db.query(`delete from public.${table} where plan_id in (select id from public.plans where program_id = $1)`, [programId]);
    }
    await db.query(`delete from public.plans where program_id = $1`, [programId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.track_content_ranges where track_id in ($1, $2)`, [trackA, trackB]);
    await db.query(`delete from public.content_units where program_id = $1`, [programId]);
    await db.query(`delete from public.material_sections where program_id = $1`, [programId]);
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

describe("بداية احتساب الموعد · من بداية البرنامج", () => {
  it("**التحق قبل البداية والتزم يوماً بيوم** ← يوم ١٠ نوفمبر لا تأخر", async () => {
    const s = await stateAt(onTime, "2026-11-10T12:00:00+03");
    expect(s.start_date).toBe("2026-10-31");
    expect(s.done_days).toBe(10);
    expect(s.due_days).toBe(10);
  });

  it("**التحق ١٤ نوفمبر ولم يُتم** ← يومها متأخر ١٤ يوماً، واليوم نفسه لا يُحتسب قبل وقته", async () => {
    const s = await stateAt(lateA, "2026-11-14T12:00:00+03");
    expect(s.state).not.toBe("not_started");
    expect(s.start_date).toBe("2026-10-31");
    expect(s.done_days).toBe(0);
    expect(s.due_days).toBe(14);
  });

  it("**يومه الأول في الحكم يُرجَع للواجهة** — فما قبله «قبل بدايتك» لا «لم يُحكم عليه»", async () => {
    const s = (await stateAt(lateA, "2026-11-14T12:00:00+03")) as State & { judge_start: string };
    expect(s.judge_start).toBe("2026-11-14");
  });

  it("**أرشيفه بلا يومٍ قبل التحاقه** — والأيام بعده تُحكم كالعادة", async () => {
    await db.query(`select public.fn_settle_commitment_at($1, $2::timestamptz)`, [lateA, "2026-11-16T12:00:00+03"]);
    expect((await archive(lateA)).map((r) => r.d)).toEqual(["2026-11-14", "2026-11-15"]);
  });

  it("**الملتزم يوماً بيوم** ← أرشيفه كله «أتمّ» بلا تعثّر", async () => {
    await db.query(`select public.fn_settle_commitment_at($1, $2::timestamptz)`, [onTime, "2026-11-10T12:00:00+03"]);
    const rows = await archive(onTime);
    expect(rows.map((r) => r.d)).toEqual(Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10)));
    expect(rows.every((r) => r.status === "completed")).toBe(true);
  });
});

describe("بداية احتساب الموعد · الحدود", () => {
  it("**لا موعد قبل أن تكون للمسار خطة**: خطةٌ حُفظت أولاً بعد البداية تُبدئ الموعد من يومها", async () => {
    await db.query(`update public.plan_versions set created_at = '2026-11-05T09:00:00+03' where plan_id = $1`, [planId]);
    try {
      const s = await stateAt(lateA, "2026-11-14T12:00:00+03");
      expect(s.start_date).toBe("2026-11-05");
      expect(s.due_days).toBe(9);
    } finally {
      await db.query(`update public.plan_versions set created_at = '2026-10-01T09:00:00+03' where plan_id = $1`, [planId]);
    }
  });

  it("**بلا تاريخ بداية** يرجع إلى يوم الالتحاق", async () => {
    await db.query("begin");
    try {
      await db.query(`select set_config('app.engine_settings', 'on', true)`);
      await db.query(`update public.programs set start_date = null where id = $1`, [programId]);
      const s = await stateAt(lateA, "2026-11-14T12:00:00+03");
      expect(s.start_date).toBe("2026-11-14");
      expect(s.due_days).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });

  it("**الإرجاع إلى الموروث** يعيد المسار «ب» إلى بداية البرنامج", async () => {
    await asUser(ADMIN, () => db.query(`select public.fn_inherit_engine_setting($1, 'due_from')`, [trackB]));
    try {
      const s = await stateAt(lateB, "2026-11-14T12:00:00+03");
      expect(s.start_date).toBe("2026-10-31");
      expect(s.due_days).toBe(14);
    } finally {
      await asUser(ADMIN, () => db.query(`select public.fn_customize_engine_setting($1, 'due_from')`, [trackB]));
      await setting(trackB, "due_from", "join");
    }
  });
});

describe("بداية احتساب الموعد · من يوم الالتحاق (القائم)", () => {
  it("**المسار المخصّص على الالتحاق** ← الملتحق ١٤ نوفمبر لا تأخر عليه يومها", async () => {
    const s = await stateAt(lateB, "2026-11-14T12:00:00+03");
    expect(s.start_date).toBe("2026-11-14");
    expect(s.due_days).toBe(0);
  });

  it("الإعداد يُرفض بقيمةٍ غير معروفة", async () => {
    await expect(setting(null, "due_from", "tomorrow")).rejects.toThrow(/بداية احتساب الموعد/);
  });

  it("الإعداد لا يُكتب مباشرة — من شاشته وحدها", async () => {
    await expect(db.query(`update public.programs set due_from = 'join' where id = $1`, [programId])).rejects.toThrow(
      /تُكتب من شاشتها/,
    );
  });
});
