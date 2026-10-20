import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * نطاق أسئلة الاختبار عن بعد وعدم التكرار — الهجرة ٠٩٨ (خطة المدة الثلاثينية · ش٣).
 *
 * كمحرّك الاختبار: كله في معاملة تُتراجع، ونسبة الإنجاز من نظيرٍ يضبطه الاختبار. نصيب المسار عشرون
 * وحدة، ولكل وحدة سؤال يُجاب خطأً فلا يجتاز، والمشارك بلغ ٩٠٪ (١٨ وحدة) — والمرحلي يُدخَل بـ٧٥٪.
 */

let db: Client;
let n = 0;

const ADMIN = "00000000-0000-4000-8000-000000000f11";
const PLAYER = "00000000-0000-4000-8000-000000000f12";

let programId: string;
let examId: string;
let participantId: string;
const unitOf = new Map<string, number>(); // سؤال ← وحدته
const anyOption = new Map<string, string>();

async function as<T extends Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
  const sp = `sp${++n}`;
  await db.query(`savepoint ${sp}`);
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const { rows } = await db.query<T>(sql, params);
    await db.query("reset role");
    await db.query(`release savepoint ${sp}`);
    return { rows, error: null as string | null };
  } catch (error) {
    await db.query(`rollback to savepoint ${sp}`);
    await db.query("reset role");
    return { rows: [] as T[], error: (error as Error).message };
  }
}

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

/** محاولةٌ كاملة يُجاب فيها بأي خيار — وتُرجع وحدات أسئلتها. */
async function attemptUnits(): Promise<number[]> {
  const started = await as<{ id: string }>(PLAYER, `select public.fn_start_attempt($1) id`, [examId]);
  if (started.error) throw new Error(started.error);
  const id = started.rows[0]!.id;
  const ids: string[] = (await one(`select question_ids from public.remote_attempts where id = $1`, [id])).question_ids;
  let s = (await as<{ s: { status: string; question?: { id: string } } }>(PLAYER, `select public.fn_attempt_state($1) s`, [id])).rows[0]!.s;
  while (s.status === "open") {
    const q = s.question!.id;
    s = (
      await as<{ s: { status: string; question?: { id: string } } }>(PLAYER, `select public.fn_answer_question($1, $2, $3::uuid[]) s`, [
        id,
        q,
        [anyOption.get(q)!],
      ])
    ).rows[0]!.s;
  }
  return ids.map((q) => unitOf.get(q)!);
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
  await db.query("begin");

  await db.query(`create table public.zz_scope_progress (pct numeric not null, units int not null)`);
  await db.query(`insert into public.zz_scope_progress values (90, 18)`);
  await db.query(`grant select on public.zz_scope_progress to authenticated`);
  await db.query(`
    create or replace function public.fn_progress_at_unchecked(p_participant_id uuid, p_at timestamptz)
    returns table (done_days int, day_count int, units int, share_size int, percent numeric, reach_sequence int)
    language sql stable security definer set search_path = ''
    as $f$ select 0, 30, z.units, 20, z.pct, null::int from public.zz_scope_progress z $f$`);

  for (const [i, uid] of [ADMIN, PLAYER].entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `scope-${i}@test.local`,
    ]);
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, 'حساب النطاق')`, [uid]);
  }
  const role = (await one(`insert into public.roles (name) values ('دور النطاق') returning id`)).id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'exams.manage')`, [role]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, role]);

  const section = (await one(`insert into public.sections (name) values ('قسم النطاق') returning id`)).id;
  programId = (
    await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج النطاق', 'exam-scope') returning id`, [section])
  ).id;
  await db.query(
    `insert into public.content_units (program_id, sequence, label) select $1, g, 'وحدة ' || g from generate_series(1, 20) g`,
    [programId],
  );
  const track = (await one(`insert into public.tracks (program_id, name) values ($1, 'الأول') returning id`, [programId])).id;
  await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 20)`, [track]);
  participantId = (
    await one(
      `insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`,
      [PLAYER, programId, track],
    )
  ).id;

  for (let unit = 1; unit <= 20; unit++) {
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
    unitOf.set(rows[0]!.id, unit);
    anyOption.set(rows[0]!.id, (await one(`select id from public.question_options where question_id = $1 and not is_correct limit 1`, [rows[0]!.id])).id);
  }

  examId = (
    await one(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count,
                                 seconds_per_question, max_skips, max_attempts, entry_percentage)
       values ($1, 'المرحلي', 'remote', 'interim', 100, 5, 60, 0, 4, 75) returning id`,
      [programId],
    )
  ).id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("نطاق الأسئلة", () => {
  it("**تغطية البنك للإدارة**: النطاق ١–١٥ (٧٥٪ من عشرين) فيه ١٥ سؤالاً، ويلزم ٢٠ لأربع محاولات بلا تكرار", async () => {
    const { rows, error } = await as<{ exam_name: string; scope_units: number; available: number; needed: number }>(
      ADMIN,
      `select exam_name, scope_units, available, needed from public.fn_bank_coverage($1) where exam_id = $2`,
      [programId, examId],
    );
    expect(error).toBeNull();
    expect(rows).toEqual([{ exam_name: "المرحلي", scope_units: 15, available: 15, needed: 20 }]);
  });

  it("**ثلاث محاولات بلا تكرار**، وكل أسئلتها من أول ٧٥٪ — لا ممّا بلغه بعدها (١٦–١٨)", async () => {
    const all = [...(await attemptUnits()), ...(await attemptUnits()), ...(await attemptUnits())];
    expect(all).toHaveLength(15);
    expect(new Set(all).size).toBe(15);
    expect(all.every((u) => u >= 1 && u <= 15)).toBe(true);
  });

  it("**بعد أن رأى النطاق كله** تكتمل الرابعة بالأقل ظهوراً — من النطاق نفسه", async () => {
    const fourth = await attemptUnits();
    expect(fourth).toHaveLength(5);
    expect(new Set(fourth).size).toBe(5);
    expect(fourth.every((u) => u >= 1 && u <= 15)).toBe(true);
  });

  it("**النطاق مقفلٌ بعد أول محاولة**", async () => {
    const r = await as(ADMIN, `update public.exams set scope_from_pct = 10 where id = $1`, [examId]);
    expect(r.error).toMatch(/بداية نطاق الأسئلة/);
  });
});

