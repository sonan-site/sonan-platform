import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * دليل المشارك — قاعدته (الهجرة ١٠٠ · خطة الدليل · ج).
 *
 * كلها في معاملةٍ واحدة تُتراجع في آخرها، وكل قراءةٍ بدورها في نقطة حفظ. برنامجٌ منشور ومسوّدة:
 * سجلّ التحديثات يقرؤه الزائر للمنشور **بلا المحذوف**، والكتابة لحامل programs.write. وإعدادات
 * الاختبارات لا تظهر قبل ضبط موعدها، ولا تُرجع تاريخاً. وأبواب المسار بعدد وحداتها منه.
 */

let db: Client;
let n = 0;
let publishedId: string;
let draftId: string;

const WRITER = "00000000-0000-4000-8000-000000000a71";
const STRANGER = "00000000-0000-4000-8000-000000000a72";

async function as<T extends Record<string, unknown>>(
  role: "anon" | "authenticated",
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null }> {
  const sp = `sp${++n}`;
  await db.query(`savepoint ${sp}`);
  try {
    await db.query(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [uid ? JSON.stringify({ sub: uid, role }) : ""]);
    const { rows } = await db.query<T>(sql, params);
    await db.query("reset role");
    await db.query(`rollback to savepoint ${sp}`);
    return { rows, error: null };
  } catch (error) {
    await db.query(`rollback to savepoint ${sp}`);
    await db.query("reset role");
    return { rows: [], error: (error as Error).message };
  }
}

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
  await db.query("begin");

  for (const [i, uid] of [WRITER, STRANGER].entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `guide-${i}@test.local`,
    ]);
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الدليل', $2)`, [
      uid,
      `+96650000710${i}`,
    ]);
  }
  const role = (await one(`insert into public.roles (name) values ('كاتب الدليل') returning id`)).id;
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [role, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [WRITER, role]);

  const section = (await one(`insert into public.sections (name) values ('قسم الدليل') returning id`)).id;
  const program = async (slug: string) =>
    (await one(`insert into public.programs (section_id, name, slug) values ($1, $2, $3) returning id`, [section, `برنامج ${slug}`, slug])).id;
  publishedId = await program("guide-published-test");
  draftId = await program("guide-draft-test");
  await db.query(`set local session_replication_role = replica`);
  await db.query(`update public.programs set status = 'published' where id = $1`, [publishedId]);
  await db.query(`set local session_replication_role = origin`);

  for (const id of [publishedId, draftId]) {
    await db.query(`insert into public.guide_updates (program_id, entry_date, body) values ($1, '2026-10-20', 'تغيّرت مدة الحفظ إلى ثلاثين يوماً')`, [id]);
    await db.query(
      `insert into public.guide_updates (program_id, entry_date, body, deleted_at) values ($1, '2026-10-21', 'سطرٌ محذوف خطأ', now())`,
      [id],
    );
  }

  // مادةٌ ببابين، ومساران: الأول ١–٤، والثاني ١–٧.
  // الأبواب تُكتب من دالّتها (تولّد الوحدات بأرقامها) — بهوية الكاتب.
  await db.query("set local role authenticated");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: WRITER, role: "authenticated" })]);
  await db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [
    publishedId,
    JSON.stringify([
      { name: "الإيمان", count: 4 },
      { name: "الطهارة", count: 3 },
    ]),
  ]);
  await db.query("reset role");
  // ترتيبٌ صريح: المسارات تُنشأ في معاملةٍ واحدة فيتساوى `created_at` ويضطرب الترتيب.
  for (const [name, to, order] of [
    ["الأول", 4, 0],
    ["الثاني", 7, 1],
  ] as const) {
    const t = (
      await one(`insert into public.tracks (program_id, name, sort_order) values ($1, $2, $3) returning id`, [publishedId, name, order])
    ).id;
    await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, $2)`, [t, to]);
  }

  // اختباران مضبوطان واختبارٌ عن بعد بلا موعد بعد.
  const midterm = (
    await one(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts, entry_percentage, opens_at, closes_at, scope_from_pct)
       values ($1, 'المرحلي', 'remote', 'interim', 80, 20, 60, 1, 3, 75, '2026-10-31 00:00+03', '2026-11-30 00:00+03', 0) returning id`,
      [publishedId],
    )
  ).id;
  await db.query(
    `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage, entry_percentage, prerequisite_exam_id, eligibility_at)
     values ($1, 'النهائي', 'oral', 'final', 80, 15, 2, 90, 100, $2, '2026-11-30 00:00+03')`,
    [publishedId, midterm],
  );
  await db.query(
    `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question, max_skips, max_attempts)
     values ($1, 'مسوّدة اختبار', 'remote', 'interim', 50, 5, 30, 0, 1)`,
    [publishedId],
  );
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("سجل تحديثات الدليل", () => {
  it("**الزائر يقرأ المنشور بلا المحذوف** — ولا يقرأ المسوّدة", async () => {
    const pub = await as<{ body: string }>("anon", null, `select body from public.guide_updates where program_id = $1`, [publishedId]);
    expect(pub.rows.map((r) => r.body)).toEqual(["تغيّرت مدة الحفظ إلى ثلاثين يوماً"]);
    const draft = await as("anon", null, `select body from public.guide_updates where program_id = $1`, [draftId]);
    expect(draft.rows).toHaveLength(0);
  });

  it("**الكتابة لحامل programs.write وحده**", async () => {
    const ok = await as(
      "authenticated",
      WRITER,
      `insert into public.guide_updates (program_id, entry_date, body) values ($1, '2026-10-25', 'أُضيف رابط الدليل') returning id`,
      [publishedId],
    );
    expect(ok.error).toBeNull();
    const no = await as(
      "authenticated",
      STRANGER,
      `insert into public.guide_updates (program_id, entry_date, body) values ($1, '2026-10-25', 'محاولة') returning id`,
      [publishedId],
    );
    expect(no.error).toMatch(/row-level security/);
    const anon = await as("anon", null, `insert into public.guide_updates (program_id, entry_date, body) values ($1, '2026-10-25', 'محاولة')`, [publishedId]);
    expect(anon.error).not.toBeNull();
  });

  it("**الحذف الليّن للكاتب وحده** — والمحذوف يغيب عن الزائر ويبقى للمعاينة", async () => {
    const row = (await one(`select id from public.guide_updates where program_id = $1 and deleted_at is null`, [publishedId])).id;
    const stranger = await as("authenticated", STRANGER, `update public.guide_updates set deleted_at = now() where id = $1 returning id`, [row]);
    expect(stranger.rows).toHaveLength(0);
    const writer = await as<{ id: string }>(
      "authenticated",
      WRITER,
      `with d as (update public.guide_updates set deleted_at = now() where id = $1 returning id)
       select (select count(*) from d)::int n`,
      [row],
    );
    expect(writer.error).toBeNull();
    expect(writer.rows[0]).toEqual({ n: 1 });
    const preview = await as("authenticated", WRITER, `select id from public.guide_updates where program_id = $1`, [publishedId]);
    expect(preview.rows.length).toBe(2);
  });

  it("النصّ مختصر: من ٥ إلى ١٦٠ حرفاً", async () => {
    const r = await as("authenticated", WRITER, `insert into public.guide_updates (program_id, entry_date, body) values ($1, '2026-10-25', 'قصير')`, [publishedId]);
    expect(r.error).toMatch(/chk_guide_updates_body/);
  });
});

