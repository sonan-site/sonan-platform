import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * الفرز والجلسات والتحكيم (`adr/0048`، الهجرتان ٠٨٠ و٠٨١).
 *
 * في معاملة واحدة تُتراجع في آخره، كاختبار المحرّك: نسبة الإنجاز واجتياز
 * المرحلي يأتيان من نظيرين يضبطهما الاختبار لكل مشارك.
 */

let db: Client;
let n = 0;

const ADMIN = "00000000-0000-4000-8000-000000000e21"; // exams.manage
const J1 = "00000000-0000-4000-8000-000000000e22"; // exams.judge
const J2 = "00000000-0000-4000-8000-000000000e23"; // exams.judge
const NOJ = "00000000-0000-4000-8000-000000000e24"; // بلا صلاحية
const PA = "00000000-0000-4000-8000-000000000e25";
const PB = "00000000-0000-4000-8000-000000000e26";
const PC = "00000000-0000-4000-8000-000000000e27";

let programId: string;
let finalId: string;
let sessionId: string;
const part: Record<string, string> = {};
let hesitate: string;
let swap: string;

async function as<T extends Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null }> {
  const sp = `sp${++n}`;
  await db.query(`savepoint ${sp}`);
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const { rows } = await db.query<T>(sql, params);
    await db.query("reset role");
    await db.query(`release savepoint ${sp}`);
    return { rows, error: null };
  } catch (error) {
    await db.query(`rollback to savepoint ${sp}`);
    await db.query("reset role");
    return { rows: [], error: (error as Error).message };
  }
}

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

type Sheet = { approved: boolean; total: number; max: number; questions: { id: string; evaluated: boolean }[] };
const sheet = async (judge: string, who: string, onBehalf: string | null = null) =>
  (await as<{ s: Sheet }>(judge, `select public.fn_judge_sheet($1, $2, $3) s`, [sessionId, part[who], onBehalf])).rows[0]
    ?.s;
const mark = (judge: string, who: string, q: string, criteria: string[], onBehalf: string | null = null, reason: string | null = null) =>
  as<{ s: Sheet }>(judge, `select public.fn_judge_mark($1, $2, $3, $4::uuid[], $5, $6) s`, [
    sessionId,
    part[who],
    q,
    criteria,
    onBehalf,
    reason,
  ]);
