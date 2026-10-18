import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * قراءات الطالب لصفحة «الخطة» — الهجرة ٠٩١ (`adr/0050`).
 *
 * **التكافؤ أولاً:** `fn_my_plan` يُرجع لكل يومٍ ما يُرجعه `fn_day_tasks` حين يبلغه — والاختبار
 * على مشاركٍ أتمّ الخطة كلها، فيُرجع `fn_day_tasks` كل الأيام وتُقارَن جميعاً. والمقادير
 * متفاوتة (١ · ٢ · ١ · ٣ · ١) ليُختبر المجموع التراكمي لا العدّ.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let otherTrack: string;
let roleId: string;
let hifz: string;
let rabt: string;
let tilawa: string;
let planId: string;
let doneId: string;
let freshId: string;
let partialId: string;

const ADMIN = "00000000-0000-4000-8000-000000000911";
const FINISHER = "00000000-0000-4000-8000-000000000912";
const FRESH = "00000000-0000-4000-8000-000000000913";
const OUTSIDER = "00000000-0000-4000-8000-000000000914";
const PARTIAL = "00000000-0000-4000-8000-000000000915";
const USERS = [ADMIN, FINISHER, FRESH, OUTSIDER, PARTIAL];
const AMOUNTS = [1, 2, 1, 3, 1];

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

const id = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;

type PlanRow = {
  day_number: number;
  scheduled_date: string | null;
  expected_date: string | null;
  completed_on: string | null;
  stumbled: boolean;
  compensated: boolean;
  tasks: { field_id: string; amount: number | null; ord_from: number | null; ord_to: number | null; repetition: number | null; value: number | null }[];
};