describe("نطاقٌ مقطعي", () => {
  it("**من ٢٥٪ إلى ٥٠٪** ← الوحدات ٦–١٠ وحدها", async () => {
    const exam2 = (
      await one(
        `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count,
                                   seconds_per_question, max_skips, max_attempts, entry_percentage, scope_from_pct, scope_to_pct)
         values ($1, 'الأول', 'remote', 'interim', 100, 5, 60, 0, 1, 50, 25, 50) returning id`,
        [programId],
      )
    ).id;
    const pool = await db.query<{ u: number }>(
      `select u.sequence u from public.fn_exam_pool($1, $2, '{}') x
       join public.questions q on q.id = x join public.content_units u on u.id = q.content_unit_id order by 1`,
      [exam2, participantId],
    );
    expect(pool.rows.map((r) => r.u)).toEqual([6, 7, 8, 9, 10]);
  });

  it("**النطاق مقصوصٌ بما بلغه**: بلغ ١٢ والنطاق إلى ١٥ ← لا يُسأل عن ١٣–١٥", async () => {
    await db.query(`update public.zz_scope_progress set pct = 60, units = 12`);
    const pool = await db.query<{ u: number }>(
      `select max(u.sequence) u from public.fn_exam_pool($1, $2, '{}') x
       join public.questions q on q.id = x join public.content_units u on u.id = q.content_unit_id`,
      [examId, participantId],
    );
    expect(pool.rows[0]!.u).toBe(12);
  });

  it("القيد: البداية قبل النهاية — على اختبارٍ لم يبدأ", async () => {
    const fresh = (
      await one(
        `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts)
         values ($1, 'جديد', 'remote', 'interim', 80, 5, 60, 0, 1) returning id`,
        [programId],
      )
    ).id;
    const r = await as(ADMIN, `update public.exams set scope_from_pct = 60, scope_to_pct = 40 where id = $1`, [fresh]);
    expect(r.error).toMatch(/chk_exams_scope/);
  });

  it("**نسبة الدخول مقفلةٌ بعد البدء** — هي نهاية النطاق الافتراضية", async () => {
    const r = await as(ADMIN, `update public.exams set entry_percentage = 50 where id = $1`, [examId]);
    expect(r.error).toMatch(/نسبة الدخول/);
  });

  it("**نسبة دخولٍ صفرٌ = بلا شرط** ← النطاق إلى آخر ما بلغه", async () => {
    const zero = (
      await one(
        `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts, entry_percentage)
         values ($1, 'بلا شرط', 'remote', 'interim', 80, 5, 60, 0, 1, 0) returning id`,
        [programId],
      )
    ).id;
    const pool = await db.query<{ u: number }>(
      `select max(u.sequence) u from public.fn_exam_pool($1, $2, '{}') x
       join public.questions q on q.id = x join public.content_units u on u.id = q.content_unit_id`,
      [zero, participantId],
    );
    expect(pool.rows[0]!.u).toBe(12);
  });
});
