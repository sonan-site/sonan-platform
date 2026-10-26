import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * حمل التقدّم عند النقل — ش٢ (`docs/reviews/2026-10-26-خطة-حمل-التقدم-عند-النقل.md`).
 *
 * القبول يقع **الآن** (`now()` في `fn_decide_track_change`)، فالتواريخ نسبيةٌ إليه: البرنامج بدأ
 * قبل ١٥ يوماً، كل أيام الأسبوع، والموعد من بداية البرنامج. المادة ٦٠ وحدة، ومساراتها بادئات:
 * S [١..٢٠] بخطة ٥ أيام · M [١..٤٠] بعشرة · L [١..٦٠] بخمسة عشر · X [١..٤٠] بعشرة — كل يومٍ ٤ وحدات.
 */

let db: Client;
let sectionId: string;
let programId: string;
let roleId: string;
let hifz: string;
const track = { S: "", M: "", L: "", X: "", O: "" };
const plan = { S: "", M: "", L: "", X: "", O: "" };
let startDate: string;

const ADMIN = "00000000-0000-4000-8000-000000000a71";
const P1 = "00000000-0000-4000-8000-000000000a72";
const P3 = "00000000-0000-4000-8000-000000000a73";
const P4 = "00000000-0000-4000-8000-000000000a74";
const P5 = "00000000-0000-4000-8000-000000000a75";
const P6 = "00000000-0000-4000-8000-000000000a76";
const USERS = [ADMIN, P1, P3, P4, P5, P6];
const pid = { P1: "", P3: "", P4: "", P5: "", P6: "" };

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
const setting = (key: string, value: unknown) =>
  asUser(ADMIN, () => db.query(`select public.fn_set_engine_setting($1, null, $2, $3::jsonb)`, [programId, key, JSON.stringify(value)]));

/** يومٌ مكتمل في الماضي: اليوم n قبل (١٥ − n) يوماً مساءً. */
async function completed(participant: string, key: keyof typeof track, days: number) {
  for (let n = 1; n <= days; n++) {
    await db.query(
      `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
       values ($1, $2, $3, $4, now() - make_interval(days => 15 - $4) - interval '2 hours')`,
      [participant, plan[key], track[key], n],
    );
  }
}

async function transfer(participant: string, from: keyof typeof track, to: keyof typeof track) {
  const req = await id(
    `insert into public.track_change_requests (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage)
     values ($1, $2, $3, 'down', 'سبب الاختبار', 0) returning id`,
    [participant, track[from], track[to]],
  );
  await asUser(ADMIN, () => db.query(`select public.fn_decide_track_change($1, $2, 'approved')`, [req, programId]));
}

const credit = async (participant: string) =>
  (await db.query<{ u: number | null; at: string | null }>(`select credited_units u, credited_at at from public.participants where id = $1`, [participant]))
    .rows[0]!;
