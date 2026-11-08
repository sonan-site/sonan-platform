import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * المساعد (adr/0057): الإجابات المعتمدة لا يقرؤها الزائر · مصادره للخادم وحده · التقرير
 * محجوبٌ بلا هوية ويمحو ما انقضى · الحلّ ذرّي · حامل programs.write في نطاقه وحده ·
 * الحال وحدها تُحدَّث.
 */

let db: Client;
const WRITER = "00000000-0000-4000-8000-000000000a71";
const OTHER_WRITER = "00000000-0000-4000-8000-000000000a72";
const NOBODY = "00000000-0000-4000-8000-000000000a73";
const USERS = [WRITER, OTHER_WRITER, NOBODY];

let programA: string;
let programB: string;
let draftProgram: string;

async function as<T = Record<string, unknown>>(
  role: "anon" | "authenticated" | "service_role",
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null }> {
  await db.query("savepoint s");
  try {
    await db.query(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(uid ? { sub: uid, role } : { role }),
    ]);
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

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const report = (program: string, kind: string, question: string, answer: string | null = null, audience = "visitor") =>
  as<{ id: string }>("service_role", null, `select public.fn_ask_report($1, $2, $3, $4, $5) id`, [
    program,
    kind,
    audience,
    question,
    answer,
  ]);

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  await db.query("begin");
  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `ask-${i}@test.local`,
    ]);
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, $2)`, [uid, `حساب ${i}`]);
  }
  const section = (await one(`insert into public.sections (name) values ('قسم المساعد') returning id`)).id;
  programA = (
    await one(
      `insert into public.programs (section_id, name, slug, status) values ($1, 'برنامج أ', 'ask-a', 'published') returning id`,
      [section],
    )
  ).id;
  programB = (
    await one(
      `insert into public.programs (section_id, name, slug, status) values ($1, 'برنامج ب', 'ask-b', 'published') returning id`,
      [section],
    )
  ).id;
  draftProgram = (
    await one(`insert into public.programs (section_id, name, slug) values ($1, 'مسوّدة', 'ask-draft') returning id`, [section])
  ).id;

  const role = (await one(`insert into public.roles (name) values ('محرّر المساعد') returning id`)).id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'programs.write')`, [role]);
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [WRITER, role, programA]);
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [
    OTHER_WRITER,
    role,
    programB,
  ]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("الإجابات المعتمدة", () => {
  it("**حامل programs.write يكتبها في نطاقه وحده**", async () => {
    const ok = await as("authenticated", WRITER, `insert into public.ask_answers (program_id, question, answer) values ($1, 'هل التسجيل مجاني؟', 'نعم، مجاني.') returning id`, [programA]);
    expect(ok.error).toBeNull();
    const out = await as("authenticated", WRITER, `insert into public.ask_answers (program_id, question, answer) values ($1, 'سؤال', 'جواب') returning id`, [programB]);
    expect(out.error).not.toBeNull();
    const none = await as("authenticated", NOBODY, `select id from public.ask_answers where program_id = $1`, [programA]);
    expect(none.rows).toHaveLength(0);
  });

  it("**الزائر لا يقرؤها، ولا مصادر المساعد**", async () => {
    expect((await as("anon", null, `select id from public.ask_answers`)).error).not.toBeNull();
    expect((await as("anon", null, `select * from public.fn_ask_sources($1)`, [programA])).error).not.toBeNull();
    expect((await as("authenticated", WRITER, `select * from public.fn_ask_sources($1)`, [programA])).error).not.toBeNull();
  });

  it("والخادم يقرأ المنشور وحده لبرنامجٍ منشور", async () => {
    await db.query(`insert into public.ask_answers (program_id, question, answer, status) values ($1, 'مسوّدة', 'لا تظهر', 'draft')`, [programA]);
    await db.query(`insert into public.ask_answers (program_id, question, answer) values ($1, 'سؤال', 'لبرنامج غير منشور')`, [draftProgram]);
    const a = await as<{ question: string }>("service_role", null, `select question from public.fn_ask_sources($1)`, [programA]);
    expect(a.rows.map((r) => r.question)).toEqual(["هل التسجيل مجاني؟"]);
    const d = await as("service_role", null, `select * from public.fn_ask_sources($1)`, [draftProgram]);
    expect(d.rows).toHaveLength(0);
  });
});

describe("الإعداد", () => {
  it("**الخادم يقرأ المفتاح والنموذج بالدالّة — و settings مغلقٌ دونه**", async () => {
    const c = await as<{ enabled: boolean; model: string }>("service_role", null, `select * from public.fn_ask_config()`);
    expect(c.error).toBeNull();
    expect(c.rows[0]).toEqual({ enabled: true, model: "claude-haiku-5-5" });
    expect((await as("service_role", null, `select value from public.settings where key = 'ask.enabled'`)).error).not.toBeNull();
  });

  it("والزائر والمستخدم لا يستدعيانها", async () => {
    expect((await as("anon", null, `select * from public.fn_ask_config()`)).error).not.toBeNull();
    expect((await as("authenticated", WRITER, `select * from public.fn_ask_config()`)).error).not.toBeNull();
  });
});

