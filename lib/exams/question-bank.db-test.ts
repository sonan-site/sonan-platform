import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * بنك الأسئلة وإعدادات الاختبار (`adr/0048`، الهجرة ٠٧٧).
 *
 * البنك سرٌّ إلا عن مدير الاختبارات · السؤال وخياراته يُكتبان معاً متّسقين
 * · الاستيراد كلّه أو لا شيء برقم سطره · والإعدادات تتبع نوع الاختبار.
 */

let db: Client;
const roles: string[] = [];
let sectionId: string;
let programId: string;
let otherProgramId: string;

const MANAGER = "00000000-0000-4000-8000-000000000e01"; // exams.manage
const JUDGE = "00000000-0000-4000-8000-000000000e02"; // exams.judge
const READER = "00000000-0000-4000-8000-000000000e03"; // programs.read
const USERS = [MANAGER, JUDGE, READER];

async function as<T extends Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null }> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const { rows } = await db.query<T>(sql, params);
    await db.query("commit");
    return { rows, error: null };
  } catch (error) {
    await db.query("rollback");
    return { rows: [], error: (error as Error).message };
  }
}

async function grantRole(uid: string, codes: string[]) {
  const role = (
    await db.query<{ id: string }>(`insert into public.roles (name) values ($1) returning id`, [
      `دور البنك ${uid.slice(-2)}`,
    ])
  ).rows[0]!.id;
  roles.push(role);
  for (const code of codes) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [role, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [uid, role]);
}

const save = (uid: string, q: Record<string, unknown>, questionId: string | null = null) =>
  as<{ id: string }>(uid, `select public.fn_save_question($1, $2, $3::jsonb) as id`, [
    programId,
    questionId,
    JSON.stringify(q),
  ]);

const single = (over: Record<string, unknown> = {}) => ({
  unit_sequence: 1,
  text: "من راوي حديث «إنما الأعمال بالنيات»؟",
  type: "single",
  score: 2,
  answer: "عمر بن الخطاب",
  options: [
    { text: "عمر بن الخطاب", correct: true },
    { text: "أبو هريرة", correct: false },
  ],
  ...over,
});

