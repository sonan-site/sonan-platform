import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * النتائج والجوائز والنشر (`adr/0048` هـ، الهجرة ٠٨٨ · المراجعة §١١).
 *
 * في معاملة واحدة تُتراجع في آخره. الدرجات تُصاغ بتقييماتٍ مكتوبة مباشرةً
 * (سؤالان من ١٠ لكل مشارك، ولجنةٌ من اثنين) — فالنسبة = الإجمالي ÷ ٢٠.
 */

let db: Client;
let n = 0;

const ADMIN = "00000000-0000-4000-8000-000000000f01"; // exams.manage
const PUB = "00000000-0000-4000-8000-000000000f02"; // exams.publish
const PW = "00000000-0000-4000-8000-000000000f03"; // participants.write + read
const J1 = "00000000-0000-4000-8000-000000000f04"; // exams.judge
const J2 = "00000000-0000-4000-8000-000000000f05"; // exams.judge
const U = Array.from({ length: 9 }, (_, i) => `00000000-0000-4000-8000-0000000f01${String(i + 10)}`);

let programId: string;
let examId: string;
let t1: string;
let t2: string;
let session: string;
let session2: string;
let stray: string;
let questions: string[];
const crit: Record<number, string> = {};
const p: Record<string, string> = {};

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

/** كتابةٌ بلا مستخدم تُتوقَّع أن تُرفض — تُستعاد المعاملة بعدها. */
async function raw(sql: string, params: unknown[] = []): Promise<string | null> {
  const sp = `sp${++n}`;
  await db.query(`savepoint ${sp}`);
  try {
    await db.query(sql, params);
    await db.query(`release savepoint ${sp}`);
    return null;
  } catch (error) {
    await db.query(`rollback to savepoint ${sp}`);
    return (error as Error).message;
  }
}

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

/** تقييمٌ معتمد من محكّم: خصمٌ لكل سؤال بقيم المعايير المعطاة. */
async function evaluate(who: string, judge: string, deductions: number[][]) {
  const ev = (
    await one(
      `insert into public.judge_evaluations (session_id, judge_id, participant_id, approved_at) values ($1, $2, $3, now()) returning id`,
      [session, judge, p[who]],
    )
  ).id;
  for (const [i, q] of questions.entries()) {
    const ans = (await one(`insert into public.evaluation_answers (evaluation_id, question_id) values ($1, $2) returning id`, [ev, q])).id;
    for (const v of deductions[i] ?? []) {
      await db.query(`insert into public.evaluation_deductions (evaluation_answer_id, criterion_id) values ($1, $2)`, [ans, crit[v]]);
    }
  }
  return ev;
}
const both = async (who: string, deductions: number[][]) => {
  await evaluate(who, J1, deductions);
  await evaluate(who, J2, deductions);
};
const assign = (who: string, order: number) =>
  db.query(`insert into public.session_participants (session_id, participant_id, sort_order, question_ids) values ($1, $2, $3, $4::uuid[])`, [
    session,
    p[who],
    order,
    questions,
  ]);

