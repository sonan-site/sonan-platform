import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

/**
 * م١ (مراجعة ١١ أكتوبر): مدير اختباراتٍ لا يقرأ المشاركين يحسب الأهلية.
 * **على المحرّك الحقيقي بلا نظير** — النظير هو ما أخفى الخلل أول مرّة.
 * والأهلية تمرّ بـ`fn_progress_at_unchecked` بعد فحص `exams.manage`، والعامّة باقيةٌ محروسة.
 */

let db: Client;
const MANAGER = "00000000-0000-4000-8000-000000000e31";
const PLAYER = "00000000-0000-4000-8000-000000000e32";

async function as(uid: string, sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  await db.query("savepoint s");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const { rows } = await db.query(sql, params);
    await db.query("reset role");
    await db.query("release savepoint s");
    return { rows, error: null };
  } catch (error) {
    await db.query("rollback to savepoint s");
    await db.query("reset role");
    return { rows: [], error: (error as Error).message };
  }
}

let examId: string;
let participantId: string;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  await db.query("begin");
  for (const [i, uid] of [MANAGER, PLAYER].entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [uid, `elig-access-${i}@test.local`]);
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, 'حساب')`, [uid]);
  }
  const role = (await db.query(`insert into public.roles (name) values ('مدير اختبارات وحده') returning id`)).rows[0].id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'exams.manage')`, [role]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [MANAGER, role]);
  const section = (await db.query(`insert into public.sections (name) values ('قسم الوصول') returning id`)).rows[0].id;
  const program = (await db.query(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج الوصول', 'elig-access') returning id`, [section])).rows[0].id;
  const track = (await db.query(`insert into public.tracks (program_id, name) values ($1, 'الأول') returning id`, [program])).rows[0].id;
  participantId = (
    await db.query(`insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`, [PLAYER, program, track])
  ).rows[0].id;
  examId = (
    await db.query(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage, entry_percentage)
       values ($1, 'النهائي', 'oral', 'final', 80, 3, 1, 90, 100) returning id`,
      [program],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

it("**مدير الاختبارات وحده يحسب الأهلية على المحرّك الحقيقي**", async () => {
  const { rows, error } = await as(MANAGER, `select * from public.fn_compute_eligibility($1, 0, 40)`, [examId]);
  expect(error).toBeNull();
  expect(rows[0]).toEqual({ computed: 1, total: 1 });
});

it("**والعامّة باقيةٌ محروسة** — لا يقرأ بها إنجاز المشارك", async () => {
  const { error } = await as(MANAGER, `select * from public.fn_progress_at($1, now())`, [participantId]);
  expect(error).toMatch(/لا صلاحية لك على هذه المشاركة/);
  expect((await as(MANAGER, `select * from public.fn_progress_at_unchecked($1, now())`, [participantId])).error).toMatch(/permission denied/);
});