const countQuestions = async () =>
  Number(
    (await db.query(`select count(*) n from public.questions where program_id = $1 and deleted_at is null`, [programId]))
      .rows[0].n,
  );

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `bank-${i}@test.local`],
    );
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, 'حساب البنك')`, [uid]);
  }
  await grantRole(MANAGER, ["exams.manage"]);
  await grantRole(JUDGE, ["exams.judge"]);
  await grantRole(READER, ["programs.read"]);

  sectionId = (await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم البنك') returning id`))
    .rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug) values ($1, 'برنامج البنك', 'bank-test') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  otherProgramId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug) values ($1, 'برنامج آخر', 'bank-other') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.content_units (program_id, sequence, label)
     select $1, g, 'وحدة ' || g from generate_series(1, 5) as g`,
    [programId],
  );
});

afterAll(async () => {
  const programs = [programId, otherProgramId];
  await db.query(
    `delete from public.question_options where question_id in (select id from public.questions where program_id = any($1::uuid[]))`,
    [programs],
  );
  await db.query(`delete from public.deduction_criteria where program_id = any($1::uuid[])`, [programs]);
  await db.query(`delete from public.questions where program_id = any($1::uuid[])`, [programs]);
  await db.query(`update public.exams set prerequisite_exam_id = null where program_id = any($1::uuid[])`, [programs]);
  await db.query(`delete from public.exams where program_id = any($1::uuid[])`, [programs]);
  await db.query(`delete from public.content_units where program_id = any($1::uuid[])`, [programs]);
  await db.query(`delete from public.programs where id = any($1::uuid[])`, [programs]);
  await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.user_roles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [roles]);
  await db.query(`delete from public.roles where id = any($1::uuid[])`, [roles]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.end();
});

describe("حفظ السؤال", () => {
  it("**مدير الاختبارات يحفظ سؤالاً بخياراته ويقرؤه**", async () => {
    const { rows, error } = await save(MANAGER, single());
    expect(error).toBeNull();
    const read = await as<{ text: string; is_correct: boolean }>(
      MANAGER,
      `select o.text, o.is_correct from public.question_options o where o.question_id = $1 and o.deleted_at is null
       order by o.sort_order`,
      [rows[0]!.id],
    );
    expect(read.rows).toEqual([
      { text: "عمر بن الخطاب", is_correct: true },
      { text: "أبو هريرة", is_correct: false },
    ]);
  });

  it("**صح/خطأ يولّد خياريه** من الجواب", async () => {
    const { rows, error } = await save(MANAGER, { ...single(), type: "true_false", tf_answer: "خطأ", options: [] });
    expect(error).toBeNull();
    const { rows: opts } = await db.query(
      `select text, is_correct from public.question_options where question_id = $1 order by sort_order`,
      [rows[0]!.id],
    );
    expect(opts).toEqual([
      { text: "صح", is_correct: false },
      { text: "خطأ", is_correct: true },
    ]);
  });

  it("**الاتساق مفروض:** المفرد بصحيحٍ واحد، والمتعدّد بصحيحٍ على الأقل، والخيارات ٢–٦", async () => {
    const twoRight = single({
      options: [
        { text: "أ", correct: true },
        { text: "ب", correct: true },
      ],
    });
    expect((await save(MANAGER, twoRight)).error).toMatch(/جوابٌ صحيح واحد/);
    expect((await save(MANAGER, { ...twoRight, type: "multiple" })).error).toBeNull();
    const noneRight = single({ type: "multiple", options: [{ text: "أ" }, { text: "ب" }] });
    expect((await save(MANAGER, noneRight)).error).toMatch(/على الأقل/);
    expect((await save(MANAGER, single({ options: [{ text: "أ", correct: true }] }))).error).toMatch(/من خيارين/);
  });

  it("والوحدة من مادة البرنامج وحدها", async () => {
    expect((await save(MANAGER, single({ unit_sequence: 99 }))).error).toMatch(/رقم الوحدة 99/);
  });

  it("**والتعديل يستبدل الخيارات** ولا يُبقي القديمة حيّة", async () => {
    const { rows } = await save(MANAGER, single());
    const id = rows[0]!.id;
    const edited = await save(
      MANAGER,
      single({ options: [{ text: "ج", correct: true }, { text: "د" }, { text: "هـ" }] }),
      id,
    );
    expect(edited.error).toBeNull();
    const { rows: live } = await db.query(
      `select text from public.question_options where question_id = $1 and deleted_at is null order by sort_order`,
      [id],
    );
    expect(live.map((r) => r.text)).toEqual(["ج", "د", "هـ"]);
  });
});

describe("الاستعمال", () => {
  it("**الشفهي مفتوحٌ بجوابٍ للمحكّم** — ويُضبط مفتوحاً ولو أُرسل غيره", async () => {
    const { rows, error } = await save(MANAGER, { unit_sequence: 2, text: "سمّع حديث النية", usage: "oral", type: "single", answer: "إنما الأعمال بالنيات…" });
    expect(error).toBeNull();
    const q = (await db.query(`select question_type, usage from public.questions where id = $1`, [rows[0]!.id])).rows[0];
    expect(q).toEqual({ question_type: "open", usage: "oral" });
    expect((await save(MANAGER, { unit_sequence: 2, text: "سمّع حديث النية", usage: "oral" })).error).toMatch(/اكتب الجواب للمحكّم/);
  });

  it("**صح/خطأ لا يكون شفهياً، والمفتوح لا يكون للمرحلي**", async () => {
    expect((await save(MANAGER, { ...single(), usage: "both", type: "true_false", tf_answer: "صح", options: [] })).error).toMatch(/لا يكون شفهياً/);
    expect((await save(MANAGER, { ...single(), type: "open" })).error).toMatch(/المفتوح للشفهي وحده/);
    expect((await save(MANAGER, single({ usage: "both" }))).error).toBeNull(); // له جواب
    expect((await save(MANAGER, single({ usage: "both", answer: "" }))).error).toMatch(/اكتب الجواب/);
  });

  it("**والقيد يحرس الكتابة المباشرة**", async () => {
    const unit = (await db.query(`select id from public.content_units where program_id = $1 and sequence = 1`, [programId])).rows[0].id;
    const { error } = await as(
      MANAGER,
      `insert into public.questions (program_id, content_unit_id, text, question_type, usage) values ($1, $2, 'سؤال شفهي بلا جواب', 'open', 'oral')`,
      [programId, unit],
    );
    expect(error).toMatch(/chk_questions_oral_answer/);
  });
});

describe("سرّية البنك", () => {
  it("**قارئ البرنامج والمحكّم لا يريان البنك ولا يكتبانه**", async () => {
    expect((await as(READER, `select 1 from public.questions`)).rows).toHaveLength(0);
    expect((await as(JUDGE, `select 1 from public.questions`)).rows).toHaveLength(0);
    expect((await as(JUDGE, `select 1 from public.question_options`)).rows).toHaveLength(0);
    expect((await save(READER, single())).error).toMatch(/لا تملك إدارة بنك الأسئلة/);
  });

  it("**والمحكّم يقرأ معايير الخصم** — يعلّم عليها في شاشته", async () => {
    const added = await as(
      MANAGER,
      `insert into public.deduction_criteria (program_id, label, deduction_value) values ($1, 'تردّد', 0.5)`,
      [programId],
    );
    expect(added.error).toBeNull();
    expect((await as(JUDGE, `select label from public.deduction_criteria where program_id = $1`, [programId])).rows).toEqual([
      { label: "تردّد" },
    ]);
    const forged = await as(
      JUDGE,
      `insert into public.deduction_criteria (program_id, label, deduction_value) values ($1, 'إبدال', 1)`,
      [programId],
    );
    expect(forged.error).toMatch(/row-level security/);
  });
});

describe("الاستيراد", () => {
  it("**كلّه أو لا شيء** — والخطأ برقم سطره في الملف", async () => {
    const before = await countQuestions();
    const rows = [single(), single(), single({ unit_sequence: 77 })];
    const { error } = await as(MANAGER, `select public.fn_import_questions($1, $2::jsonb)`, [
      programId,
      JSON.stringify(rows),
    ]);
    // السطر ١ عناوين، فالثالث في البيانات سطره ٤.
    expect(error).toMatch(/السطر 4: رقم الوحدة 77/);
    expect(await countQuestions()).toBe(before);
  });

  it("والملف السليم يُستورد كاملاً", async () => {
    const before = await countQuestions();
    const { rows, error } = await as<{ n: number }>(MANAGER, `select public.fn_import_questions($1, $2::jsonb) as n`, [
      programId,
      JSON.stringify([single(), single({ unit_sequence: 2 })]),
    ]);
    expect(error).toBeNull();
    expect(rows[0]!.n).toBe(2);
    expect(await countQuestions()).toBe(before + 2);
  });
});

describe("إعدادات الاختبار", () => {
  const remote = () =>
    `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count,
                               seconds_per_question, max_skips, max_attempts, entry_percentage)
     values ($1, 'المرحلي', 'remote', 'interim', 80, 20, 60, 0, 2, 75) returning id`;

  it("**المرحلي بنسبة دخولٍ ومحاولتين** — ومدير الاختبارات يعرّفه", async () => {
    const { rows, error } = await as<{ id: string }>(MANAGER, remote(), [programId]);
    expect(error).toBeNull();
    const oral = await as(
      MANAGER,
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count,
                                 judge_count, award_percentage, entry_percentage, prerequisite_exam_id)
       values ($1, 'النهائي', 'oral', 'final', 80, 15, 3, 90, 100, $2)`,
      [programId, rows[0]!.id],
    );
    expect(oral.error).toBeNull();
  });

  it("**الشفهي لا يحمل محاولاتٍ ولا نافذة** — والإعدادات تتبع النوع", async () => {
    const { error } = await as(
      MANAGER,
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count,
                                 judge_count, award_percentage, max_attempts)
       values ($1, 'شفهي خاطئ', 'oral', 'final', 80, 15, 3, 90, 2)`,
      [programId],
    );
    expect(error).toMatch(/chk_exams_settings_by_type/);
  });

  it("**والاختبار الشرط من البرنامج نفسه**", async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.exams where program_id = $1 and stage = 'interim' limit 1`,
      [programId],
    );
    const direct = await db
      .query(
        `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count,
                                   seconds_per_question, max_skips, max_attempts, prerequisite_exam_id)
         values ($1, 'دخيل', 'remote', 'interim', 80, 20, 60, 0, 1, $2)`,
        [otherProgramId, rows[0]!.id],
      )
      .then(() => null)
      .catch((e: Error) => e.message);
    expect(direct).toMatch(/fk_exams_prerequisite/);
  });
});