const approve = (judge: string, who: string, onBehalf: string | null = null, reason: string | null = null) =>
  as(judge, `select public.fn_judge_approve($1, $2, $3, $4)`, [sessionId, part[who], onBehalf, reason]);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
  await db.query("begin");

  // نظيرا الإنجاز واجتياز المرحلي — لكل مشارك قيمته.
  await db.query(`create table public.zz_state (participant_id uuid primary key, pct numeric, passed boolean)`);
  await db.query(`grant select on public.zz_state to authenticated`);
  await db.query(`
    create or replace function public.fn_progress_at_unchecked(p_participant_id uuid, p_at timestamptz)
    returns table (done_days int, day_count int, units int, share_size int, percent numeric, reach_sequence int)
    language sql stable security definer set search_path = ''
    as $f$ select 40, 40, case when z.pct >= 100 then 20 else 10 end, 20, z.pct, null::int
           from public.zz_state z where z.participant_id = p_participant_id $f$`);
  await db.query(`
    create or replace function public.fn_exam_best(p_exam_id uuid, p_participant_id uuid)
    returns table (best_percent numeric, passed boolean, attempts int)
    language sql stable security definer set search_path = ''
    as $f$ select case when z.passed then 90 else 50 end::numeric, z.passed, 1
           from public.zz_state z where z.participant_id = p_participant_id $f$`);

  const users = [ADMIN, J1, J2, NOJ, PA, PB, PC];
  for (const [i, uid] of users.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `judging-${i}@test.local`],
    );
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, $2)`, [uid, `حساب ${i}`]);
  }
  const role = async (codes: string[], members: string[]) => {
    const id = (await one(`insert into public.roles (name) values ($1) returning id`, [`دور ${codes.join("-")}`])).id;
    for (const c of codes) await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [id, c]);
    for (const m of members) await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [m, id]);
  };
  await role(["exams.manage"], [ADMIN]);
  await role(["exams.judge"], [J1, J2]);

  const section = (await one(`insert into public.sections (name) values ('قسم التحكيم') returning id`)).id;
  programId = (
    await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج التحكيم', 'judging-test') returning id`, [section])
  ).id;
  await db.query(
    `insert into public.content_units (program_id, sequence, label) select $1, g, 'وحدة ' || g from generate_series(1, 20) g`,
    [programId],
  );
  const track = (await one(`insert into public.tracks (program_id, name) values ($1, 'الأول') returning id`, [programId])).id;
  await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 20)`, [track]);

  for (const [key, uid, pct, passed] of [
    ["A", PA, 100, true],
    ["B", PB, 100, false],
    ["C", PC, 80, true],
  ] as const) {
    part[key] = (
      await one(
        `insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`,
        [uid, programId, track],
      )
    ).id;
    await db.query(`insert into public.zz_state values ($1, $2, $3)`, [part[key], pct, passed]);
  }

  for (let u = 1; u <= 5; u++) {
    const { error } = await as(ADMIN, `select public.fn_save_question($1, null, $2::jsonb)`, [
      programId,
      JSON.stringify({ unit_sequence: u, text: `سؤال شفهي ${u}`, usage: "oral", score: 2, answer: `الجواب ${u}` }),
    ]);
    if (error) throw new Error(error);
  }
  hesitate = (await one(`insert into public.deduction_criteria (program_id, label, deduction_value) values ($1, 'تردّد', 0.5) returning id`, [programId])).id;
  swap = (await one(`insert into public.deduction_criteria (program_id, label, deduction_value) values ($1, 'إبدال', 1) returning id`, [programId])).id;

  const interim = (
    await one(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts)
       values ($1, 'المرحلي', 'remote', 'interim', 80, 3, 60, 0, 2) returning id`,
      [programId],
    )
  ).id;
  finalId = (
    await one(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage,
                                 entry_percentage, prerequisite_exam_id)
       values ($1, 'النهائي', 'oral', 'final', 80, 3, 2, 90, 100, $2) returning id`,
      [programId, interim],
    )
  ).id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("الفرز", () => {
  it("**الأهلية من الشرطين:** الإتمام واجتياز المرحلي — من لقطةٍ تُحسب بدفعات", async () => {
    // دفعتان من مشاركَين ثم واحد — والحساب يُستأنف من حيث وقف.
    const first = await as<{ computed: number; total: number }>(ADMIN, `select * from public.fn_compute_eligibility($1, 0, 2)`, [finalId]);
    expect(first.rows[0]).toEqual({ computed: 2, total: 3 });
    const rest = await as<{ computed: number }>(ADMIN, `select * from public.fn_compute_eligibility($1, 2, 2)`, [finalId]);
    expect(rest.rows[0]!.computed).toBe(1);
    const { rows } = await as<{ registration_no: number; eligible: boolean; participant_id: string }>(
      ADMIN,
      `select participant_id, eligible from public.fn_final_eligibility($1)`,
      [finalId],
    );
    const by = Object.fromEntries(rows.map((r) => [r.participant_id, r.eligible]));
    expect([by[part.A!], by[part.B!], by[part.C!]]).toEqual([true, false, false]);
    expect((await as(J1, `select * from public.fn_final_eligibility($1)`, [finalId])).error).toMatch(/لا تملك فرز/);
  });

  it("**لا حسم بلا لحظة احتساب ولا قبلها** — حسمٌ مبكر يُنهي رحلات الجميع", async () => {
    const tryApply = () => as(ADMIN, `select * from public.fn_apply_sorting($1, '{}'::jsonb)`, [finalId]);
    expect((await tryApply()).error).toMatch(/حدّد لحظة احتساب الإنجاز/);
    await db.query(`update public.exams set eligibility_at = now() + interval '1 day' where id = $1`, [finalId]);
    expect((await tryApply()).error).toMatch(/قبل لحظة احتساب الإنجاز/);
    await db.query(`update public.exams set eligibility_at = now() - interval '1 hour' where id = $1`, [finalId]);
    const { rows } = await db.query(`select count(*)::int n from public.participants where id = any($1::uuid[]) and status = 'memorizing'`, [
      Object.values(part),
    ]);
    expect(rows[0].n).toBe(3); // لم يتغيّر أحد
  });

  it("**الحسم مرّة باستثناءٍ إداري يغلب الحساب**", async () => {
    const { rows, error } = await as<{ qualified: number; not_qualified: number }>(
      ADMIN,
      `select * from public.fn_apply_sorting($1, $2::jsonb)`,
      [finalId, JSON.stringify({ [part.C!]: true })],
    );
    expect(error).toBeNull();
    expect(rows[0]).toEqual({ qualified: 2, not_qualified: 1 });
    const { rows: st } = await db.query(`select id, status from public.participants where id = any($1::uuid[])`, [
      Object.values(part),
    ]);
    const by = Object.fromEntries(st.map((r) => [r.id, r.status]));
    expect([by[part.A!], by[part.B!], by[part.C!]]).toEqual(["qualified", "not_qualified", "qualified"]);
  });
});

describe("الجلسات", () => {
  it("**الجلسة للشفهي، ولجنتها ممّن يحمل التحكيم وحدهم**", async () => {
    const created = await as<{ id: string }>(
      ADMIN,
      `insert into public.exam_sessions (exam_id, name, scheduled_at, location) values ($1, 'اللجنة الأولى', now(), 'بريدة') returning id`,
      [finalId],
    );
    expect(created.error).toBeNull();
    sessionId = created.rows[0]!.id;
    for (const j of [J1, J2]) {
      expect((await as(ADMIN, `select public.fn_set_session_judge($1, $2, true)`, [sessionId, j])).error).toBeNull();
    }
    expect((await as(ADMIN, `select public.fn_set_session_judge($1, $2, true)`, [sessionId, NOJ])).error).toMatch(
      /لا يحمل صلاحية التحكيم/,
    );
  });

  it("**الإسناد للمتأهل وحده**", async () => {
    const { error } = await as(ADMIN, `select public.fn_move_participant($1, $2)`, [sessionId, part.B]);
    expect(error).toMatch(/لا يُسنَد إلى جلسة إلا المتأهل/);
  });

  it("**التوزيع يُسند المتأهلين بأسئلتهم** ولا يُسند غيرهم", async () => {
    const { rows } = await as<{ assigned: number; remaining: number }>(ADMIN, `select * from public.fn_distribute_participants($1)`, [finalId]);
    expect(rows[0]).toEqual({ assigned: 2, remaining: 0 });
    const { rows: sp } = await db.query(
      `select participant_id, cardinality(question_ids) q from public.session_participants where session_id = $1 and deleted_at is null`,
      [sessionId],
    );
    expect(sp.map((r) => r.participant_id).sort()).toEqual([part.A, part.C].sort());
    expect(sp.every((r) => r.q === 3)).toBe(true);
    expect((await as<{ assigned: number }>(ADMIN, `select * from public.fn_distribute_participants($1)`, [finalId])).rows[0]!.assigned).toBe(0);
  });

  it("**المحكّم يرى جلسته** وغيره لا يراها", async () => {
    const mine = await as<{ participants: number }>(J1, `select participants from public.fn_judge_sessions()`);
    expect(mine.rows).toEqual([{ participants: 2 }]);
    expect((await as(NOJ, `select * from public.fn_judge_sessions()`)).rows).toHaveLength(0);
    expect((await as(NOJ, `select public.fn_judge_sheet($1, $2)`, [sessionId, part.A])).error).toMatch(/لست محكّماً/);
  });
});

describe("التحكيم", () => {
  it("**الورقة تحمل الجواب للمحكّم**، والاعتماد قبل التقييم الكامل يُرفض", async () => {
    const s = (await sheet(J1, "A"))!;
    expect(s.questions).toHaveLength(3);
    expect(JSON.stringify(s)).toMatch(/الجواب \d/);
    expect((await approve(J1, "A")).error).toMatch(/قيّم الأسئلة كلها/);
  });

  it("**التعليم على المعايير لا الأرقام**، والدرجة مشتقّة", async () => {
    const s = (await sheet(J1, "A"))!;
    const [q1, q2, q3] = s.questions.map((q) => q.id);
    await mark(J1, "A", q1!, [hesitate]);
    await mark(J1, "A", q2!, [hesitate, swap]);
    const done = (await mark(J1, "A", q3!, [])).rows[0]!.s;
    expect(Number(done.total)).toBe(6 - 0.5 - 1.5);
    expect((await approve(J1, "A")).error).toBeNull();
  });

  it("**المعتمد مقفل**، وإعادة فتحه إداريةٌ بسبب", async () => {
    const q = (await sheet(J1, "A"))!.questions[0]!.id;
    expect((await mark(J1, "A", q, [])).error).toMatch(/أُقفل/);
    expect((await as(J1, `select public.fn_reopen_evaluation($1, $2, $3, 'خطأ')`, [sessionId, part.A, J1])).error).toMatch(
      /لا تملك/,
    );
    expect(
      (await as(ADMIN, `select public.fn_reopen_evaluation($1, $2, $3, 'طلب المحكّم تصحيح السؤال الأول')`, [sessionId, part.A, J1]))
        .error,
    ).toBeNull();
    expect((await mark(J1, "A", q, [])).error).toBeNull();
    expect((await approve(J1, "A")).error).toBeNull();
  });

  it("**المحكّم لا يرى تقييم زميله** (`BR-SESS-03`)", async () => {
    const q = (await sheet(J2, "A"))!.questions[0]!.id;
    await mark(J2, "A", q, [swap]);
    const seen = await as<{ judge_id: string }>(J1, `select judge_id from public.judge_evaluations`);
    expect(seen.rows.map((r) => r.judge_id)).toEqual([J1]);
    const s = (await sheet(J2, "A"))!;
    expect(s.questions.filter((x) => x.evaluated)).toHaveLength(1); // ورقته هو لا ورقة J1
  });

  it("**لا درجة نهائية قبل اعتماد اللجنة كلها** (`BR-SESS-02`)، ثم المتوسط", async () => {
    const before = await as<{ participant_id: string; percent: string | null }>(
      ADMIN,
      `select participant_id, percent from public.fn_final_scores($1)`,
      [finalId],
    );
    expect(before.rows.find((r) => r.participant_id === part.A)!.percent).toBeNull();

    const s = (await sheet(J2, "A"))!;
    for (const q of s.questions.slice(1)) await mark(J2, "A", q.id, []);
    expect((await approve(J2, "A")).error).toBeNull();
    const after = await as<{ participant_id: string; final_score: string; percent: string }>(
      ADMIN,
      `select participant_id, final_score, percent from public.fn_final_scores($1)`,
      [finalId],
    );
    const a = after.rows.find((r) => r.participant_id === part.A)!;
    // J1: 6 − 0.5 (بعد التصحيح صار الأول بلا خصم: 6 − 1.5 = 4.5) · J2: 6 − 1 = 5 → المتوسط 4.75
    expect(Number(a.final_score)).toBe(4.75);
    expect(Number(a.percent)).toBe(79.2);
  });

  it("**الإدخال عن المحكّم بسببٍ يُسجَّل** — والمحكّم لا يُدخل عن زميله", async () => {
    const q = (await sheet(ADMIN, "C", J2))!.questions[0]!.id;
    expect((await mark(J1, "C", q, [], J2)).error).toMatch(/لا يُدخل تقييمَ محكّمٍ غيرُه/);
    expect((await mark(ADMIN, "C", q, [], J2)).error).toMatch(/اذكر سبب/);
    expect((await mark(ADMIN, "C", q, [hesitate], J2, "تعطّل جوال المحكّم")).error).toBeNull();
    const r = await one(
      `select r.entered_by, r.reason, je.judge_id from public.retroactive_entries r
       join public.judge_evaluations je on je.id = r.evaluation_id where je.participant_id = $1`,
      [part.C],
    );
    expect(r).toEqual({ entered_by: ADMIN, reason: "تعطّل جوال المحكّم", judge_id: J2 });
  });

  it("**من بدأ تحكيمه لا يُنقل**", async () => {
    const other = (
      await as<{ id: string }>(
        ADMIN,
        `insert into public.exam_sessions (exam_id, name, scheduled_at) values ($1, 'اللجنة الثانية', now()) returning id`,
        [finalId],
      )
    ).rows[0]!.id;
    expect((await as(ADMIN, `select public.fn_move_participant($1, $2)`, [other, part.A])).error).toMatch(/لا يُنقل/);
  });

  it("**والجلسة تُقفل آلياً** حين يعتمد الجميع الجميع", async () => {
    for (const judge of [J1, J2]) {
      const s = (await sheet(judge === J2 ? ADMIN : J1, "C", judge === J2 ? J2 : null))!;
      for (const q of s.questions) {
        if (judge === J2) await mark(ADMIN, "C", q.id, [], J2, "تعطّل جوال المحكّم");
        else await mark(J1, "C", q.id, []);
      }
      expect((judge === J2 ? await approve(ADMIN, "C", J2, "تعطّل جوال المحكّم") : await approve(J1, "C")).error).toBeNull();
    }
    expect((await one(`select status from public.exam_sessions where id = $1`, [sessionId])).status).toBe("closed");
  });

  it("**الإدارة ترى حال كل محكّم مع كل مشارك** — والمرشَّحون للجنة حاملو التحكيم", async () => {
    const ev = await as<{ judge_id: string; approved: boolean; retroactive: boolean; participant_id: string }>(
      ADMIN,
      `select participant_id, judge_id, approved, retroactive from public.fn_session_evaluations($1)`,
      [sessionId],
    );
    expect(ev.rows).toHaveLength(4);
    expect(ev.rows.every((r) => r.approved)).toBe(true);
    expect(ev.rows.find((r) => r.participant_id === part.C && r.judge_id === J2)!.retroactive).toBe(true);
    expect((await as(J1, `select * from public.fn_session_evaluations($1)`, [sessionId])).error).toMatch(/لا تملك/);
    const cand = await as<{ user_id: string }>(ADMIN, `select user_id from public.fn_exam_judge_candidates($1)`, [programId]);
    // ودور النظام يحمل الكتالوج كله، فصاحبه مرشَّحٌ أيضاً — يكفي أن يكون الاثنان ولا يكون غير الحامل.
    const ids = cand.rows.map((r) => r.user_id);
    expect(ids).toEqual(expect.arrayContaining([J1, J2]));
    expect(ids).not.toContain(NOJ);
    expect(ids).not.toContain(ADMIN);
  });

  it("**المعيار المستعمَل لا يتغيّر** — يُؤرشف", async () => {
    expect((await as(ADMIN, `update public.deduction_criteria set deduction_value = 2 where id = $1`, [swap])).error).toMatch(
      /خُصم بهذا المعيار/,
    );
    expect((await as(ADMIN, `update public.deduction_criteria set deleted_at = now() where id = $1`, [swap])).error).toBeNull();
  });

  it("**الإعدادات الشفهية تُقفل بعد الإسناد**", async () => {
    expect((await as(ADMIN, `update public.exams set judge_count = 1 where id = $1`, [finalId])).error).toMatch(/بدأ الاختبار/);
  });

  it("**الاعتماد عن المحكّم بسببٍ إلزامي**", async () => {
    // C اعتُمد لمحكّمَيه في اختبار الإقفال؛ يكفي فحص الرفض بلا سبب على ورقةٍ قائمة.
    const { error } = await as(ADMIN, `select public.fn_judge_approve($1, $2, $3, null)`, [sessionId, part.A, J2]);
    expect(error).toMatch(/اذكر سبب الاعتماد عن المحكّم/);
  });

  it("**لا إعادة حسمٍ بعد الإسناد — والتصحيح فرديٌّ بسبب**", async () => {
    const again = await as(ADMIN, `select * from public.fn_apply_sorting($1, '{}'::jsonb)`, [finalId]);
    expect(again.error).toMatch(/لا يُعاد الحسم/);
    const noReason = await as(ADMIN, `select public.fn_set_qualification($1, $2, true, '')`, [finalId, part.B]);
    expect(noReason.error).toMatch(/اذكر سبب التصحيح/);
    const ok = await as(ADMIN, `select public.fn_set_qualification($1, $2, true, 'اعتراضٌ قُبل')`, [finalId, part.B]);
    expect(ok.error).toBeNull();
    const row = await one(`select decision, decision_source, decision_reason from public.exam_eligibility where exam_id = $1 and participant_id = $2`, [
      finalId,
      part.B,
    ]);
    expect(row).toEqual({ decision: true, decision_source: "correction", decision_reason: "اعتراضٌ قُبل" });
    // ومن قُيِّم لا يُصحَّح.
    expect((await as(ADMIN, `select public.fn_set_qualification($1, $2, false, 'خطأ')`, [finalId, part.A])).error).toMatch(/بدأ تحكيمه/);
  });

  it("**السحب الشفهي الناقص يُرفض باسم صاحبه، وإعادة السحب والاستبدال لمن لم يُقيَّم**", async () => {
    // B صار متأهلاً بالتصحيح؛ لقطته ١٠٠٪ = ٢٠ وحدة، والبنك الشفهي خمسة أسئلة والمطلوب ٣.
    const moved = await as(ADMIN, `select public.fn_move_participant($1, $2)`, [sessionId, part.B]);
    expect(moved.error).toBeNull();
    const before = (await one(`select question_ids from public.session_participants where session_id = $1 and participant_id = $2 and deleted_at is null`, [sessionId, part.B])).question_ids as string[];
    expect((await as(ADMIN, `select public.fn_replace_oral_question($1, $2, $3)`, [sessionId, part.B, before[0]])).error).toBeNull();
    const after = (await one(`select question_ids from public.session_participants where session_id = $1 and participant_id = $2 and deleted_at is null`, [sessionId, part.B])).question_ids as string[];
    expect(after).not.toContain(before[0]);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect((await as(ADMIN, `select public.fn_redraw_oral($1, $2)`, [sessionId, part.B])).error).toBeNull();
    // الشفهي يُطلب منه أكثر مما في البنك: يُرفض باسمه.
    await as(ADMIN, `select public.fn_override_exam_settings($1, '{"question_count": 9}'::jsonb, 'تجربة النقص')`, [finalId]);
    const short = await as(ADMIN, `select public.fn_redraw_oral($1, $2)`, [sessionId, part.B]);
    expect(short.error).toMatch(/أسئلة الشفهي لا تكفي حساب \d+ \(الأول\): \d+ من 9/);
    await as(ADMIN, `select public.fn_override_exam_settings($1, '{"question_count": 3}'::jsonb, 'إرجاع')`, [finalId]);
  });

  it("**اللجنة لا تتجاوز عددها، وإخراج المحكّم بسببٍ يُبقي معتمَده**", async () => {
    // اللجنة J1 وJ2 = judge_count ٢: الثالث يُرفض.
    await db.query(`insert into public.user_roles (user_id, role_id) select $1, role_id from public.user_roles where user_id = $2 limit 1`, [NOJ, J1]);
    expect((await as(ADMIN, `select public.fn_set_session_judge($1, $2, true)`, [sessionId, NOJ])).error).toMatch(/اكتملت اللجنة/);
    // J2 قيّم A واعتمد: إخراجه بلا سبب يُرفض، وبسببٍ يُبقي درجة A.
    expect((await as(ADMIN, `select public.fn_set_session_judge($1, $2, false)`, [sessionId, J2])).error).toMatch(/اذكر سبب إخراجه/);
    expect((await as(ADMIN, `select public.fn_set_session_judge($1, $2, false, 'مرض')`, [sessionId, J2])).error).toBeNull();
    const a = await as<{ participant_id: string; percent: string | null }>(ADMIN, `select participant_id, percent from public.fn_final_scores($1)`, [finalId]);
    expect(a.rows.find((r) => r.participant_id === part.A)!.percent).not.toBeNull();
  });

  it("**وقت الحسم لا يُكتب إلا من الحسم** — إفراغه يفتح ما أقفله", async () => {
    const { error } = await as(ADMIN, `update public.exams set sorted_at = null where id = $1`, [finalId]);
    expect(error).toMatch(/لا يُكتب إلا من الحسم/);
  });

  it("**لا تقييم زائد بعد اكتمال العدد من غيره**", async () => {
    // A اعتمده J1 وJ2 (العدد ٢)؛ أُخرج J2 فيما سبق، ويُضاف بديلٌ يحاول تقييمه.
    await as(ADMIN, `select public.fn_set_session_judge($1, $2, true)`, [sessionId, NOJ]);
    const q = (await one(`select question_ids[1] q from public.session_participants where session_id = $1 and participant_id = $2 and deleted_at is null`, [sessionId, part.A])).q;
    const { error } = await as(NOJ, `select public.fn_judge_mark($1, $2, $3, '{}'::uuid[])`, [sessionId, part.A, q]);
    expect(error).toMatch(/اكتمل تقييم هذا المشارك|لست محكّماً/);
  });

  it("**ولا كتابة مباشرة** في التقييمات", async () => {
    const { error } = await as(J1, `update public.judge_evaluations set approved_at = null`);
    expect(error).toMatch(/permission denied/);
  });
});