describe("إعدادات الاختبارات للعموم", () => {
  it("**بعد ضبط الموعد وحده**، وبحقولٍ مختارة بلا تاريخ", async () => {
    const r = await as<Record<string, unknown>>("anon", null, `select * from public.fn_public_exams($1)`, [publishedId]);
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => x.name)).toEqual(["المرحلي", "النهائي"]);
    const [mid, fin] = r.rows;
    expect({ entry: Number(mid!.entry_percentage), pass: Number(mid!.pass_percentage), attempts: mid!.max_attempts }).toEqual({
      entry: 75,
      pass: 80,
      attempts: 3,
    });
    expect({ pre: fin!.prerequisite_name, award: Number(fin!.award_percentage), attempts: fin!.max_attempts }).toEqual({
      pre: "المرحلي",
      award: 90,
      attempts: null,
    });
    // قائمةٌ مغلقة: حقلٌ يُضاف إلى الدالة يُكشف هنا قبل أن يُنشر للعموم.
    expect(Object.keys(mid!).sort()).toEqual(
      [
        "id", "name", "exam_type", "stage", "track_id", "entry_percentage", "pass_percentage",
        "max_attempts", "question_count", "seconds_per_question", "prerequisite_name", "award_percentage",
      ].sort(),
    );
  });

  it("المسوّدة لا تُقرأ للزائر — ويعاينها حامل programs.read", async () => {
    const r = await as("anon", null, `select * from public.fn_public_exams($1)`, [draftId]);
    expect(r.rows).toHaveLength(0);
    await db.query(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage, eligibility_at)
       values ($1, 'نهائي المسوّدة', 'oral', 'final', 80, 10, 2, 90, '2026-12-01 00:00+03')`,
      [draftId],
    );
    const preview = await as<{ name: string }>("authenticated", WRITER, `select name from public.fn_public_exams($1)`, [draftId]);
    expect(preview.rows.map((x) => x.name)).toEqual(["نهائي المسوّدة"]);
  });

  it("**الشفهي بلا لحظة أهلية لا يظهر**", async () => {
    await db.query(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count, award_percentage)
       values ($1, 'شفهي بلا موعد', 'oral', 'final', 80, 10, 2, 90)`,
      [publishedId],
    );
    const r = await as<{ name: string }>("anon", null, `select name from public.fn_public_exams($1)`, [publishedId]);
    expect(r.rows.map((x) => x.name)).not.toContain("شفهي بلا موعد");
  });
});

describe("أبواب المسارات للعموم", () => {
  it("**كل مسارٍ بأبوابه وعدد وحداته منها**", async () => {
    const r = await as<{ track: string; section_name: string; units: number }>(
      "anon",
      null,
      // بترتيب الدالة نفسه — المسارات بترتيبها، والأبواب بترتيب نطاقاتها.
      `select t.name track, s.section_name, s.units from public.fn_public_track_sections($1) s
       join public.tracks t on t.id = s.track_id`,
      [publishedId],
    );
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => [x.track, x.section_name, x.units])).toEqual([
      ["الأول", "الإيمان", 4],
      ["الثاني", "الإيمان", 4],
      ["الثاني", "الطهارة", 3],
    ]);
  });
});
