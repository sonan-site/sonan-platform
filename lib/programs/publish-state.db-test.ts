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
let fieldId: string;
let planId: string;
let roleId: string;

const ADMIN = "00000000-0000-4000-8000-000000000e41";
const OUTSIDER = "00000000-0000-4000-8000-000000000e42";
const READER = "00000000-0000-4000-8000-000000000e43";
const USERS = [ADMIN, OUTSIDER, READER];

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

type StateRow = {
  id: string;
  status: string;
  sort_order: number;
  missing: string[];
  can_write: boolean;
};

async function stateFor(uid: string): Promise<StateRow[]> {
  const { rows } = await asUser(uid, () =>
    db.query<StateRow>(
      `select id, status, sort_order, missing, can_write from public.fn_programs_publish_state()`,
    ),
  );
  return rows;
}

let readerRoleId: string;

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

  // بناءُ الجاهز كاملاً — البنود الستّة التي يعدّها الحارس.
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
      `insert into public.task_fields (program_id, label, kind, sort_order, is_base)
       values ($1, 'حفظ', 'ranged', 0, true) returning id`,
      [readyProgram],
    )
  ).rows[0]!.id;
  planId = (
    await db.query<{ id: string }>(
      `insert into public.plans (program_id, name, day_count) values ($1, 'خطة النشر', 2) returning id`,
      [readyProgram],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.plan_values (plan_id, day_number, task_field_id, amount)
     select $1, g, $2, 1 from generate_series(1, 2) as g`,
    [planId, fieldId],
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

  // قارئٌ محض: يرى البرامج ولا يكتب فيها — وشاشة النشر لا تعرض له زرّ نشر.
  readerRoleId = (
    await db.query<{ id: string }>(
      `insert into public.roles (name) values ('دور قارئ النشر') returning id`,
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.role_permissions (role_id, permission_code) values ($1, 'programs.read')`,
    [readerRoleId],
  );
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    READER,
    readerRoleId,
  ]);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  if (sectionId) {
    const programs = [emptyProgram, readyProgram].filter(Boolean);
    await db.query(`delete from public.help_entries where program_id = any($1::uuid[])`, [programs]);
    await db.query(`delete from public.page_blocks where program_id = any($1::uuid[])`, [programs]);
    if (planId) {
      await db.query(`delete from public.plan_values where plan_id = $1`, [planId]);
      await db.query(`delete from public.plans where id = $1`, [planId]);
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
  for (const role of [roleId, readerRoleId].filter(Boolean)) {
    await db.query(`delete from public.user_roles where role_id = $1`, [role]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [role]);
    await db.query(`delete from public.roles where id = $1`, [role]);
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

describe("ما كشفته المراجعة", () => {
  it("**والكتابة تأتي مع الصفّ** — فلا يُعرض زرّ نشرٍ لقارئٍ محض", async () => {
    const admin = await stateFor(ADMIN);
    expect(admin.find((r) => r.id === readyProgram)?.can_write).toBe(true);

    const reader = await stateFor(READER);
    const seen = reader.find((r) => r.id === readyProgram);
    // يراه — فالقراءة عامة عنده — ولا يكتب فيه.
    expect(seen).toBeDefined();
    expect(seen?.can_write).toBe(false);
  });

  it("**ولوحة الجاهزية تحمل قائمة الحارس نفسها** — لا قائمتين تختلفان", async () => {
    // لوحة الجاهزية تشترط `programs.read`، و`fn_program_missing` داخليةٌ لا
    // تُمنح لأحد — فتُقرأ كلٌّ من موضعها ثم تُقابَلان.
    const shown = await asUser(ADMIN, () =>
      db.query<{ missing: string[] }>(
        `select missing from public.fn_program_readiness($1)`,
        [emptyProgram],
      ),
    );
    const guard = await db.query<{ missing: string[] }>(
      `select public.fn_program_missing($1) as missing`,
      [emptyProgram],
    );
    expect(shown.rows[0]!.missing).toEqual(guard.rows[0]!.missing);
    expect(shown.rows[0]!.missing.length).toBeGreaterThan(0);
  });
});
