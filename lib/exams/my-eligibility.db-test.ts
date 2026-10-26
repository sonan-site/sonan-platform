import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * حالة التأهل للمشارك (خطة دليل المشارك · هـ): `fn_my_eligibility` تعرض القرار المسجَّل وإلا المحسوب
 * مبدئياً — بين لحظة الأهلية وحسم الفرز — بمعادلة الفرز نفسها (`fn_eligibility_eval`).
 */

let db: Client;
const OWNER = "00000000-0000-4000-8000-000000000e41";
const OTHER = "00000000-0000-4000-8000-000000000e42";
const MANAGER = "00000000-0000-4000-8000-000000000e43";

type Row = {
  exam_name: string;
  eligible: boolean;
  decided: boolean;
  percent: string;
  entry_percentage: string;
  prerequisite_name: string | null;
  prerequisite_passed: boolean;
};

async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error: string | null }> {
  await db.query("savepoint s");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const { rows } = await db.query(sql, params);
    await db.query("reset role");
    await db.query("release savepoint s");
    return { rows: rows as T[], error: null };
  } catch (error) {
    await db.query("rollback to savepoint s");
    await db.query("reset role");
    return { rows: [], error: (error as Error).message };
  }
}

const mine = (uid: string) => as<Row>(uid, `select * from public.fn_my_eligibility($1)`, [participantId]);

let program: string;
let participantId: string;
let finalId: string;
let midId: string;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  await db.query("begin");
  for (const [i, uid] of [OWNER, OTHER, MANAGER].entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [uid, `my-elig-${i}@test.local`]);
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, 'حساب')`, [uid]);
  }
  const role = (await db.query(`insert into public.roles (name) values ('مدير اختبارات التأهل') returning id`)).rows[0].id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'exams.manage')`, [role]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [MANAGER, role]);
  const section = (await db.query(`insert into public.sections (name) values ('قسم التأهل') returning id`)).rows[0].id;
  program = (await db.query(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج التأهل', 'my-elig') returning id`, [section])).rows[0].id;
  const track = (await db.query(`insert into public.tracks (program_id, name) values ($1, 'الأول') returning id`, [program])).rows[0].id;
  participantId = (
    await db.query(`insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`, [OWNER, program, track])
  ).rows[0].id;
  midId = (
    await db.query(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts, opens_at, closes_at)
       values ($1, 'المرحلي', 'remote', 'interim', 80, 5, 60, 0, 3, now() - interval '10 days', now() - interval '1 day') returning id`,
      [program],
    )
  ).rows[0].id;
  finalId = (
    await db.query(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage, entry_percentage, eligibility_at)
       values ($1, 'النهائي', 'oral', 'final', 80, 3, 1, 90, 100, now() + interval '1 day') returning id`,
      [program],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("حالة التأهل", () => {
  it("**لا شيء قبل لحظة الأهلية**", async () => {
    const r = await mine(OWNER);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(0);
  });

  it("**بعدها: المحسوب مبدئياً بأسبابه**", async () => {
    await db.query(`update public.exams set prerequisite_exam_id = $2, eligibility_at = now() - interval '1 hour' where id = $1`, [finalId, midId]);
    const r = await mine(OWNER);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      exam_name: "النهائي",
      eligible: false,
      decided: false,
      prerequisite_name: "المرحلي",
      prerequisite_passed: false,
    });
    expect(Number(r.rows[0]!.percent)).toBe(0);
    expect(Number(r.rows[0]!.entry_percentage)).toBe(100);
  });

  it("**المعادلة واحدة:** ما يكتبه الفرز يطابق ما يقرؤه المشارك", async () => {
    expect((await as(MANAGER, `select * from public.fn_compute_eligibility($1, 0, 40)`, [finalId])).error).toBeNull();
    const row = (
      await db.query(`select percent, prerequisite_passed, eligible from public.exam_eligibility where exam_id = $1 and participant_id = $2`, [finalId, participantId])
    ).rows[0];
    const read = (await mine(OWNER)).rows[0]!;
    expect([Number(row.percent), row.prerequisite_passed, row.eligible]).toEqual([Number(read.percent), read.prerequisite_passed, read.eligible]);
  });

  it("**بعد حساب اللقطة تُعرض اللقطة** — فالحسم يقضي منها لا من حسابٍ جديد", async () => {
    // تغيّر الشرط بعد الحساب (تصحيح درجةٍ مثلاً) يُحاكى بتعديل اللقطة: البطاقة تتبعها.
    await db.query(`update public.exam_eligibility set eligible = true, prerequisite_passed = true where exam_id = $1 and participant_id = $2`, [
      finalId,
      participantId,
    ]);
    expect((await mine(OWNER)).rows[0]).toMatchObject({ eligible: true, decided: false, prerequisite_passed: true });
  });

  it("**القرار المسجَّل يُعرض كما هو** — لا المحسوب", async () => {
    await db.query(
      `update public.exam_eligibility set decision = true, decision_source = 'override', decision_reason = 'اختبار', decided_at = now()
       where exam_id = $1 and participant_id = $2`,
      [finalId, participantId],
    );
    expect((await mine(OWNER)).rows[0]).toMatchObject({ eligible: true, decided: true });
  });

  it("**بعد حسم الفرز تختفي** — فتحلّ بطاقة النهائي محلّها", async () => {
    // حارسٌ يحصر `sorted_at` في الحسم — والحسم خارج هذا الاختبار، فيُكتب الحقل وحده بلا مشغّلات.
    await db.query("savepoint sorted");
    try {
      await db.query("set local session_replication_role = replica");
      await db.query(`update public.exams set sorted_at = now() where id = $1`, [finalId]);
      await db.query("set local session_replication_role = origin");
      expect((await mine(OWNER)).rows).toHaveLength(0);
    } finally {
      await db.query("rollback to savepoint sorted");
    }
  });

  it("**لصاحبها وحده** — وغيره بلا صلاحية يُردّ", async () => {
    expect((await mine(OTHER)).error).toMatch(/لا صلاحية لك على هذه المشاركة/);
    const anon = await db.query("savepoint a").then(async () => {
      try {
        await db.query("set local role anon");
        await db.query(`select * from public.fn_my_eligibility($1)`, [participantId]);
        return null;
      } catch (e) {
        return (e as Error).message;
      } finally {
        await db.query("rollback to savepoint a");
        await db.query("reset role");
      }
    });
    expect(anon).toMatch(/permission denied/);
  });

  it("**المعادلة داخلية** — لا تُستدعى من الواجهة", async () => {
    expect((await as(OWNER, `select * from public.fn_eligibility_eval($1, $2, now())`, [finalId, participantId])).error).toMatch(/permission denied/);
  });
});
