import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * محرّك الاختبار عن بعد (`adr/0048`، الهجرة ٠٧٨).
 *
 * **الاختبار كلّه في معاملة واحدة تُتراجع في آخره:** نسبة الإنجاز تأتي من
 * `fn_progress_at`، وبناء تقدّمٍ حقيقي يحتاج خطةً وأياماً وأوقاتاً. فتُستبدل
 * الدالة داخل المعاملة بنظيرٍ يقرأ نسبةً يضبطها الاختبار — وتغيير البنية في
 * PostgreSQL يُتراجع كالبيانات، فلا يبقى منه شيء. والوقت داخل المعاملة ثابت،
 * فانقضاء السؤال يُحاكى بإرجاع بدايته.
 */

let db: Client;
let n = 0;

const ADMIN = "00000000-0000-4000-8000-000000000e11"; // exams.manage
const PLAYER = "00000000-0000-4000-8000-000000000e12";
const OTHER = "00000000-0000-4000-8000-000000000e13";

let programId: string;
let examId: string;
let participantId: string;
const right = new Map<string, string>(); // سؤال ← خياره الصحيح
const wrong = new Map<string, string>();

/** بهويّة مستخدم داخل المعاملة الكبرى — والخطأ يُتراجع إلى نقطته وحدها. */
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
const progress = (pct: number, units: number) =>
  db.query(`update public.zz_progress set pct = $1, units = $2`, [pct, units]);

type State = {
  status: string;
  index?: number;
  total?: number;
  skips_left?: number;
  question?: { id: string; options: { id: string; text: string }[] };
  percent?: number;
  passed?: boolean;
};

const gate = async (uid = PLAYER) =>
  (await as<{ g: string[] }>(uid, `select public.fn_exam_gate($1) g`, [examId])).rows[0]?.g ?? [];
const start = (uid = PLAYER) => as<{ id: string }>(uid, `select public.fn_start_attempt($1) id`, [examId]);
const stateOf = async (attempt: string, uid = PLAYER) =>
  (await as<{ s: State }>(uid, `select public.fn_attempt_state($1) s`, [attempt])).rows[0]?.s;
const answer = async (attempt: string, q: string, option: string | null) =>
  (await as<{ s: State }>(PLAYER, `select public.fn_answer_question($1, $2, $3::uuid[]) s`, [
    attempt,
    q,
    option ? [option] : [],
  ])).rows[0]!.s;

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
  await db.query("begin");

  // نظير نسبة الإنجاز: يقرأ ما يضبطه الاختبار.
  await db.query(`create table public.zz_progress (pct numeric not null, units int not null)`);
  await db.query(`insert into public.zz_progress values (0, 0)`);
  await db.query(`grant select on public.zz_progress to authenticated`);
  await db.query(`
    create or replace function public.fn_progress_at(p_participant_id uuid, p_at timestamptz)
    returns table (done_days int, day_count int, units int, share_size int, percent numeric, reach_sequence int)
    language sql stable security definer set search_path = ''
    as $f$ select 0, 40, z.units, 10, z.pct, null::int from public.zz_progress z $f$`);

  for (const [i, uid] of [ADMIN, PLAYER, OTHER].entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `remote-${i}@test.local`],
    );
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, 'حساب المحرّك')`, [uid]);
  }
  const role = (await one(`insert into public.roles (name) values ('دور المحرّك') returning id`)).id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'exams.manage')`, [role]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, role]);

  const section = (await one(`insert into public.sections (name) values ('قسم المحرّك') returning id`)).id;
  programId = (
    await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج المحرّك', 'remote-engine') returning id`, [
      section,
    ])
  ).id;
  await db.query(
    `insert into public.content_units (program_id, sequence, label) select $1, g, 'وحدة ' || g from generate_series(1, 10) g`,
    [programId],
  );
  const track = (await one(`insert into public.tracks (program_id, name) values ($1, 'الأول') returning id`, [programId])).id;
  await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 10)`, [track]);
  participantId = (
    await one(
      `insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`,
      [PLAYER, programId, track],
    )
  ).id;

  // ستة أسئلة في الوحدات ١–٦، وسابعٌ في الوحدة ٩ لا يبلغه المشارك.
  for (const unit of [1, 2, 3, 4, 5, 6, 9]) {
    const { rows, error } = await as<{ id: string }>(ADMIN, `select public.fn_save_question($1, null, $2::jsonb) id`, [
      programId,
      JSON.stringify({
        unit_sequence: unit,
        text: `سؤال الوحدة ${unit}`,
        type: "single",
        options: [
          { text: "صحيح", correct: true },
          { text: "خطأ", correct: false },
        ],
      }),
    ]);
    if (error) throw new Error(error);
    const opts = await db.query(`select id, is_correct from public.question_options where question_id = $1`, [rows[0]!.id]);
    right.set(rows[0]!.id, opts.rows.find((o) => o.is_correct).id);
    wrong.set(rows[0]!.id, opts.rows.find((o) => !o.is_correct).id);
  }

  // سؤالٌ شفهيٌّ مفتوح في نطاقه: لا يدخل المرحلي أبداً.
  {
    const { error } = await as(ADMIN, `select public.fn_save_question($1, null, $2::jsonb)`, [
      programId,
      JSON.stringify({ unit_sequence: 2, text: "سمّع الحديث الثاني", usage: "oral", answer: "نصّه" }),
    ]);
    if (error) throw new Error(error);
  }

  examId = (
    await one(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count,
                                 seconds_per_question, max_skips, max_attempts, entry_percentage)
       values ($1, 'المرحلي', 'remote', 'interim', 80, 3, 60, 1, 2, 75) returning id`,
      [programId],
    )
  ).id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("البوّابة", () => {
  it("**دون نسبة الدخول يُمنع برسالته** — وبها يُفتح", async () => {
    await progress(50, 5);
    expect((await gate()).join(" ")).toMatch(/بإنجاز 75٪ .* إنجازك الآن 50٪/);
    expect((await start()).error).toMatch(/بإنجاز 75٪/);
    await progress(80, 6);
    expect(await gate()).toEqual([]);
  });

  it("وغير المسجّل لا يدخل", async () => {
    expect(await gate(OTHER)).toEqual(["لست مسجّلاً في هذا البرنامج"]);
  });
});