const myPlan = (uid: string, pid: string) =>
  asUser(uid, async () =>
    (
      await db.query<PlanRow>(
        `select day_number, scheduled_date::text, expected_date::text, completed_on::text, stumbled, compensated, tasks
         from public.fn_my_plan($1)`,
        [pid],
      )
    ).rows,
  );

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `student-plan-${i}@test.local`,
    ]);
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الخطة', $2)`, [
      uid,
      `+96650009110${i}`,
    ]);
  }
  sectionId = await id(`insert into public.sections (name) values ('قسم الخطة') returning id`);
  programId = await id(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج الخطة', 'student-plan-test') returning id`,
    [sectionId],
  );
  roleId = await id(`insert into public.roles (name) values ('دور الخطة') returning id`);
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [roleId, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);
  await asUser(ADMIN, () =>
    db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [programId, JSON.stringify([{ name: "الإيمان", count: 10 }])]),
  );
  trackId = await id(`insert into public.tracks (program_id, name) values ($1, 'الأول') returning id`, [programId]);
  otherTrack = await id(`insert into public.tracks (program_id, name) values ($1, 'الثاني') returning id`, [programId]);
  for (const t of [trackId, otherTrack]) {
    await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 10)`, [t]);
  }
  hifz = await id(
    `insert into public.task_fields (program_id, label, kind, is_base) values ($1, 'حفظ', 'ranged', true) returning id`,
    [programId],
  );
  rabt = await id(
    `insert into public.task_fields (program_id, label, kind, is_constrained) values ($1, 'ربط', 'explicit', true) returning id`,
    [programId],
  );
  tilawa = await id(
    `insert into public.task_fields (program_id, label, kind, is_required) values ($1, 'تلاوة', 'counted', false) returning id`,
    [programId],
  );
  planId = (
    await asUser(ADMIN, () => db.query<{ id: string }>(`select public.fn_create_plan($1, null, false) id`, [programId]))
  ).rows[0]!.id;
  const values: object[] = [];
  AMOUNTS.forEach((amount, i) => {
    const d = i + 1;
    values.push({ day: d, field_id: hifz, amount, repetition: 3 });
    if (d > 1) values.push({ day: d, field_id: rabt, from: d - 1, to: d });
    values.push({ day: d, field_id: tilawa, value: 5 });
  });
  await asUser(ADMIN, () =>
    db.query(`select public.fn_save_plan($1, $2::jsonb, 'اختبار')`, [planId, JSON.stringify({ day_count: 5, values })]),
  );
  // بدأت البرنامج قبل أسابيع — فالمُتمّ أتمّ في الماضي، والجديد يُحسب من اليوم.
  await asUser(ADMIN, () =>
    db.query(`select public.fn_set_engine_setting($1, null, 'start_date', '"2026-09-01"'::jsonb)`, [programId]),
  );
  await db.query(`update public.plan_versions set created_at = '2026-08-01T09:00:00+03' where plan_id = $1`, [planId]);

  const join = (uid: string) =>
    id(
      `insert into public.participants (user_id, program_id, track_id, status, joined_at, judge_from)
       values ($1, $2, $3, 'registered', '2026-08-01T10:00:00+03', '2026-08-01T10:00:00+03') returning id`,
      [uid, programId, trackId],
    );
  doneId = await join(FINISHER);
  freshId = await join(FRESH);
  partialId = await join(PARTIAL);
  // أتمّ الخطة كلها في أيامها الخمسة الأولى (الثلاثاء ١ سبتمبر ← الأحد ٦، والجمعة ٤ راحة).
  const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"];
  for (const [i, date] of dates.entries()) {
    await db.query(
      `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
       values ($1, $2, $3, $4, $5::timestamptz)`,
      [doneId, planId, trackId, i + 1, `${date}T20:00:00+03:00`],
    );
  }
  // تعثّرٌ على اليوم ٤ ثم عُوّض — في أرشيف مساره وخطته.
  await db.query(
    `insert into public.commitment_archive (participant_id, track_id, plan_id, calendar_date, deadline, status, plan_day, completed_days, compensated_at)
     values ($1, $2, $3, '2026-09-04', '23:00', 'stumbled', 4, '{}', '2026-09-05T20:00:00+03')`,
    [doneId, trackId, planId],
  );
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
    for (const table of ["commitment_archive", "field_marks", "field_counts", "day_openings", "day_completions", "session_participants"]) {
      await db.query(
        `delete from public.${table} where participant_id in (select id from public.participants where program_id = $1)`,
        [programId],
      );
    }
    await db.query(`delete from public.exam_sessions where exam_id in (select id from public.exams where program_id = $1)`, [programId]);
    await db.query(`delete from public.exams where program_id = $1`, [programId]);
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    for (const table of ["plan_versions", "plan_values"]) {
      await db.query(`delete from public.${table} where plan_id in (select id from public.plans where program_id = $1)`, [programId]);
    }
    await db.query(`delete from public.plans where program_id = $1`, [programId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.track_content_ranges where track_id in ($1, $2)`, [trackId, otherTrack]);
    await db.query(`delete from public.content_units where program_id = $1`, [programId]);
    await db.query(`delete from public.material_sections where program_id = $1`, [programId]);
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

describe("fn_day_tasks · الاطّلاع على ما بعد يومه (الهجرة ٠٩٥)", () => {
  it("**يُرجع اليوم القادم للعرض، ولا يُرصد**", async () => {
    // FRESH لم يُتمّ شيئاً: يومه الأول، واليوم ٣ قادم.
    const ahead = await asUser(FRESH, async () =>
      (await db.query(`select task_field_id from public.fn_day_tasks($1, 3)`, [freshId])).rows,
    );
    expect(ahead.length).toBeGreaterThan(0);
    const beyond = await asUser(FRESH, async () =>
      (await db.query(`select task_field_id from public.fn_day_tasks($1, 99)`, [freshId])).rows,
    );
    expect(beyond).toEqual([]);
    await expect(
      asUser(FRESH, async () => db.query(`select public.fn_mark_field($1, 3, $2)`, [freshId, hifz])),
    ).rejects.toThrow(/يُرصد يوم خطتك الحالي وحده/);
    await expect(
      asUser(FRESH, async () => db.query(`select public.fn_count_repetition($1, 3, $2, 1)`, [freshId, hifz])),
    ).rejects.toThrow(/يُرصد يوم خطتك الحالي وحده/);
  });
});

