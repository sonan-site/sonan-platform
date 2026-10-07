import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * مواعيد البرنامج (`adr/0044`) ومفتاح واجهة الحملة (`adr/0045`) — الهجرة ٠٦٩.
 *
 * المواعيد تتبع برنامجها كعناصر الصفحة: المنشور يقرؤه الزائر، والمسوّدة بنطاقها،
 * والكتابة لحامل `programs.write`. والمفتاح يُرجع رابطاً **منشوراً** وحده.
 */

let db: Client;
let sectionId: string;
let draftId: string;
let publishedId: string;
let writerRole: string;

const WRITER = "00000000-0000-4000-8000-000000000f61";
const STRANGER = "00000000-0000-4000-8000-000000000f62";
const USERS = [WRITER, STRANGER];

/** يُنفّذ بدورٍ وهويةٍ، ثم يُرجع الصفوف أو رسالة الرفض. */
async function as<T extends Record<string, unknown>>(
  role: "anon" | "authenticated",
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null }> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    if (uid) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: uid, role }),
      ]);
    }
    const { rows } = await db.query<T>(sql, params);
    await db.query("rollback");
    return { rows, error: null };
  } catch (error) {
    await db.query("rollback");
    return { rows: [], error: (error as Error).message };
  }
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `schedule-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب المواعيد', $2)`,
      [uid, `+96650000076${i}`],
    );
  }

  sectionId = (
    await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم المواعيد') returning id`)
  ).rows[0]!.id;

  const program = async (slug: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.programs (section_id, name, slug) values ($1, $2, $3) returning id`,
        [sectionId, `برنامج ${slug}`, slug],
      )
    ).rows[0]!.id;
  draftId = await program("schedule-draft-test");
  publishedId = await program("schedule-published-test");
  // النشر يحرسه `fn_guard_program_publish` — والاختبار يقيس القراءة لا الجاهزية.
  // للجلسة وحدها — لا يمسّ ملفات اختبار تجري معها.
  await db.query(`set session_replication_role = replica`);
  await db.query(`update public.programs set status = 'published' where id = $1`, [publishedId]);
  await db.query(`set session_replication_role = origin`);

  for (const id of [draftId, publishedId]) {
    await db.query(
      `insert into public.program_schedule (program_id, title, starts_on, ends_on)
       values ($1, 'الحفظ', '2026-10-18', '2026-11-28')`,
      [id],
    );
  }

  writerRole = (
    await db.query<{ id: string }>(`insert into public.roles (name) values ('دور كاتب المواعيد') returning id`)
  ).rows[0]!.id;
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [
      writerRole,
      code,
    ]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [WRITER, writerRole]);
});

afterAll(async () => {
  await db.query(`update public.settings set value = '{"slug": null}' where key = 'home.featured_program'`);
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.program_schedule where program_id = any($1::uuid[])`, [[draftId, publishedId]]);
  await db.query(`delete from public.programs where id = any($1::uuid[])`, [[draftId, publishedId]]);
  await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db.query(`delete from public.user_roles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.role_permissions where role_id = $1`, [writerRole]);
  await db.query(`delete from public.roles where id = $1`, [writerRole]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.end();
});

describe("مواعيد البرنامج — القراءة", () => {
  it("**الزائر يقرأ مواعيد المنشور وحده** — لا تتسرّب مسوّدة", async () => {
    const { rows } = await as<{ program_id: string }>(
      "anon",
      null,
      `select program_id from public.program_schedule where program_id = any($1::uuid[])`,
      [[draftId, publishedId]],
    );
    expect(rows.map((r) => r.program_id)).toEqual([publishedId]);
  });

  it("ومن له النطاق يقرأ المسوّدة — وهي المعاينة", async () => {
    const { rows } = await as(
      "authenticated",
      WRITER,
      `select 1 from public.program_schedule where program_id = $1`,
      [draftId],
    );
    expect(rows).toHaveLength(1);
  });
});

describe("مواعيد البرنامج — الكتابة", () => {
  it("**حامل programs.write يضيف موعداً**", async () => {
    const { error } = await as(
      "authenticated",
      WRITER,
      `insert into public.program_schedule (program_id, title, starts_on) values ($1, 'الحفل', '2026-12-12')`,
      [draftId],
    );
    expect(error).toBeNull();
  });

  it("**ومن لا صلاحية له يُرفض** — والزائر لا يكتب شيئاً", async () => {
    const stranger = await as(
      "authenticated",
      STRANGER,
      `insert into public.program_schedule (program_id, title, starts_on) values ($1, 'دخيل', '2026-12-12')`,
      [draftId],
    );
    expect(stranger.error).toMatch(/row-level security/);
    const anon = await as(
      "anon",
      null,
      `insert into public.program_schedule (program_id, title, starts_on) values ($1, 'دخيل', '2026-12-12')`,
      [publishedId],
    );
    expect(anon.error).not.toBeNull();
  });

  it("**النهاية لا تسبق البداية** — قيدٌ في القاعدة لا في النموذج وحده", async () => {
    const { error } = await as(
      "authenticated",
      WRITER,
      `insert into public.program_schedule (program_id, title, starts_on, ends_on)
       values ($1, 'مقلوب', '2026-12-12', '2026-12-01')`,
      [draftId],
    );
    expect(error).toMatch(/chk_program_schedule_range/);
  });
});

describe("مفتاح واجهة الحملة — fn_home_featured", () => {
  const featured = async () =>
    (await as<{ slug: string | null }>("anon", null, `select public.fn_home_featured() as slug`)).rows[0]
      ?.slug ?? null;

  it("**يُرجع رابط البرنامج المنشور** للزائر", async () => {
    await db.query(`update public.settings set value = '{"slug": "schedule-published-test"}' where key = 'home.featured_program'`);
    expect(await featured()).toBe("schedule-published-test");
  });

  it("**ومسوّدةٌ في المفتاح لا تُظهر شيئاً** — تعود الصفحة الرئيسية إلى المتجر", async () => {
    await db.query(`update public.settings set value = '{"slug": "schedule-draft-test"}' where key = 'home.featured_program'`);
    expect(await featured()).toBeNull();
  });

  it("والشكل مفروض: الرابط نصٌّ أو فارغ", async () => {
    await expect(
      db.query(`update public.settings set value = '{"slug": 5}' where key = 'home.featured_program'`),
    ).rejects.toThrow(/settings_home_featured_shape/);
  });
});