describe("المحاولة", () => {
  let attempt: string;

  it("**الأسئلة من نطاقه وحده، والصحيح لا يُرسل**", async () => {
    const started = await start();
    expect(started.error).toBeNull();
    attempt = started.rows[0]!.id;
    expect((await start()).rows[0]!.id).toBe(attempt); // البدء الثاني يستأنف

    const ids: string[] = (await one(`select question_ids from public.remote_attempts where id = $1`, [attempt])).question_ids;
    const units = await db.query(
      `select u.sequence from public.questions q join public.content_units u on u.id = q.content_unit_id where q.id = any($1::uuid[])`,
      [ids],
    );
    expect(units.rows.every((r) => r.sequence <= 6)).toBe(true);
    const open = await db.query(`select count(*)::int n from public.questions where id = any($1::uuid[]) and question_type = 'open'`, [ids]);
    expect(open.rows[0].n).toBe(0);

    const s = (await stateOf(attempt))!;
    expect(s).toMatchObject({ status: "open", index: 1, total: 3, skips_left: 1 });
    expect(JSON.stringify(s)).not.toMatch(/is_correct|correct/);
  });

  it("**وغيره لا يقرأ محاولته**", async () => {
    const { error } = await as(OTHER, `select public.fn_attempt_state($1)`, [attempt]);
    expect(error).toMatch(/المحاولة غير موجودة/);
  });

  it("**جوابٌ عن غير السؤال الجاري لا يُحسب**", async () => {
    const s = (await stateOf(attempt))!;
    const other = [...right.keys()].find((q) => q !== s.question!.id)!;
    const after = await answer(attempt, other, right.get(other)!);
    expect(after.index).toBe(1);
    expect((after as State & { late?: boolean }).late).toBe(true); // يُعلَم به المشارك
  });

  it("**التخطّي ضمن حدّه** يبدّل السؤال، والثاني يُرفض", async () => {
    const s = (await stateOf(attempt))!;
    const skipped = await as<{ s: State }>(PLAYER, `select public.fn_skip_question($1, $2) s`, [attempt, s.question!.id]);
    expect(skipped.error).toBeNull();
    const next = skipped.rows[0]!.s;
    expect(next.question!.id).not.toBe(s.question!.id);
    expect(next.skips_left).toBe(0);
    const again = await as(PLAYER, `select public.fn_skip_question($1, $2)`, [attempt, next.question!.id]);
    expect(again.error).toMatch(/استنفدت حدّ التخطّي/);
  });

  it("**السؤال المنقضي يُغلق بلا جواب** عند أول طلبٍ تالٍ", async () => {
    let s = (await stateOf(attempt))!;
    s = await answer(attempt, s.question!.id, right.get(s.question!.id)!); // ١ صحيح
    expect(s.index).toBe(2);
    await db.query(`update public.remote_attempts set current_started_at = now() - interval '70 seconds' where id = $1`, [
      attempt,
    ]);
    const late = s.question!.id;
    s = await answer(attempt, late, right.get(late)!); // بعد وقته: لا يُحسب
    expect(s.index).toBe(3);
    const row = await one(`select answered_at from public.remote_answers where attempt_id = $1 and question_id = $2`, [
      attempt,
      late,
    ]);
    expect(row.answered_at).toBeNull();
  });

  it("**التسليم والنتيجة:** سؤالان من ثلاثة = 66.7٪ دون الاجتياز", async () => {
    const s = (await stateOf(attempt))!;
    const done = await answer(attempt, s.question!.id, right.get(s.question!.id)!);
    expect(done).toMatchObject({ status: "submitted", passed: false });
    expect(Number(done.percent)).toBe(66.7);
  });

  it("**السؤال المستعمَل لا يُعدَّل** — يُؤرشف", async () => {
    const used: string = (await one(`select question_ids[1] q from public.remote_attempts where id = $1`, [attempt])).q;
    const edit = await as(ADMIN, `select public.fn_save_question($1, $2, $3::jsonb)`, [
      programId,
      used,
      JSON.stringify({ unit_sequence: 1, text: "تعديل", type: "true_false", tf_answer: "صح" }),
    ]);
    expect(edit.error).toMatch(/استُعمل هذا السؤال/);
    const archive = await as(ADMIN, `update public.questions set deleted_at = now() where id = $1`, [used]);
    expect(archive.error).toBeNull();
  });

  it("**المحاولة الثانية ثم النفاد** — والمعتدّ أعلاهما", async () => {
    const second = await start();
    expect(second.error).toBeNull();
    const id2 = second.rows[0]!.id;
    expect(id2).not.toBe(attempt);
    // التنوّع: ما لم يُسأل أولاً — في النطاق ما يكفي فلا تكرار.
    const overlap = await one(
      `select cardinality(array(select unnest(a.question_ids) intersect select unnest(b.question_ids))) n
       from public.remote_attempts a, public.remote_attempts b where a.id = $1 and b.id = $2`,
      [attempt, id2],
    );
    expect(overlap.n).toBe(0);
    let s = (await stateOf(id2))!;
    while (s.status === "open") s = await answer(id2, s.question!.id, wrong.get(s.question!.id)!);
    expect(Number(s.percent)).toBe(0);

    expect(await gate()).toEqual(["استنفدت محاولاتك"]);
    const best = await one(`select best_percent, passed, attempts from public.fn_exam_best($1, $2)`, [examId, participantId]);
    expect({ best: Number(best.best_percent), passed: best.passed, attempts: best.attempts }).toEqual({
      best: 66.7,
      passed: false,
      attempts: 2,
    });
  });

  it("**النتائج لمدير الاختبارات وحده**", async () => {
    const mine = await as<{ best_percent: string }>(ADMIN, `select best_percent from public.fn_exam_results($1)`, [examId]);
    expect(mine.rows.map((r) => Number(r.best_percent))).toEqual([66.7]);
    expect((await as(PLAYER, `select * from public.fn_exam_results($1)`, [examId])).error).toMatch(/لا تملك/);
  });

  it("**«اختباراتي» لصاحب المشاركة وحده** — بمحاولاته وموانعه", async () => {
    const mine = await as<{ name: string; attempts: number; passed: boolean; blockers: string[] }>(
      PLAYER,
      `select name, attempts, passed, blockers from public.fn_my_exams($1)`,
      [participantId],
    );
    expect(mine.rows).toEqual([{ name: "المرحلي", attempts: 2, passed: false, blockers: ["استنفدت محاولاتك"] }]);
    expect((await as(OTHER, `select * from public.fn_my_exams($1)`, [participantId])).rows).toHaveLength(0);
  });

  it("**«اختباراتي» لا تُحسب قبل النافذة بأسبوع**", async () => {
    const names = async () =>
      (await as<{ name: string }>(PLAYER, `select name from public.fn_my_exams($1)`, [participantId])).rows.map((r) => r.name);
    await db.query(`update public.exams set opens_at = now() + interval '10 days', closes_at = now() + interval '17 days' where id = $1`, [examId]);
    expect(await names()).toEqual([]);
    await db.query(`update public.exams set opens_at = now() + interval '3 days' where id = $1`, [examId]);
    expect(await names()).toEqual(["المرحلي"]);
  });

  it("**تغطية البنك لكل مسار ضمن نطاق الدخول**", async () => {
    const { rows } = await as<{ scope_units: number; available: number; needed: number }>(
      ADMIN,
      `select scope_units, available, needed from public.fn_bank_coverage($1) where exam_id = $2`,
      [programId, examId],
    );
    // المسار عشر وحدات، والدخول ٧٥٪ ← أول ثماني. والصالح للمرحلي ستةٌ في ١–٦ (المفتوح والتاسعة خارجه، وواحدٌ مؤرشف).
    // والمطلوب = الأسئلة + حدّ التخطّي (٠٨٦).
    expect(rows[0]).toEqual({ scope_units: 8, available: 5, needed: 4 });
  });

  it("**الإعدادات المقفلة بعد البدء** — والمخرج الرجعي بسببٍ مدقَّق", async () => {
    const change = await as(ADMIN, `update public.exams set pass_percentage = 70 where id = $1`, [examId]);
    expect(change.error).toMatch(/بدأ الاختبار: تغيير «نسبة الاجتياز»/);
    expect((await as(ADMIN, `update public.exams set name = 'المرحلي' where id = $1`, [examId])).error).toBeNull();
    expect((await as(ADMIN, `update public.exams set exam_type = 'oral' where id = $1`, [examId])).error).toMatch(/لا يتغيّران/);
    expect(
      (await as(ADMIN, `select public.fn_override_exam_settings($1, '{"pass_percentage": 70}'::jsonb, '')`, [examId])).error,
    ).toMatch(/اذكر سبب/);
    const ok = await as(ADMIN, `select public.fn_override_exam_settings($1, '{"pass_percentage": 70}'::jsonb, 'خطأٌ في الإدخال')`, [
      examId,
    ]);
    expect(ok.error).toBeNull();
    const audit = await one(
      `select after ->> 'reason' reason, before ->> 'pass_percentage' was from public.audit_log
       where action = 'exam_settings_changed' and entity_id = $1 order by created_at desc limit 1`,
      [examId],
    );
    expect(audit).toEqual({ reason: "خطأٌ في الإدخال", was: "80.00" });
    expect(
      (await as<{ locked: boolean }>(ADMIN, `select locked from public.fn_exam_lock_state($1) where exam_id = $2`, [programId, examId]))
        .rows[0]!.locked,
    ).toBe(true);
    await as(ADMIN, `select public.fn_override_exam_settings($1, '{"pass_percentage": 80}'::jsonb, 'إرجاع التجربة')`, [examId]);
  });

  it("**المهلة ثابتة، والمنقضية مسلَّمةٌ حكماً، والجواب بعدها مرفوض**", async () => {
    const exam2 = (
      await one(
        `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts)
         values ($1, 'تجربة المهلة', 'remote', 'interim', 50, 2, 60, 0, 3) returning id`,
        [programId],
      )
    ).id;
    const started = await as<{ id: string }>(PLAYER, `select public.fn_start_attempt($1) id`, [exam2]);
    expect(started.error).toBeNull();
    const att = started.rows[0]!.id;
    const deadline = async () => (await one(`select public.fn_attempt_deadline($1) d`, [att])).d as Date | null;
    expect(await deadline()).toBeNull(); // بلا إغلاق لا مهلة

    await db.query(`update public.exams set closes_at = now() + interval '1 hour' where id = $1`, [exam2]);
    const d1 = await deadline();
    let s = (await stateOf(att))!;
    s = await answer(att, s.question!.id, right.get(s.question!.id)!);
    expect(await deadline()).toEqual(d1); // لا تتحرك بالإجابة

    // بدأها قبل ساعة وأُغلقت النافذة: انقضت مهلتها.
    await db.query(`update public.exams set closes_at = now() - interval '1 day' where id = $1`, [exam2]);
    await db.query(`update public.remote_attempts set started_at = now() - interval '1 hour' where id = $1`, [att]);
    const best = await one(`select attempts, best_percent from public.fn_exam_best($1, $2)`, [exam2, participantId]);
    expect(Number(best.best_percent)).toBe(50); // مسلَّمةٌ حكماً بما أُجيب
    const late = await answer(att, s.question!.id, right.get(s.question!.id)!);
    expect(late).toMatchObject({ status: "submitted", late: true });
    expect((await one(`select submitted_at is not null sealed from public.remote_attempts where id = $1`, [att])).sealed).toBe(true);
  });

  it("**تمديد النافذة لا يُحيي محاولةً مهجورة** — تُختم بالإغلاق القديم", async () => {
    const exam3 = (
      await one(
        `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts, closes_at)
         values ($1, 'تجربة التمديد', 'remote', 'interim', 50, 2, 60, 0, 3, now() - interval '1 day') returning id`,
        [programId],
      )
    ).id;
    const qs = [...right.keys()].slice(0, 2);
    const att = (
      await one(
        `insert into public.remote_attempts (exam_id, participant_id, attempt_no, question_ids, started_at)
         values ($1, $2, 1, $3::uuid[], now() - interval '2 days') returning id`,
        [exam3, participantId, qs],
      )
    ).id;
    await db.query(`update public.exams set closes_at = now() + interval '7 days' where id = $1`, [exam3]);
    const row = await one(`select submitted_at is not null sealed from public.remote_attempts where id = $1`, [att]);
    expect(row.sealed).toBe(true);
  });

  it("**ولا كتابة مباشرة** في المحاولات", async () => {
    const { error } = await as(PLAYER, `update public.remote_attempts set skips_used = 0 where id = $1`, [attempt]);
    expect(error).toMatch(/permission denied/);
  });
});