describe("fn_my_plan", () => {
  it("**يكافئ fn_day_tasks في كل يوم** — المدى التراكمي والصريح المرتبط بالمادة والتكرار", async () => {
    const plan = await myPlan(FINISHER, doneId);
    expect(plan.map((d) => d.day_number)).toEqual([1, 2, 3, 4, 5]);
    for (const day of plan) {
      const legacy = await asUser(FINISHER, async () =>
        (
          await db.query<{ task_field_id: string; amount: number | null; ord_from: number | null; ord_to: number | null; repetition: number | null; value: string | null }>(
            `select task_field_id, amount, ord_from, ord_to, repetition, value from public.fn_day_tasks($1, $2)`,
            [doneId, day.day_number],
          )
        ).rows,
      );
      expect(legacy.length).toBe(day.tasks.length);
      for (const old of legacy) {
        const mine = day.tasks.find((t) => t.field_id === old.task_field_id)!;
        expect({ amount: mine.amount, from: mine.ord_from, to: mine.ord_to, rep: mine.repetition }, `اليوم ${day.day_number}`).toEqual({
          amount: old.amount,
          from: old.ord_from,
          to: old.ord_to,
          rep: old.repetition,
        });
        expect(mine.value === null ? null : Number(mine.value)).toBe(old.value === null ? null : Number(old.value));
      }
    }
    // التراكم لا العدّ: الحفظ في اليوم ٤ من ٥ إلى ٧.
    const d4 = plan[3]!.tasks.find((t) => t.field_id === hifz)!;
    expect([d4.ord_from, d4.ord_to]).toEqual([5, 7]);
  });

  it("**المُتمّ بيوم إتمامه، ولا تاريخ متوقَّعاً له** — والمتعثَّر المعوَّض موسوم", async () => {
    const plan = await myPlan(FINISHER, doneId);
    expect(plan.map((d) => d.completed_on)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"]);
    expect(plan.every((d) => d.expected_date === null)).toBe(true);
    expect(plan[3]).toMatchObject({ stumbled: true, compensated: true });
    expect(plan[2]).toMatchObject({ stumbled: false, compensated: false });
    // الموعد المقرَّر: أيام البرنامج من البداية، والجمعة ٤ سبتمبر ليست منها.
    expect(plan.map((d) => d.scheduled_date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"]);
  });

  it("**ما بقي له تاريخٌ متوقَّع** متصاعدٌ على أيام البرنامج وحدها", async () => {
    const plan = await myPlan(FRESH, freshId);
    const expected = plan.map((d) => d.expected_date!);
    expect(expected.every(Boolean)).toBe(true);
    expect([...expected].sort()).toEqual(expected);
    expect(new Set(expected).size).toBe(expected.length);
    const cal = await asUser(FRESH, async () =>
      (
        await db.query<{ d: string; p: boolean }>(
          `select calendar_date::text d, is_program_day p from public.fn_my_calendar($1, $2::date, $2::date + 30)`,
          [freshId, expected[0]],
        )
      ).rows,
    );
    const programDays = new Set(cal.filter((c) => c.p).map((c) => c.d));
    expect(expected.every((d) => programDays.has(d))).toBe(true);
    expect(plan.every((d) => d.completed_on === null)).toBe(true);
  });

  it("**لا يقرؤها غير صاحبها** ولا من لا يقرأ المشاركين", async () => {
    await expect(myPlan(OUTSIDER, doneId)).rejects.toThrow(/لا صلاحية لك على هذه المشاركة/);
    await expect(myPlan(FRESH, doneId)).rejects.toThrow(/لا صلاحية لك على هذه المشاركة/);
  });
});

describe("fn_my_calendar", () => {
  const cal = (from: string, to: string) =>
    asUser(FRESH, async () =>
      (
        await db.query<{ d: string; p: boolean; t: string }>(
          `select calendar_date::text d, is_program_day p, deadline::text t from public.fn_my_calendar($1, $2::date, $3::date)`,
          [freshId, from, to],
        )
      ).rows,
    );

  it("الجمعة راحة، ووقت نهاية الرصد الافتراضي ١١ مساءً", async () => {
    const rows = await cal("2026-09-03", "2026-09-05");
    expect(rows.map((r) => [r.d, r.p])).toEqual([
      ["2026-09-03", true],
      ["2026-09-04", false],
      ["2026-09-05", true],
    ]);
    expect(rows[0]!.t).toBe("23:00:00");
  });

  it("**النطاق الخاطئ يُرفض لا يُقصّ** — والأطول من ٦٣ يوماً", async () => {
    await expect(cal("2026-09-05", "2026-09-01")).rejects.toThrow(/نطاق التقويم غير صالح/);
    await expect(cal("2026-09-01", "2026-12-01")).rejects.toThrow(/أطول من ٦٣ يوماً/);
  });
});

describe("fn_my_milestones", () => {
  it("**المحدَّد بتاريخٍ لمساره وحده** — عن بعدٍ بفتحه، وشفهيٌّ بموعد جلسته المسندة", async () => {
    const remote = await id(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts, opens_at)
       values ($1, 'المرحلي الأول', 'remote', 'interim', 50, 2, 60, 0, 3, '2026-12-01T08:00:00+03') returning id`,
      [programId],
    );
    await id(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts)
       values ($1, 'بلا تاريخ', 'remote', 'interim', 50, 2, 60, 0, 3) returning id`,
      [programId],
    );
    await id(
      `insert into public.exams (program_id, track_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts, opens_at)
       values ($1, $2, 'لمسارٍ آخر', 'remote', 'interim', 50, 2, 60, 0, 3, '2026-12-02T08:00:00+03') returning id`,
      [programId, otherTrack],
    );
    const oral = await id(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage, entry_percentage)
       values ($1, 'النهائي', 'oral', 'final', 80, 3, 1, 90, 100) returning id`,
      [programId],
    );
    const session = await id(
      `insert into public.exam_sessions (exam_id, name, scheduled_at, location) values ($1, 'الجلسة الأولى', '2027-01-10T16:00:00+03', 'مقر الجمعية') returning id`,
      [oral],
    );
    await db.query(`insert into public.session_participants (session_id, participant_id) values ($1, $2)`, [session, freshId]);

    const rows = await asUser(FRESH, async () =>
      (await db.query<{ exam_id: string; name: string; location: string }>(`select exam_id, name, location from public.fn_my_milestones($1)`, [freshId])).rows,
    );
    expect(rows.map((r) => r.name)).toEqual(["المرحلي الأول", "النهائي"]);
    expect(rows[0]!.exam_id).toBe(remote);
    expect(rows[1]!.location).toBe("مقر الجمعية");
    // ومن لم تُسند له جلسةٌ لا يرى الشفهي.
    const other = await asUser(FINISHER, async () =>
      (await db.query<{ name: string }>(`select name from public.fn_my_milestones($1)`, [doneId])).rows,
    );
    expect(other.map((r) => r.name)).toEqual(["المرحلي الأول"]);
    await expect(
      asUser(OUTSIDER, () => db.query(`select * from public.fn_my_milestones($1)`, [freshId])),
    ).rejects.toThrow(/لا صلاحية لك على هذه المشاركة/);
  });
});

describe("fn_my_stats (ش٢)", () => {
  const stats = (uid: string, pid: string) =>
    asUser(uid, async () =>
      (await db.query<{ streak: number; on_time: number; reps: string; stumbled_days: number; compensated_days: number }>(`select * from public.fn_my_stats($1)`, [pid])).rows[0]!,
    );

  it("**المتتالية بعد آخر تعثّر** — والمعفى لا يقطعها ولا يُعدّ · في موعدها بلا المتعثَّر عليه · التكرار في المُتمّ وحده", async () => {
    // بعد التعثّر (٤ سبتمبر): أتمّ السبت، ومعفى الأحد، وأتمّ الاثنين — فالمتتالية ٢.
    for (const [date, status] of [
      ["2026-09-05", "completed"],
      ["2026-09-06", "exempt"],
      ["2026-09-07", "completed"],
    ] as const) {
      await db.query(
        `insert into public.commitment_archive (participant_id, track_id, plan_id, calendar_date, deadline, status, plan_day, completed_days)
         values ($1, $2, $3, $4, '23:00', $5, 5, '{}')`,
        [doneId, trackId, planId, date, status],
      );
    }
    for (let d = 1; d <= 5; d++) {
      await db.query(
        `insert into public.field_counts (participant_id, plan_id, track_id, day_number, task_field_id, count) values ($1, $2, $3, $4, $5, 3)`,
        [doneId, planId, trackId, d, hifz],
      );
    }
    // عدٌّ محذوف لا يُحسب.
    await db.query(
      `insert into public.field_counts (participant_id, plan_id, track_id, day_number, task_field_id, count, deleted_at)
       values ($1, $2, $3, 1, $4, 9, now())`,
      [doneId, planId, trackId, tilawa],
    );
    const s = await stats(FINISHER, doneId);
    expect(s.streak).toBe(2);
    // كلها أُتمّت قبل وقت رصد موعدها المقرَّر — والتعثّر الموسوم لا يُنقصها (المراجعة م٢).
    expect(s.on_time).toBe(5);
    expect(Number(s.reps)).toBe(15);
    expect([s.stumbled_days, s.compensated_days]).toEqual([1, 1]);
  });

  it("**من لم يبدأ: أصفار** — ولا يقرؤها غيره", async () => {
    const s = await stats(FRESH, freshId);
    expect([s.streak, s.on_time, Number(s.reps), s.stumbled_days]).toEqual([0, 0, 0, 0]);
    await expect(stats(OUTSIDER, freshId)).rejects.toThrow(/لا صلاحية لك على هذه المشاركة/);
  });

  it("**المتأخر ليس في موعده · التكرار بعد آخر مُتمّ لا يُحسب · والمُلغى لا يُعدّ · واليوم يُعدّ إن أُتمّ فيه**", async () => {
    // اليوم ١ في موعده (١ سبتمبر)، واليوم ٢ متأخر (٣ سبتمبر وموعده ٢)، واليوم ٣ اليوم. ويومٌ أُلغي إتمامه لا يُعدّ.
    const complete = (day: number, at: string, undone = false) =>
      db.query(
        `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at, undone_at)
         values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)`,
        [partialId, planId, trackId, day, at, undone ? at : null],
      );
    await complete(1, "2026-09-01T20:00:00+03:00");
    await complete(2, "2026-09-03T20:00:00+03:00");
    await complete(3, "2026-09-03T21:00:00+03:00", true);
    await db.query(
      `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at) values ($1, $2, $3, 3, now())`,
      [partialId, planId, trackId],
    );
    for (let d = 1; d <= 4; d++) {
      await db.query(
        `insert into public.field_counts (participant_id, plan_id, track_id, day_number, task_field_id, count) values ($1, $2, $3, $4, $5, 3)`,
        [partialId, planId, trackId, d, hifz],
      );
    }
    // تعثّران — واحدٌ معوَّض.
    for (const [date, comp] of [["2026-09-02", false], ["2026-09-03", true]] as const) {
      await db.query(
        `insert into public.commitment_archive (participant_id, track_id, plan_id, calendar_date, deadline, status, plan_day, completed_days, compensated_at)
         values ($1, $2, $3, $4, '23:00', 'stumbled', 2, '{}', $5::timestamptz)`,
        [partialId, trackId, planId, date, comp ? "2026-09-04T10:00:00+03" : null],
      );
    }
    const s = await stats(PARTIAL, partialId);
    expect(s.on_time).toBe(1);
    expect(Number(s.reps)).toBe(9);
    expect([s.stumbled_days, s.compensated_days]).toEqual([2, 1]);
    // اليوم يُعدّ إن كان يوم برنامج (والجمعة ليست منها) — ثم يقطعها آخر تعثّر.
    const friday = (await db.query<{ f: boolean }>(`select extract(dow from public.fn_local_now()::date) = 5 f`)).rows[0]!.f;
    expect(s.streak).toBe(friday ? 0 : 1);
  });
});
