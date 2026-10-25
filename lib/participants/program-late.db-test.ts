import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * قائمة المتأخرين — الهجرة ٠٩٩ (خطة دليل المشارك · الدفعة ب).
 *
 * برنامجٌ يبدأ ١ أكتوبر ٢٠٢٦ كل أيام الأسبوع، وخطة ثلاثين يوماً، والموعد من بداية البرنامج. وتُقرأ
 * القائمة ظهر ١١ أكتوبر: استحقّ عشرة أيام.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let roleId: string;
let planId: string;
const ids: Record<string, string> = {};

const ADMIN = "00000000-0000-4000-8000-000000000991";
const OUTSIDER = "00000000-0000-4000-8000-000000000992";
const KEEPS = "00000000-0000-4000-8000-000000000993";
const HALF = "00000000-0000-4000-8000-000000000994";
const IDLE = "00000000-0000-4000-8000-000000000995";
const ELSEWHERE = "00000000-0000-4000-8000-000000000996";
const USERS = [ADMIN, OUTSIDER, KEEPS, HALF, IDLE, ELSEWHERE];
let otherProgram: string;
let scopedRole: string;
const AT = "2026-10-11T12:00:00+03";

type Row = { full_name: string; phone: string; late_days: number; done_days: number; due_days: number; last_done_at: string | null };

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
const late = (uid: string) =>
  asUser(uid, async () => (await db.query<Row>(`select * from public.fn_program_late($1, $2::timestamptz)`, [programId, AT])).rows);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `program-late-${i}@test.local`,
    ]);
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, $2, $3)`, [
      uid,
      `مشارك ${i}`,
      `+96650009900${i}`,
    ]);
  }
  sectionId = await id(`insert into public.sections (name) values ('قسم المتأخرين') returning id`);
  programId = await id(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج المتأخرين', 'program-late-test') returning id`,
    [sectionId],
  );
  roleId = await id(`insert into public.roles (name) values ('مشرف المتأخرين') returning id`);
  for (const code of ["programs.read", "programs.write", "participants.read"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [roleId, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);
  // مشرفُ برنامجٍ آخر: صلاحيته بنطاق برنامجه — لا يرى جوالات هذا البرنامج.
  otherProgram = await id(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج آخر', 'program-late-other') returning id`,
    [sectionId],
  );
  scopedRole = await id(`insert into public.roles (name) values ('مشرف برنامج آخر') returning id`);
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'participants.read')`, [scopedRole]);
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [ELSEWHERE, scopedRole, otherProgram]);
  await asUser(ADMIN, () =>
    db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [programId, JSON.stringify([{ name: "الإيمان", count: 30 }])]),
  );
  trackId = await id(`insert into public.tracks (program_id, name) values ($1, 'الأول') returning id`, [programId]);
  await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 30)`, [trackId]);
  const hifz = await id(
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
  await db.query(`update public.plan_versions set created_at = '2026-09-20T09:00:00+03' where plan_id = $1`, [planId]);
  for (const [key, value] of [
    ["start_date", "2026-10-01"],
    ["work_days", [0, 1, 2, 3, 4, 5, 6]],
    ["due_from", "program_start"],
  ] as const) {
    await asUser(ADMIN, () =>
      db.query(`select public.fn_set_engine_setting($1, null, $2, $3::jsonb)`, [programId, key, JSON.stringify(value)]),
    );
  }

  for (const [uid, done] of [
    [KEEPS, 10],
    [HALF, 5],
    [IDLE, 0],
  ] as const) {
    ids[uid] = await id(
      `insert into public.participants (user_id, program_id, track_id, status, joined_at, judge_from)
       values ($1, $2, $3, 'registered', '2026-09-25T10:00:00+03', '2026-09-25T10:00:00+03') returning id`,
      [uid, programId, trackId],
    );
    for (let n = 1; n <= done; n++) {
      const date = new Date(Date.UTC(2026, 9, n)).toISOString().slice(0, 10);
      await db.query(
        `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
         values ($1, $2, $3, $4, $5::timestamptz)`,
        [ids[uid], planId, trackId, n, `${date}T20:00:00+03`],
      );
    }
  }
});

afterAll(async () => {
  // الدور المقيّد ببرنامجٍ يُحذف قبل برنامجه — مفتاح النطاق يمنع العكس.
  if (scopedRole) await db.query(`delete from public.user_roles where role_id = $1`, [scopedRole]);
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
    await db.query(`delete from public.track_content_ranges where track_id = $1`, [trackId]);
    await db.query(`delete from public.content_units where program_id = $1`, [programId]);
    await db.query(`delete from public.material_sections where program_id = $1`, [programId]);
    await db.query(`delete from public.calendar_exceptions where program_id = $1`, [programId]);
    await db.query(`delete from public.deadline_history where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = any($1::uuid[])`, [[programId, otherProgram]]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  for (const role of [roleId, scopedRole].filter(Boolean)) {
    await db.query(`delete from public.user_roles where role_id = $1`, [role]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [role]);
    await db.query(`delete from public.roles where id = $1`, [role]);
  }
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("قائمة المتأخرين", () => {
  it("**المتأخرون وحدهم، تنازلياً بالتأخر**، بجوالهم وآخر إتمامهم — والملتزم ليس فيها", async () => {
    const rows = await late(ADMIN);
    expect(rows.map((r) => [r.full_name, r.late_days, r.due_days, r.done_days])).toEqual([
      ["مشارك 4", 10, 10, 0],
      ["مشارك 3", 5, 10, 5],
    ]);
    expect(rows[0]!.phone).toBe("+966500099004");
    expect(rows[0]!.last_done_at).toBeNull();
    expect(rows[1]!.last_done_at).not.toBeNull();
  });

  it("**لغير المشرف لا شيء** — ولا جوال، ولا لمشرف برنامجٍ آخر", async () => {
    await expect(late(OUTSIDER)).rejects.toThrow(/لا صلاحية/);
    await expect(late(ELSEWHERE)).rejects.toThrow(/لا صلاحية/);
  });

  it("**الإتمام المُلغى لا يُحسب**", async () => {
    await db.query(
      `update public.day_completions set undone_at = '2026-10-06T10:00:00+03' where participant_id = $1 and day_number = 5`,
      [ids[HALF]],
    );
    try {
      const half = (await late(ADMIN)).find((r) => r.full_name === "مشارك 3")!;
      expect([half.done_days, half.late_days]).toEqual([4, 6]);
    } finally {
      await db.query(`update public.day_completions set undone_at = null where participant_id = $1 and day_number = 5`, [ids[HALF]]);
    }
  });
});