const state = async (participant: string) =>
  (
    await db.query<{ s: { done_days: number; credited_days: number; current_day: number; start_date: string; state: string } }>(
      `select public.fn_journey_state_at($1, now() + interval '1 minute') s`,
      [participant],
    )
  ).rows[0]!.s;

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [uid, `carry-${i}@test.local`]);
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الحمل', $2)`, [uid, `+96650009710${i}`]);
  }
  sectionId = await id(`insert into public.sections (name) values ('قسم الحمل') returning id`);
  programId = await id(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج الحمل', 'carry-test') returning id`, [sectionId]);
  roleId = await id(`insert into public.roles (name) values ('دور الحمل') returning id`);
  for (const code of ["programs.read", "programs.write", "participants.read", "participants.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [roleId, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);
  await asUser(ADMIN, () =>
    db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [programId, JSON.stringify([{ name: "الإيمان", count: 60 }])]),
  );
  hifz = await id(`insert into public.task_fields (program_id, label, kind, is_base) values ($1, 'حفظ', 'ranged', true) returning id`, [programId]);

  const sizes = { S: [20, 5], M: [40, 10], L: [60, 15], X: [40, 10], O: [40, 10] } as const;
  for (const [i, key] of (["S", "M", "L", "X", "O"] as const).entries()) {
    const [units, days] = sizes[key];
    track[key] = await id(`insert into public.tracks (program_id, name, sort_order) values ($1, $2, $3) returning id`, [programId, key, i]);
    await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, $2)`, [track[key], units]);
    plan[key] = (
      await asUser(ADMIN, () => db.query<{ id: string }>(`select public.fn_create_plan($1, $2, false) id`, [programId, track[key]]))
    ).rows[0]!.id;
    const values = Array.from({ length: days }, (_, d) => ({ day: d + 1, field_id: hifz, amount: 4 }));
    await asUser(ADMIN, () =>
      db.query(`select public.fn_save_plan($1, $2::jsonb, 'اختبار')`, [plan[key], JSON.stringify({ day_count: days, values })]),
    );
    await db.query(`update public.plan_versions set created_at = now() - interval '30 days' where plan_id = $1`, [plan[key]]);
  }

  startDate = (await db.query<{ d: string }>(`select (public.fn_local_now()::date - 15)::text d`)).rows[0]!.d;
  await setting("start_date", startDate);
  await setting("work_days", [0, 1, 2, 3, 4, 5, 6]);
  await setting("due_from", "program_start");
  await setting("carry_on_transfer", true);

  const join = async (uid: string, key: keyof typeof track) =>
    id(
      `insert into public.participants (user_id, program_id, track_id, status, joined_at, judge_from)
       values ($1, $2, $3, 'memorizing', now() - interval '20 days', now() - interval '20 days') returning id`,
      [uid, programId, track[key]],
    );
  pid.P1 = await join(P1, "L");
  pid.P3 = await join(P3, "M");
  pid.P4 = await join(P4, "S");
  pid.P5 = await join(P5, "M");
  pid.P6 = await join(P6, "L");
  await completed(pid.P1, "L", 5); // ٢٠ وحدة
  await completed(pid.P3, "M", 10); // ٤٠ — خطة M كلها
  await completed(pid.P4, "S", 5); // ٢٠ — خطة S كلها
  await completed(pid.P6, "L", 3);
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
    await db.query(`delete from public.track_change_requests where participant_id in (select id from public.participants where program_id = $1)`, [programId]);
    for (const table of ["commitment_archive", "field_marks", "field_counts", "day_openings", "day_completions"]) {
      await db.query(`delete from public.${table} where participant_id in (select id from public.participants where program_id = $1)`, [programId]);
    }
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    for (const table of ["plan_versions", "plan_values"]) {
      await db.query(`delete from public.${table} where plan_id in (select id from public.plans where program_id = $1)`, [programId]);
    }
    await db.query(`delete from public.plans where program_id = $1`, [programId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.track_content_ranges where track_id in (select id from public.tracks where program_id = $1)`, [programId]);
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

describe("حمل التقدّم عند النقل", () => {
  it("**الكسر لا يُحتسب:** ٢٢ وحدة على خطة ٤ يومياً = ٥ أيام", async () => {
    const r = await db.query<{ d: number }>(`select public.fn_credit_span($1, 22) d`, [plan.M]);
    expect(r.rows[0]!.d).toBe(5);
    expect((await db.query<{ d: number }>(`select public.fn_credit_span($1, 0) d`, [plan.M])).rows[0]!.d).toBe(0);
    expect((await db.query<{ d: number }>(`select public.fn_credit_span($1, 999) d`, [plan.M])).rows[0]!.d).toBe(10);
  });

  it("**المعاينة قبل القبول** — ما يُحمل وأيامه", async () => {
    const req = await id(
      `insert into public.track_change_requests (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage)
       values ($1, $2, $3, 'down', 'معاينة', 0) returning id`,
      [pid.P1, track.L, track.X],
    );
    const r = await asUser(ADMIN, () =>
      db.query<{ carry: boolean; credited_units: number; credited_days: number; day_count: number }>(
        `select * from public.fn_track_change_carry_preview($1)`,
        [req],
      ),
    );
    expect(r.rows[0]).toMatchObject({ carry: true, credited_units: 20, credited_days: 5, day_count: 10 });
    await db.query(`delete from public.track_change_requests where id = $1`, [req]);
  });

  it("**الكبير ← الأصغر بعد ٢٠:** يبدأ بعد آخر يومٍ تراكمه ≤ ٢٠، والموعد من بداية البرنامج", async () => {
    await transfer(pid.P1, "L", "X");
    expect(await credit(pid.P1)).toMatchObject({ u: 20 });
    const s = await state(pid.P1);
    expect(s).toMatchObject({ done_days: 5, credited_days: 5, current_day: 6, start_date: startDate });
    // لا يومٌ في أرشيف الجديد قبل يوم النقل.
    const early = await db.query(
      `select 1 from public.commitment_archive where participant_id = $1 and track_id = $2 and calendar_date < public.fn_local_now()::date`,
      [pid.P1, track.X],
    );
    expect(early.rows).toHaveLength(0);
    // المحتسب يدخل في النسبة (قرار الراعي): ٢٠ من ٤٠.
    const p = await db.query<{ percent: string; units: number }>(`select percent, units from public.fn_progress_at_unchecked($1, now())`, [pid.P1]);
    expect(p.rows[0]).toMatchObject({ units: 20 });
    expect(Number(p.rows[0]!.percent)).toBe(50);
  });

  it("**خطتي:** الأيام المحتسبة موسومة بلا تاريخ إتمام", async () => {
    const r = await asUser(P1, () =>
      db.query<{ day_number: number; credited: boolean; completed_on: string | null }>(
        `select day_number, credited, completed_on from public.fn_my_plan($1) where day_number <= 6`,
        [pid.P1],
      ),
    );
    expect(r.rows.map((x) => x.credited)).toEqual([true, true, true, true, true, false]);
    expect(r.rows.every((x) => x.completed_on === null)).toBe(true);
  });

  it("**قائمة المشاركين والمتأخرون** يعدّون المحتسب", async () => {
    const r = await asUser(ADMIN, () =>
      db.query<{ id: string; done_days: number; credited_days: number; prior_done_days: number }>(
        `select id, done_days, credited_days, prior_done_days from public.fn_program_participants($1)`,
        [programId],
      ),
    );
    expect(r.rows.find((x) => x.id === pid.P1)).toMatchObject({ done_days: 5, credited_days: 5, prior_done_days: 5 });
    const late = await asUser(ADMIN, () =>
      db.query<{ id: string; done_days: number }>(`select id, done_days from public.fn_program_late($1)`, [programId]),
    );
    expect(late.rows.find((x) => x.id === pid.P1)?.done_days ?? 5).toBe(5);
  });

  it("**الأصغر ← الأكبر بعد إتمام خطته:** يُحتسب نصيبه كله", async () => {
    await transfer(pid.P4, "S", "L");
    expect(await credit(pid.P4)).toMatchObject({ u: 20 });
    expect(await state(pid.P4)).toMatchObject({ done_days: 5, credited_days: 5, current_day: 6 });
  });

  it("**أ ← ب ← أ لا يُحسب مرتين**", async () => {
    await transfer(pid.P3, "M", "L"); // أتمّ M كلها: ٤٠ وحدة ← ١٠ أيام على L
    expect(await state(pid.P3)).toMatchObject({ done_days: 10, credited_days: 10 });
    await transfer(pid.P3, "L", "M"); // يعود: ما بلغه ٤٠ ← D = ١٠، وإتماماته الحيّة في M عشرة
    const s = await state(pid.P3);
    expect(s).toMatchObject({ done_days: 10, credited_days: 0, state: "finished" });
  });

  it("**نقلٌ بلا تقدّم:** صفرٌ لا نصيب الجديد كله — والموعد من البداية", async () => {
    await transfer(pid.P5, "M", "X");
    expect(await credit(pid.P5)).toMatchObject({ u: 0 });
    expect(await state(pid.P5)).toMatchObject({ done_days: 0, credited_days: 0, current_day: 1, start_date: startDate });
  });

  it("**الإعداد مطفأ:** السلوك القائم — لا محتسب، والموعد من يوم النقل", async () => {
    await setting("carry_on_transfer", false);
    await transfer(pid.P6, "L", "O");
    expect(await credit(pid.P6)).toEqual({ u: null, at: null });
    const s = await state(pid.P6);
    expect(s.done_days).toBe(0);
    expect(s.start_date).not.toBe(startDate);
    await setting("carry_on_transfer", true);
  });

  it("**القفل المضيَّق:** لا تقصير دون المحتسب ولا تغيير لمقادير أيامه — وما بعده حرّ", async () => {
    const save = (days: number, amounts: (d: number) => number) =>
      asUser(ADMIN, () =>
        db.query(`select public.fn_save_plan($1, $2::jsonb, 'تعديل')`, [
          plan.X,
          JSON.stringify({ day_count: days, values: Array.from({ length: days }, (_, d) => ({ day: d + 1, field_id: hifz, amount: amounts(d + 1) })) }),
        ]),
      );
    await expect(save(4, () => 4)).rejects.toThrow(/محتسبة|أتمّ مشاركون/);
    await expect(save(10, (d) => (d === 3 ? 3 : 4))).rejects.toThrow(/محتسبةٌ لمنقولين|أتمّها مشاركون/);
    // فوق المحتسب مع كسر (٢٢ وحدة ← ٥ أيام): تخفيف اليوم السادس إلى ٢ يمدّه إليه بأثرٍ رجعي — فيُرفض.
    await db.query(`update public.participants set credited_units = 22 where id = $1`, [pid.P1]);
    await expect(save(10, (d) => (d === 6 ? 2 : d === 7 ? 6 : 4))).rejects.toThrow(/يغيّر الأيام المحتسبة/);
    await db.query(`update public.participants set credited_units = 20 where id = $1`, [pid.P1]);
    await expect(save(10, (d) => (d === 8 ? 5 : d === 9 ? 3 : 4))).resolves.toBeDefined();
  });

  it("**مقاطع المسار مجمّدة بمحتسبٍ عليه** — ولو بلا إتمامٍ حيّ", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`update public.track_content_ranges set to_sequence = 39 where track_id = $1`, [track.X])),
    ).rejects.toThrow(/مقاطعه لا تُعدَّل/);
  });

  it("**المحتسب لا يُكتب مباشرة** — ونقلٌ لا يكتبه يمحوه", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`update public.participants set credited_units = 99 where id = $1`, [pid.P1])),
    ).rejects.toThrow(/تغيير المسار يمرّ بقبول طلب تغييره/);
    await db.query(`update public.participants set track_id = $2 where id = $1`, [pid.P5, track.M]);
    expect(await credit(pid.P5)).toEqual({ u: null, at: null });
  });
});