type Row = {
  participant_id: string;
  percent: string | null;
  outcome: string;
  candidate: boolean;
  needs_tiebreak: boolean;
  place: number | null;
  prize_value: string | null;
  assigned: boolean;
};
const standings = async (track = t1) => {
  const { rows, error } = await as<Row>(ADMIN, `select * from public.fn_track_standings($1, $2)`, [examId, track]);
  if (error) throw new Error(error);
  return Object.fromEntries(Object.entries(p).map(([k, id]) => [k, rows.find((r) => r.participant_id === id)]));
};
const approve = (track = t1) => as<{ n: number }>(ADMIN, `select public.fn_approve_track_results($1, $2) n`, [examId, track]);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
  await db.query("begin");

  for (const [i, uid] of [ADMIN, PUB, PW, J1, J2, ...U].entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `results-${i}@test.local`,
    ]);
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, $2, $3)`, [uid, `حساب ${i}`, `+96650000${String(1000 + i)}`]);
  }
  const role = async (codes: string[], members: string[]) => {
    const id = (await one(`insert into public.roles (name) values ($1) returning id`, [`دور ${codes.join("-")}`])).id;
    for (const c of codes) await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [id, c]);
    for (const m of members) await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [m, id]);
  };
  await role(["exams.manage"], [ADMIN]);
  await role(["exams.publish", "participants.read"], [PUB]);
  await role(["participants.write", "participants.read"], [PW]);
  await role(["exams.judge"], [J1, J2]);

  const section = (await one(`insert into public.sections (name) values ('قسم النتائج') returning id`)).id;
  programId = (
    await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج النتائج', 'results-test') returning id`, [section])
  ).id;
  await db.query(`insert into public.content_units (program_id, sequence, label) select $1, g, 'وحدة ' || g from generate_series(1, 4) g`, [
    programId,
  ]);
  t1 = (await one(`insert into public.tracks (program_id, name, sort_order) values ($1, 'الأول', 1) returning id`, [programId])).id;
  t2 = (await one(`insert into public.tracks (program_id, name, sort_order) values ($1, 'الثاني', 2) returning id`, [programId])).id;

  questions = [];
  for (const seq of [1, 2]) {
    const unit = (await one(`select id from public.content_units where program_id = $1 and sequence = $2`, [programId, seq])).id;
    questions.push(
      (
        await one(
          `insert into public.questions (program_id, content_unit_id, text, usage, score, correct_answer_text, question_type)
           values ($1, $2, $3, 'oral', 10, 'ج', 'open') returning id`,
          [programId, unit, `سؤال ${seq}`],
        )
      ).id,
    );
  }
  for (const v of [0.5, 1, 2, 3]) {
    crit[v] = (
      await one(`insert into public.deduction_criteria (program_id, label, deduction_value) values ($1, $2, $3) returning id`, [
        programId,
        `خصم ${v}`,
        v,
      ])
    ).id;
  }

  examId = (
    await one(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage,
                                 entry_percentage, eligibility_at)
       values ($1, 'النهائي', 'oral', 'final', 80, 2, 2, 90, 100, now() - interval '1 day') returning id`,
      [programId],
    )
  ).id;

  // ثمانيةٌ في الأول وواحدٌ في الثاني — متأهّلون بحسمٍ مكتوب مباشرة.
  const keys = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "Q1"];
  for (const [i, key] of keys.entries()) {
    const track = key === "Q1" ? t2 : t1;
    p[key] = (
      await one(
        `insert into public.participants (user_id, program_id, track_id, status, registration_no) values ($1, $2, $3, 'qualified', $4) returning id`,
        [U[i], programId, track, i + 1],
      )
    ).id;
    await db.query(
      `insert into public.exam_eligibility (exam_id, participant_id, percent, units, prerequisite_passed, eligible, computed_at,
                                            decision, decision_source, decided_at)
       values ($1, $2, 100, 4, true, true, now(), true, 'auto', now())`,
      [examId, p[key]],
    );
  }
  await db.query(`select set_config('app.exam_sorting', $1, true)`, [examId]);
  await db.query(`update public.exams set sorted_at = now() where id = $1`, [examId]);
  await db.query(`select set_config('app.exam_sorting', '', true)`);

  session = (
    await one(`insert into public.exam_sessions (exam_id, name, scheduled_at, location) values ($1, 'الأولى', now(), 'القاعة') returning id`, [
      examId,
    ])
  ).id;
  for (const [i, key] of ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "Q1"].entries()) await assign(key, i + 1);

  await both("P1", [[], []]); // ١٠٠
  await both("P2", [[1], []]); // ٩٥
  await both("P3", [[], [1]]); // ٩٥
  await both("P4", [[1, 0.5], []]); // ٩٢٫٥
  await both("P5", [[3], []]); // ٨٥
  await both("P6", [[3], [3]]); // ٧٠
  await both("Q1", [[], []]); // ١٠٠
  // تقييمٌ غير معتمد زائد (محكّمٌ بدأ ثم اكتملت اللجنة من غيره) — لا يدخل الدرجة.
  stray = (
    await one(`insert into public.judge_evaluations (session_id, judge_id, participant_id) values ($1, $2, $3) returning id`, [session, ADMIN, p.P1])
  ).id;
  session2 = (
    await one(`insert into public.exam_sessions (exam_id, name, scheduled_at, location) values ($1, 'التعويض', now(), 'القاعة') returning id`, [examId])
  ).id;

  const prizes = (track: string, values: string[]) =>
    db.query(`insert into public.page_blocks (program_id, block_type, sort_order, content) values ($1, 'prizes', 1, $2::jsonb)`, [
      programId,
      JSON.stringify({ heading: "الجوائز", trackId: track, places: values.map((v, i) => ({ label: `المركز ${i + 1}`, value: v })), note: "" }),
    ]);
  await prizes(t1, ["5000", "3000", "1000"]);
  await prizes(t2, ["5000"]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("الترتيب", () => {
  it("**النتيجة والترشيح والمركز** — والتعادل على المراكز يُعلَّم", async () => {
    const s = await standings();
    expect(s.P1).toMatchObject({ percent: "100.00", outcome: "passed", candidate: true, place: 1, prize_value: "5000" });
    expect(s.P2).toMatchObject({ percent: "95.00", candidate: true, needs_tiebreak: true, place: null });
    expect(s.P3).toMatchObject({ needs_tiebreak: true, place: null });
    expect(s.P4).toMatchObject({ percent: "92.50", candidate: true, needs_tiebreak: false, place: null }); // الرابع خارج المراكز الثلاثة
    expect(s.P5).toMatchObject({ outcome: "passed", candidate: false });
    expect(s.P6).toMatchObject({ outcome: "not_passed", candidate: false });
    expect(s.P7).toMatchObject({ outcome: "pending", assigned: true });
    expect(s.P8).toMatchObject({ outcome: "pending", assigned: false });
  });

  it("**المحكّم لا يرى الترتيب ولا جداول النتائج**", async () => {
    expect((await as(J1, `select * from public.fn_track_standings($1, $2)`, [examId, t1])).error).toMatch(/لا تملك عرض النتائج/);
    expect((await as(J1, `select * from public.fn_final_scores($1)`, [examId])).error).toMatch(/لا تملك عرض الدرجات/);
  });
});

describe("الاعتماد بشروطه", () => {
  it("**يرفض متأهّلاً بلا إسناد، ثم بلا درجة، ثم تعادلاً بلا حسم**", async () => {
    expect((await approve()).error).toMatch(/لم يُسنَد 1/);
    await assign("P8", 9);
    expect((await approve()).error).toMatch(/لم تكتمل درجة 2/);
  });

  it("**الغياب:** بسبب، ولا لمن قُيِّم، والغائب لا يُحكَّم", async () => {
    expect((await as(ADMIN, `select public.fn_mark_absent($1, $2, true, 'غاب')`, [session, p.P1])).error).toMatch(/قُيِّم في الجلسة/);
    expect((await as(ADMIN, `select public.fn_mark_absent($1, $2, true, '')`, [session, p.P7])).error).toMatch(/اذكر السبب/);
    for (const k of ["P7", "P8"]) {
      expect((await as(ADMIN, `select public.fn_mark_absent($1, $2, true, 'لم يحضر')`, [session, p[k]])).error).toBeNull();
    }
    expect(await raw(`insert into public.judge_evaluations (session_id, judge_id, participant_id) values ($1, $2, $3)`, [session, J1, p.P7])).toMatch(
      /لا يُحكَّم/,
    );
    // التعويض: نقله لجلسةٍ أخرى يُلغي غيابه — ثم يُسجَّل غيابه فيها ثانيةً لبقية الاختبار.
    expect((await as(ADMIN, `select public.fn_move_participant($1, $2)`, [session2, p.P8])).error).toBeNull();
    expect((await standings()).P8!.outcome).toBe("pending");
    expect((await as(ADMIN, `select public.fn_mark_absent($1, $2, true, 'لم يحضر التعويض')`, [session2, p.P8])).error).toBeNull();
    const s = await standings();
    expect(s.P7!.outcome).toBe("absent");
    expect((await approve()).error).toMatch(/تعادلٌ يمسّ المراكز بلا حسم/);
  });

  it("**الحسم:** المتعادلون كلهم مرةً واحدة، ثم يُرتَّبون به", async () => {
    const rec = (ordered: string[], percent = 95) =>
      as(ADMIN, `select public.fn_record_tiebreak($1, $2, $3, $4::uuid[], 'إعادة اختبار ١٢ ديسمبر', '')`, [examId, t1, percent, ordered]);
    expect((await rec([p.P2!]))).toMatchObject({ error: expect.stringMatching(/رتّب المتعادلين كلهم/) });
    expect((await rec([p.P2!, p.P2!]))).toMatchObject({ error: expect.stringMatching(/رتّب المتعادلين كلهم/) });
    expect((await rec([p.P1!, p.P2!], 100))).toMatchObject({ error: expect.stringMatching(/لا تعادل/) });
    expect((await as(J1, `select public.fn_record_tiebreak($1, $2, 95, $3::uuid[], 'سبب', '')`, [examId, t1, [p.P3, p.P2]])).error).toMatch(
      /لا تملك/,
    );
    expect((await rec([p.P3!, p.P2!])).error).toBeNull();
    const s = await standings();
    expect(s.P3).toMatchObject({ place: 2, prize_value: "3000", needs_tiebreak: false });
    expect(s.P2).toMatchObject({ place: 3, prize_value: "1000" });
  });

  it("**الحسم يبطل إن تغيّرت مجموعته** — ويعود صالحاً بعودتها", async () => {
    // يصير الرابع ٩٥ فتتسع المجموعة ثلاثة.
    const d = await one(
      `select d.id from public.evaluation_deductions d join public.deduction_criteria c on c.id = d.criterion_id
       join public.evaluation_answers ea on ea.id = d.evaluation_answer_id join public.judge_evaluations je on je.id = ea.evaluation_id
       where je.participant_id = $1 and c.deduction_value = 0.5 and je.judge_id = $2`,
      [p.P4, J1],
    );
    await db.query(`update public.evaluation_deductions set deleted_at = now() where id = $1`, [d.id]);
    await db.query(
      `update public.evaluation_deductions set deleted_at = now() where id = (
         select d.id from public.evaluation_deductions d join public.deduction_criteria c on c.id = d.criterion_id
         join public.evaluation_answers ea on ea.id = d.evaluation_answer_id join public.judge_evaluations je on je.id = ea.evaluation_id
         where je.participant_id = $1 and c.deduction_value = 0.5 and je.judge_id = $2)`,
      [p.P4, J2],
    );
    let s = await standings();
    expect([s.P2!.needs_tiebreak, s.P3!.needs_tiebreak, s.P4!.needs_tiebreak]).toEqual([true, true, true]);
    await db.query(
      `update public.evaluation_deductions d set deleted_at = null from public.deduction_criteria c, public.evaluation_answers ea, public.judge_evaluations je
       where c.id = d.criterion_id and ea.id = d.evaluation_answer_id and je.id = ea.evaluation_id and je.participant_id = $1 and c.deduction_value = 0.5`,
      [p.P4],
    );
    s = await standings();
    expect(s.P3!.place).toBe(2);
  });

  it("**النظرة العامة** تعدّ ما ينقص كل مسار", async () => {
    const { rows, error } = await as<{ track_id: string; qualified: number; scored: number; absent: number; ties: number; places: number }>(
      ADMIN,
      `select * from public.fn_results_overview($1)`,
      [examId],
    );
    expect(error).toBeNull();
    expect(rows.find((r) => r.track_id === t1)).toMatchObject({ qualified: 8, scored: 6, absent: 2, ties: 0, places: 3 });
    expect(rows.find((r) => r.track_id === t2)).toMatchObject({ qualified: 1, places: 1 });
    expect((await as(J1, `select * from public.fn_results_overview($1)`, [examId])).error).toMatch(/لا تملك عرض النتائج/);
  });

  it("**يرفض بلا عنصر جوائزٍ صالح للمسار، وبعنصرين**", async () => {
    const block = (await one(`select id from public.page_blocks where program_id = $1 and content ->> 'trackId' = $2`, [programId, t1])).id;
    await db.query(`update public.page_blocks set deleted_at = now() where id = $1`, [block]);
    expect((await approve()).error).toMatch(/لا عنصر جوائز لهذا المسار/);
    await db.query(`update public.page_blocks set deleted_at = null where id = $1`, [block]);
    const dup = (
      await one(
        `insert into public.page_blocks (program_id, block_type, sort_order, content) select program_id, block_type, 2, content from public.page_blocks where id = $1 returning id`,
        [block],
      )
    ).id;
    expect((await approve()).error).toMatch(/أكثر من عنصر جوائز/);
    await db.query(`delete from public.page_blocks where id = $1`, [dup]);
  });

  it("**يعتمد ويجمّد** النتيجة والمركز والجائزة والعتبتين", async () => {
    expect((await as(PUB, `select public.fn_approve_track_results($1, $2)`, [examId, t1])).error).toMatch(/لا تملك اعتماد/);
    const { rows, error } = await approve();
    expect(error).toBeNull();
    expect(rows[0]!.n).toBe(8);
    const r = await db.query(`select participant_id, outcome, place, prize_value from public.exam_results where exam_id = $1 and track_id = $2`, [
      examId,
      t1,
    ]);
    const by = Object.fromEntries(r.rows.map((x) => [x.participant_id, x]));
    expect(by[p.P3!]).toMatchObject({ place: 2, prize_value: "3000" });
    expect(by[p.P7!]).toMatchObject({ outcome: "absent", place: null });
    expect((await approve()).error).toMatch(/اعتُمدت نتائج هذا المسار/);
  });
});

describe("القفل بعد الاعتماد", () => {
  it("**لا تعليم ولا اعتماد ولا غياب ولا نقل ولا تصحيح**", async () => {
    const ans = (
      await one(
        `select ea.id from public.evaluation_answers ea join public.judge_evaluations je on je.id = ea.evaluation_id where je.participant_id = $1 limit 1`,
        [p.P1],
      )
    ).id;
    expect(await raw(`insert into public.evaluation_deductions (evaluation_answer_id, criterion_id) values ($1, $2)`, [ans, crit[3]])).toMatch(
      /اعتُمدت نتائج مساره/,
    );
    expect(await raw(`update public.judge_evaluations set approved_at = null where participant_id = $1`, [p.P1])).toMatch(/اعتُمدت نتائج مساره/);
    expect((await as(ADMIN, `select public.fn_mark_absent($1, $2, false, 'خطأ')`, [session, p.P7])).error).toMatch(/اعتُمدت نتائج مساره/);
    expect((await as(ADMIN, `select public.fn_set_qualification($1, $2, false, 'تصحيح')`, [examId, p.P8])).error).toMatch(
      /اعتُمدت نتائج مساره/,
    );
    expect((await as(ADMIN, `select public.fn_record_tiebreak($1, $2, 95, $3::uuid[], 'سبب', '')`, [examId, t1, [p.P2, p.P3]])).error).toMatch(
      /اعتُمدت نتائج المسار/,
    );
  });

  it("**أرشفة تقييمٍ غير معتمد تمرّ** (إخراج محكّم) — ولا تمسّ المعتمَد", async () => {
    expect(await raw(`update public.judge_evaluations set deleted_at = now() where id = $1`, [stray])).toBeNull();
  });

  it("**المحكّم والمشارك لا يقرآن جداول النتائج مباشرة**", async () => {
    for (const who of [J1, U[0]!]) {
      const { rows } = await as(who, `select * from public.exam_results where exam_id = $1`, [examId]);
      expect(rows).toHaveLength(0);
    }
    expect((await as(ADMIN, `select * from public.exam_results where exam_id = $1`, [examId])).rows).toHaveLength(8);
  });

  it("**إعدادات الدرجة لا تتغيّر — ولا بالمخرج الإداري**", async () => {
    expect(await raw(`update public.exams set award_percentage = 85 where id = $1`, [examId])).toMatch(/اسحب الاعتماد|بدأ الاختبار/);
    expect((await as(ADMIN, `select public.fn_override_exam_settings($1, '{"pass_percentage": 70}'::jsonb, 'تعديل')`, [examId])).error).toMatch(
      /اسحب الاعتماد/,
    );
  });

  it("**المعتمَد لا ينسحب**", async () => {
    expect((await as(U[0]!, `select public.fn_withdraw_participation($1)`, [p.P1])).error).toMatch(/لا ينسحب ولا يُحذف حتى تُنشر/);
  });

  it("**لا تُحذف جلسةٌ فيها مشاركون**", async () => {
    expect(await raw(`update public.exam_sessions set deleted_at = now() where id = $1`, [session])).toMatch(/انقلهم أولاً/);
  });
});

describe("النشر", () => {
  it("**المشارك لا يرى نتيجته قبل النشر** — ويرى جلسته", async () => {
    const { rows } = await as<{ qualified: boolean; session_name: string; published: boolean; outcome: string | null }>(
      U[0]!,
      `select * from public.fn_my_final($1)`,
      [p.P1],
    );
    expect(rows[0]).toMatchObject({ qualified: true, session_name: "الأولى", published: false, outcome: null });
    expect((await as(U[1]!, `select * from public.fn_my_final($1)`, [p.P1])).rows).toHaveLength(0);
  });

  it("**النشر لحامل `exams.publish` وحده، والكلّ يشترط اعتماد كل المسارات**", async () => {
    expect((await as(ADMIN, `select public.fn_publish_results($1, $2)`, [examId, t1])).error).toMatch(/لا تملك نشر/);
    expect((await as(PUB, `select public.fn_publish_results($1)`, [examId])).error).toMatch(/لم تُعتمد نتائج كل المسارات/);
    expect((await as(PUB, `select public.fn_publish_results($1, $2)`, [examId, t2])).error).toMatch(/لم تُعتمد/);
  });

  it("**النشر يكتب الحالة ويُظهر النتيجة لصاحبها**", async () => {
    const before = (await one(`select judge_from from public.participants where id = $1`, [p.P3])).judge_from;
    expect((await as(PUB, `select public.fn_publish_results($1, $2)`, [examId, t1])).error).toBeNull();
    const st = await db.query(`select id, status from public.participants where id = any($1::uuid[])`, [Object.values(p)]);
    const by = Object.fromEntries(st.rows.map((r) => [r.id, r.status]));
    expect([by[p.P1!], by[p.P5!], by[p.P6!], by[p.P7!], by[p.Q1!]]).toEqual(["passed", "passed", "not_passed", "not_passed", "qualified"]);
    const { rows } = await as<{ percent: string; place: number; prize_value: string }>(U[2]!, `select * from public.fn_my_final($1)`, [p.P3]);
    expect(rows[0]).toMatchObject({ percent: "95.00", place: 2, prize_value: "3000" });

    expect((await as(ADMIN, `select public.fn_withdraw_track_results($1, $2, 'خطأ')`, [examId, t1])).error).toMatch(/اسحب النشر أولاً/);
    expect((await as(PUB, `select public.fn_unpublish_results($1, $2, 'خطأ في الحسم')`, [examId, t1])).error).toBeNull();
    const after = await one(`select status, judge_from from public.participants where id = $1`, [p.P3]);
    expect(after.status).toBe("qualified");
    expect(after.judge_from).toEqual(before); // سحب النشر لا يعيد ضبط لحظة البدء
    expect((await as<{ published: boolean }>(U[2]!, `select * from public.fn_my_final($1)`, [p.P3])).rows[0]!.published).toBe(false);
  });

  it("**التصدير:** للمعتمَد، بلا جوالٍ لمن لا يقرأ المشاركين، ومدقَّق", async () => {
    const { rows, error } = await as<{ full_name: string; phone: string | null; place: number | null }>(
      ADMIN,
      `select * from public.fn_export_results($1)`,
      [examId],
    );
    expect(error).toBeNull();
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.phone === null)).toBe(true);
    expect(rows[0]!.place).toBe(1);
    const audit = await one(`select count(*)::int c from public.audit_log where action = 'exam_results_exported' and entity_id = $1`, [examId]);
    expect(audit.c).toBe(1);
    expect((await as(J1, `select * from public.fn_export_results($1)`, [examId])).error).toMatch(/لا تملك تصدير/);
    const withPhones = await as<{ phone: string | null }>(PUB, `select * from public.fn_export_results($1)`, [examId]);
    expect(withPhones.rows.every((r) => r.phone !== null)).toBe(true);
  });

  it("**النشر للكلّ ذرّيٌّ بعد اعتماد كل المسارات** — وإعادته بلا أثر، وبعده يُغلق الحساب", async () => {
    expect((await approve(t2)).error).toBeNull();
    const all = await as<{ n: number }>(PUB, `select public.fn_publish_results($1) n`, [examId]);
    expect(all.error).toBeNull();
    expect(all.rows[0]!.n).toBe(2);
    expect((await as<{ n: number }>(PUB, `select public.fn_publish_results($1) n`, [examId])).rows[0]!.n).toBe(0);
    expect((await one(`select status from public.participants where id = $1`, [p.Q1])).status).toBe("passed");
    // بعد النشر النتيجة محفوظة في اللقطة — فالانسحاب يمرّ.
    expect((await as(U[0]!, `select public.fn_withdraw_participation($1)`, [p.P1])).error).toBeNull();
    expect((await as(ADMIN, `select count(*)::int c from public.fn_export_results($1)`, [examId])).rows[0]).toMatchObject({ c: 9 });
  });
});

describe("حالة المشارك ومساره", () => {
  it("**الكتابة المباشرة لا تتجاوز التسجيل والحفظ**", async () => {
    const fresh = (
      await one(`insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`, [J2, programId, t2])
    ).id;
    expect((await as(PW, `update public.participants set status = 'not_qualified' where id = $1`, [fresh])).error).toMatch(/حالات المسابقة/);
    expect((await as(PW, `update public.participants set status = 'memorizing' where id = $1`, [p.P5])).error).toMatch(/حالات المسابقة|من نشر النتائج/);
    // الكتابة المباشرة يردّها حارس طلب التغيير — وحارس الحسم يردّ الدوالّ (تطبيق طلب التغيير) كذلك.
    expect((await as(PW, `update public.participants set track_id = $2 where id = $1`, [p.P5, t2])).error).toMatch(/طلب تغييره/);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
    expect(await raw(`update public.participants set track_id = $2 where id = $1`, [p.P5, t2])).toMatch(/لا يتغيّر مساره/);
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  });

  it("**لا «متأهل» بلا لقطة أهلية**", async () => {
    const lone = (
      await one(`insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`, [
        PW,
        programId,
        t2,
      ])
    ).id;
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
    expect(await raw(`update public.participants set status = 'qualified' where id = $1`, [lone])).toMatch(/لا لقطة أهلية له/);
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  });

  it("**الاجتياز لا يُكتب إلا من النشر — ولو من دالّة**", async () => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
    expect(await raw(`update public.participants set status = 'passed' where id = $1`, [p.P6])).toMatch(/من نشر النتائج وحده/);
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  });

  it("**أهلية الجائزة لا تنزل عن الاجتياز**", async () => {
    expect(
      await raw(
        `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage)
         values ($1, 'خطأ', 'oral', 'final', 90, 2, 2, 80)`,
        [programId],
      ),
    ).toMatch(/chk_exams_award_over_pass/);
  });
});