describe("التقارير", () => {
  it("**لا إدراج مباشر — ولا لحامل الصلاحية**", async () => {
    const r = await as("authenticated", WRITER, `insert into public.ask_reports (program_id, kind, audience, question) values ($1, 'unanswered', 'visitor', 'س')`, [programA]);
    expect(r.error).not.toBeNull();
    expect((await report(programA, "unanswered", "سؤال")).error).toBeNull();
    const anon = await as("anon", null, `select public.fn_ask_report($1, 'unanswered', 'visitor', 'س', null)`, [programA]);
    expect(anon.error).not.toBeNull();
    const user = await as("authenticated", WRITER, `select public.fn_ask_report($1, 'unanswered', 'visitor', 'س', null)`, [programA]);
    expect(user.error).not.toBeNull();
  });

  it("**يُحجب الجوال والبريد والهوية قبل الحفظ**", async () => {
    const r = await report(programA, "flagged", "جوالي 0551234567 وبريدي a@b.co وهويتي 1012345678، عمر ابني 9", "تواصل على 0553088688");
    const row = await one(`select question, answer from public.ask_reports where id = $1`, [r.rows[0]!.id]);
    expect(row.question).toBe("جوالي [محجوب] وبريدي [محجوب] وهويتي [محجوب]، عمر ابني 9");
    expect(row.answer).toBe("تواصل على [محجوب]");
  });

  it("لا تقرير لبرنامجٍ غير منشور", async () => {
    expect((await report(draftProgram, "unanswered", "سؤال")).error).not.toBeNull();
  });

  it("**الحال وحدها تُحدَّث، وفي النطاق وحده**", async () => {
    const id = (await report(programA, "unanswered", "سؤال للإغلاق")).rows[0]!.id;
    const text = await as("authenticated", WRITER, `update public.ask_reports set question = 'معدّل' where id = $1`, [id]);
    expect(text.error).not.toBeNull();
    const other = await as("authenticated", OTHER_WRITER, `update public.ask_reports set status = 'dismissed' where id = $1 returning id`, [id]);
    expect(other.rows).toHaveLength(0);
    const ok = await as("authenticated", WRITER, `update public.ask_reports set status = 'dismissed' where id = $1 returning id`, [id]);
    expect(ok.rows).toHaveLength(1);
  });

  it("**يُمحى ما انقضت مدّته: آخر موعدٍ + ٣٠ يوماً**", async () => {
    const old = (await report(programB, "unanswered", "قديم")).rows[0]!.id;
    await db.query(
      `insert into public.program_schedule (program_id, title, starts_on, ends_on) values ($1, 'الختام', current_date - 40, current_date - 31)`,
      [programB],
    );
    const fresh = (await report(programB, "unanswered", "جديد")).rows[0]!.id;
    const left = await db.query(`select id from public.ask_reports where program_id = $1`, [programB]);
    // البرنامج انقضى موعده الأخير بأكثر من ٣٠ يوماً: يُمحى كل تقريره، ومنه الجديد.
    expect(left.rows.map((r) => r.id)).not.toContain(old);
    expect(left.rows.map((r) => r.id)).not.toContain(fresh);
  });

  it("وبلا مواعيد: ٩٠ يوماً من الإنشاء", async () => {
    const old = (await report(programA, "unanswered", "قديم جداً")).rows[0]!.id;
    await db.query(`update public.ask_reports set created_at = now() - interval '91 days' where id = $1`, [old]);
    const recent = (await report(programA, "unanswered", "حديث")).rows[0]!.id;
    const ids = (await db.query(`select id from public.ask_reports where program_id = $1`, [programA])).rows.map((r) => r.id);
    expect(ids).not.toContain(old);
    expect(ids).toContain(recent);
  });
});

describe("الحلّ والعدّاد", () => {
  it("**الحلّ ينشئ إجابةً منشورة ويغلق التقرير معاً**", async () => {
    const id = (await report(programA, "flagged", "متى الاختبار؟", "غداً")).rows[0]!.id;
    const r = await as<{ a: string }>("authenticated", WRITER, `select public.fn_ask_resolve($1, 'متى الاختبار المرحلي؟', 'يبدأ 1 ديسمبر.') a`, [id]);
    expect(r.error).toBeNull();
    const rep = await one(`select status, resolved_answer_id from public.ask_reports where id = $1`, [id]);
    expect(rep.status).toBe("resolved");
    const ans = await one(`select status, origin, program_id from public.ask_answers where id = $1`, [rep.resolved_answer_id]);
    expect(ans).toEqual({ status: "published", origin: "flagged", program_id: programA });
    // لا حلّ مرّتين.
    expect((await as("authenticated", WRITER, `select public.fn_ask_resolve($1, 'س', 'ج')`, [id])).error).not.toBeNull();
  });

  it("**ولا يحلّ أحدٌ تقرير برنامجٍ لا يملكه**", async () => {
    const id = (await report(programA, "unanswered", "سؤال آخر")).rows[0]!.id;
    expect((await as("authenticated", OTHER_WRITER, `select public.fn_ask_resolve($1, 'س', 'ج')`, [id])).error).not.toBeNull();
    expect((await as("authenticated", NOBODY, `select * from public.fn_ask_overview($1)`, [programA])).error).not.toBeNull();
  });

  it("والعدّاد يعدّ المفتوح بأنواعه", async () => {
    const r = await as<{ open_unanswered: number; open_flagged: number }>(
      "authenticated",
      WRITER,
      `select open_unanswered, open_flagged from public.fn_ask_overview($1)`,
      [programA],
    );
    expect(r.error).toBeNull();
    expect(r.rows[0]!.open_unanswered).toBeGreaterThanOrEqual(1);
  });
});
