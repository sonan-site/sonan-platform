import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * شاشة النشر — الهجرة ٠٥٠.
 *
 * ما ينقص البرنامج للنشر **تعريفٌ واحد** يناديه الحارس والشاشة معاً، فلا يختلف
 * المعروض عن المفروض. والترتيب ومجموعة السؤال عمودان جديدان.
 */

let db: Client;
let sectionId: string;
let emptyProgram: string;
let readyProgram: string;
let trackId: string;
let templateId: string;
let fieldId: string;
let planId: string;
let roleId: string;

const ADMIN = "00000000-0000-4000-8000-000000000e41";
const OUTSIDER = "00000000-0000-4000-8000-000000000e42";
const USERS = [ADMIN, OUTSIDER];

async function asUser<T>(uid: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

type StateRow = { id: string; status: string; sort_order: number; missing: string[] };

async function stateFor(uid: string): Promise<StateRow[]> {
  const { rows } = await asUser(uid, () =>
    db.query<StateRow>(
      `select id, status, sort_order, missing from public.fn_programs_publish_state()`,
    ),
  );
  return rows;
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `publish-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب النشر', $2)`,
      [uid, `+96650000070${i}`],
    );
  }

  sectionId = (
    await db.query<{ id: string }>(
      `insert into public.sections (name) values ('قسم شاشة النشر') returning id`,
    )
  ).rows[0]!.id;

  emptyProgram = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, sort_order)
       values ($1, 'برنامج فارغ', 'publish-empty-test', 7) returning id`,
      [sectionId],
    )
  ).rows[0]!.id;

  readyProgram = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, sort_order)
       values ($1, 'برنامج جاهز', 'publish-ready-test', 3) returning id`,
      [sectionId],
    )
  ).rows[0]!.id;

  // بناءُ الجاهز كاملاً — البنود السبعة التي يعدّها الحارس.
  trackId = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'مسار النشر') returning id`,
      [readyProgram],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.content_units (program_id, sequence, label)
     select $1, g, 'وحدة ' || g from generate_series(1, 5) as g`,
    [readyProgram],
  );
  await db.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
     values ($1, 1, 5, 0)`,
    [trackId],
  );
  fieldId = (
    await db.query<{ id: string }>(
      `insert into public.task_fields (program_id, label, kind, sort_order)
       values ($1, 'حفظ', 'ranged', 0) returning id`,
      [readyProgram],
    )
  ).rows[0]!.id;
  templateId = (
    await db.query<{ id: string }>(
      `insert into public.day_templates (program_id, name) values ($1, 'يوم') returning id`,
      [readyProgram],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.day_template_fields (day_template_id, task_field_id, base_amount, sort_order)
     values ($1, $2, 1, 0)`,
    [templateId, fieldId],
  );
  planId = (
    await db.query<{ id: string }>(
      `insert into public.plans (track_id, name) values ($1, 'خطة النشر') returning id`,
      [trackId],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
     select $1, g, 'normal', $2 from generate_series(1, 2) as g`,
    [planId, templateId],
  );
  await db.query(
    `insert into public.page_blocks (program_id, block_type, sort_order, content)
     values ($1, 'header', 0, '{"title":"برنامج جاهز"}'::jsonb)`,
    [readyProgram],
  );

  roleId = (
    await db.query<{ id: string }>(
      `insert into public.roles (name) values ('دور شاشة النشر') returning id`,
    )
  ).rows[0]!.id;
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(
      `insert into public.role_permissions (role_id, permission_code) values ($1, $2)`,
      [roleId, code],
    );
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    ADMIN,
    roleId,
  ]);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  if (sectionId) {
    const programs = [emptyProgram, readyProgram].filter(Boolean);
    await db.query(`delete from public.help_entries where program_id = any($1::uuid[])`, [programs]);
    await db.query(`delete from public.page_blocks where program_id = any($1::uuid[])`, [programs]);
    if (planId) {
      await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
      await db.query(`delete from public.plans where id = $1`, [planId]);
    }
    if (templateId) {
      await db.query(`delete from public.day_template_fields where day_template_id = $1`, [
        templateId,
      ]);
      await db.query(`delete from public.day_templates where id = $1`, [templateId]);
    }
    await db.query(`delete from public.task_fields where program_id = any($1::uuid[])`, [programs]);
    if (trackId) {
      await db.query(`delete from public.track_content_ranges where track_id = $1`, [trackId]);
    }
    await db.query(`delete from public.content_units where program_id = any($1::uuid[])`, [
      programs,
    ]);
    await db.query(`delete from public.tracks where program_id = any($1::uuid[])`, [programs]);
    await db.query(`delete from public.programs where id = any($1::uuid[])`, [programs]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  if (roleId) {
    await db.query(`delete from public.user_roles where role_id = $1`, [roleId]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [roleId]);
    await db.query(`delete from public.roles where id = $1`, [roleId]);
  }
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("ما ينقص البرنامج للنشر", () => {
  it("**تعريفٌ واحد للحارس وللشاشة** — فلا يختلف المعروض عن المفروض", async () => {
    const { rows } = await db.query<{ missing: string[] }>(
      `select public.fn_program_missing($1) as missing`,
      [emptyProgram],
    );
    expect(rows[0]!.missing).toContain("المسارات");
    expect(rows[0]!.missing).toContain("المادة");

    // والحارس يرفض بالقائمة نفسها.
    await expect(
      db.query(`update public.programs set status = 'published' where id = $1`, [emptyProgram]),
    ).rejects.toThrow(/لا يُنشر البرنامج قبل: المسارات · المادة/);
  });

  it("**والجاهز لا ينقصه شيء، فيُنشر**", async () => {
    const { rows } = await db.query<{ missing: string[] }>(
      `select public.fn_program_missing($1) as missing`,
      [readyProgram],
    );
    expect(rows[0]!.missing).toEqual([]);

    await db.query(`update public.programs set status = 'published' where id = $1`, [readyProgram]);
    const { rows: after } = await db.query<{ status: string }>(
      `select status from public.programs where id = $1`,
      [readyProgram],
    );
    expect(after[0]!.status).toBe("published");
  });
});

describe("حالة النشر صفّاً واحداً", () => {
  it("**نداءٌ واحد يحمل الحالة والناقص معاً**", async () => {
    const rows = await stateFor(ADMIN);
    const empty = rows.find((r) => r.id === emptyProgram);
    const ready = rows.find((r) => r.id === readyProgram);

    expect(empty?.status).toBe("draft");
    expect(empty?.missing.length).toBeGreaterThan(0);
    expect(ready?.status).toBe("published");
    expect(ready?.missing).toEqual([]);
  });

  it("**والترتيب يسبق تاريخ الإنشاء** — الأصغر أولاً", async () => {
    const rows = await stateFor(ADMIN);
    const mine = rows.filter((r) => [emptyProgram, readyProgram].includes(r.id));
    // الجاهز ترتيبه ٣ والفارغ ٧، فالجاهز يتقدّم مهما كان تاريخه.
    expect(mine.map((r) => r.id)).toEqual([readyProgram, emptyProgram]);
  });

  it("ومن لا يقرأ البرامج لا يرى إلا ما هو منشور", async () => {
    const rows = await stateFor(OUTSIDER);
    expect(rows.map((r) => r.id)).not.toContain(emptyProgram);
  });
});

describe("مجموعة السؤال الشائع", () => {
  it("**تُحفظ مع السؤال**، وتفرغ لمن لا مجموعة له", async () => {
    await db.query(
      `insert into public.help_entries (program_id, question, answer, category, sort_order)
       values ($1, 'ما مدة البرنامج؟', 'شهران.', 'عن البرنامج', 0),
              ($1, 'كيف أسجّل؟', 'من صفحة البرنامج.', '', 1)`,
      [readyProgram],
    );
    const { rows } = await db.query<{ category: string }>(
      `select category from public.help_entries where program_id = $1 order by sort_order`,
      [readyProgram],
    );
    expect(rows.map((r) => r.category)).toEqual(["عن البرنامج", ""]);
  });

  it("واسمٌ أطول من الحدّ يُرفض", async () => {
    await expect(
      db.query(
        `insert into public.help_entries (program_id, question, answer, category)
         values ($1, 'سؤال', 'جواب', repeat('ط', 61))`,
        [readyProgram],
      ),
    ).rejects.toThrow(/chk_help_entries_category/);
  });
});
