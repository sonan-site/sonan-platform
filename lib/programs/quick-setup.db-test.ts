import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * الإعداد السريع — `fn_quick_setup`.
 *
 * ما يُفحَص: أنه يكتب في الجداول الستّة معاً، وأن **نصف إعداد لا يقع**.
 * مادةٌ بلا نصيب، أو خطةٌ بلا شكل يوم، تترك البرنامج في حالة لا تُفهَم
 * ولا تُصلَح بزرّ — وهذا أسوأ من رسالة رفض.
 */

let db: Client;
let sectionId: string;
let roleId: string;

/**
 * مستخدم اختبار بدور حقيقي يحمل `programs.write`.
 *
 * ملكية القاعدة تتجاوز أمن الصفوف لكنها **لا تتجاوز شرطاً مكتوباً**:
 * `fn_quick_setup` تفحص `fn_has_permission` صراحةً، وهي تقرأ `auth.uid()`.
 * فاختبارٌ بلا هوية يقيس الحارس لا الدالة.
 */
const TEST_USER = "00000000-0000-4000-8000-0000000000e1";

const FIELDS = JSON.stringify([
  { label: "حفظ", kind: "ranged", amount: 2 },
  { label: "مراجعة", kind: "ranged", amount: 3 },
  { label: "تكرار", kind: "counted", amount: 15 },
]);

async function makeProgram(slug: string, tracks: string[]): Promise<string> {
  const program = await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug) values ($1, $2, $3) returning id`,
    [sectionId, `برنامج ${slug}`, slug],
  );
  const id = program.rows[0]!.id;
  for (const [i, name] of tracks.entries()) {
    await db.query(
      `insert into public.tracks (program_id, name, sort_order) values ($1, $2, $3)`,
      [id, name, i],
    );
  }
  return id;
}

async function counts(programId: string) {
  const one = async (sql: string) =>
    Number((await db.query<{ n: string }>(sql, [programId])).rows[0]!.n);
  return {
    units: await one(
      `select count(*)::text n from public.content_units where program_id = $1 and deleted_at is null`,
    ),
    fields: await one(
      `select count(*)::text n from public.task_fields where program_id = $1 and deleted_at is null`,
    ),
    templates: await one(
      `select count(*)::text n from public.day_templates where program_id = $1 and deleted_at is null`,
    ),
    parts: await one(
      `select count(*)::text n from public.track_content_ranges r
       join public.tracks t on t.id = r.track_id
       where t.program_id = $1 and r.deleted_at is null`,
    ),
    plans: await one(
      `select count(*)::text n from public.plans p
       join public.tracks t on t.id = p.track_id
       where t.program_id = $1 and p.deleted_at is null`,
    ),
    days: await one(
      `select count(*)::text n from public.plan_days d
       join public.plans p on p.id = d.plan_id
       join public.tracks t on t.id = p.track_id
       where t.program_id = $1 and d.deleted_at is null`,
    ),
  };
}

/** ينفّذ العمل بهوية المستخدم صاحب الصلاحية. */
async function asUser<T>(work: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: TEST_USER, role: "authenticated" }),
  ]);
  try {
    return await work();
  } finally {
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

async function setup(
  programId: string,
  lines: string[],
  dayCount = 30,
  restEvery = 7,
  fields = FIELDS,
) {
  return asUser(async () => {
    const { rows } = await db.query<{ v: Record<string, number> }>(
      `select public.fn_quick_setup($1, $2::text[], $3::jsonb, $4, $5) as v`,
      [programId, lines, fields, dayCount, restEvery],
    );
    return rows[0]!.v;
  });
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const section = await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم الإعداد السريع') returning id`,
  );
  sectionId = section.rows[0]!.id;

  await db.query(
    `insert into auth.users (id, email, aud, role)
     values ($1, 'quicksetup@test.local', 'authenticated', 'authenticated')`,
    [TEST_USER],
  );
  await db.query(
    `insert into public.profiles (user_id, full_name, phone)
     values ($1, 'معِدّ اختبار', '0500000009')`,
    [TEST_USER],
  );

  // دور عادي لا دور نظام: يُختبَر الصلاحية لا التجاوز.
  const role = await db.query<{ id: string }>(
    `insert into public.roles (name) values ('دور اختبار الإعداد السريع') returning id`,
  );
  roleId = role.rows[0]!.id;
  await db.query(
    `insert into public.role_permissions (role_id, permission_code)
     values ($1, 'programs.read'), ($1, 'programs.write')`,
    [roleId],
  );
  await db.query(
    `insert into public.user_roles (user_id, role_id, scope_program_id)
     values ($1, $2, null)`,
    [TEST_USER, roleId],
  );

  await db.query(`select set_config('request.jwt.claims', '', false)`);
});

afterAll(async () => {
  if (sectionId) {
    const progs = `(select id from public.programs where section_id = '${sectionId}')`;
    await db.query(`delete from public.plan_days where plan_id in
      (select p.id from public.plans p join public.tracks t on t.id = p.track_id
       where t.program_id in ${progs})`);
    await db.query(`delete from public.plans where track_id in
      (select id from public.tracks where program_id in ${progs})`);
    await db.query(`delete from public.day_template_fields where day_template_id in
      (select id from public.day_templates where program_id in ${progs})`);
    await db.query(`delete from public.day_templates where program_id in ${progs}`);
    await db.query(`delete from public.task_fields where program_id in ${progs}`);
    await db.query(`delete from public.track_content_ranges where track_id in
      (select id from public.tracks where program_id in ${progs})`);
    await db.query(`delete from public.content_units where program_id in ${progs}`);
    await db.query(`delete from public.tracks where program_id in ${progs}`);
    await db.query(`delete from public.programs where section_id = $1`, [sectionId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  if (roleId) {
    await db.query(`delete from public.user_roles where role_id = $1`, [roleId]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [roleId]);
    await db.query(`delete from public.roles where id = $1`, [roleId]);
    await db.query(`delete from public.profiles where user_id = $1`, [TEST_USER]);
    await db.query(`delete from auth.users where id = $1`, [TEST_USER]);
  }
  await db?.end();
});

describe("الصلاحية", () => {
  it("**بلا صلاحية على البرنامج لا يقع شيء** — والدالة تحرس نفسها", async () => {
    const id = await makeProgram("qs-denied", ["أ", "ب"]);
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: "00000000-0000-4000-8000-0000000000fe", role: "authenticated" }),
    ]);
    await expect(
      db.query(`select public.fn_quick_setup($1, $2::text[], $3::jsonb, 5, 0)`, [
        id,
        ["واحد", "اثنان"],
        FIELDS,
      ]),
    ).rejects.toThrow(/لا صلاحية لك/);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
    expect((await counts(id)).units).toBe(0);
  });
});

describe("الإعداد الكامل", () => {
  it("يكتب في الجداول الستّة دفعة واحدة", async () => {
    const id = await makeProgram("qs-full", ["الأول", "الثاني"]);
    const result = await setup(id, ["حديث ١", "حديث ٢", "حديث ٣", "حديث ٤", "حديث ٥"], 14, 7);

    expect(result).toMatchObject({ units: 5, tracks: 2, fields: 3, days: 28 });

    const c = await counts(id);
    expect(c).toEqual({ units: 5, fields: 3, templates: 1, parts: 2, plans: 2, days: 28 });
  });

  it("نصيب كل مسار المادة كاملة — الافتراض المعقول", async () => {
    const id = await makeProgram("qs-parts", ["مسار واحد"]);
    await setup(id, ["أ", "ب", "ج"], 7, 0);
    const { rows } = await db.query<{ from_sequence: number; to_sequence: number }>(
      `select r.from_sequence, r.to_sequence from public.track_content_ranges r
       join public.tracks t on t.id = r.track_id where t.program_id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({ from_sequence: 1, to_sequence: 3 });
  });

  it("إيقاع الراحة يقع على مضاعفاته، وصفرٌ يعني بلا راحة", async () => {
    const withRest = await makeProgram("qs-rest", ["م"]);
    await setup(withRest, ["أ", "ب"], 14, 7);
    const rest = await db.query<{ n: string }>(
      `select count(*)::text n from public.plan_days d
       join public.plans p on p.id = d.plan_id
       join public.tracks t on t.id = p.track_id
       where t.program_id = $1 and d.day_type = 'rest'`,
      [withRest],
    );
    expect(Number(rest.rows[0]!.n)).toBe(2);

    const noRest = await makeProgram("qs-norest", ["م"]);
    await setup(noRest, ["أ", "ب"], 10, 0);
    const none = await db.query<{ n: string }>(
      `select count(*)::text n from public.plan_days d
       join public.plans p on p.id = d.plan_id
       join public.tracks t on t.id = p.track_id
       where t.program_id = $1 and d.day_type = 'rest'`,
      [noRest],
    );
    expect(Number(none.rows[0]!.n)).toBe(0);
  });

  it("السطور الفارغة تُتجاهل ولا تُزحزح الترقيم", async () => {
    const id = await makeProgram("qs-blank", ["م"]);
    const result = await setup(id, ["أ", "  ", "ب", ""], 5, 0);
    expect(result.units).toBe(2);
    const { rows } = await db.query<{ sequence: number }>(
      `select sequence from public.content_units where program_id = $1 order by sequence`,
      [id],
    );
    expect(rows.map((r) => r.sequence)).toEqual([1, 2]);
  });
});

describe("إما الكلّ أو لا شيء", () => {
  it("**برنامج بلا مسارات: لا مادة تبقى** — والرسالة تقول ما ينقص", async () => {
    const id = await makeProgram("qs-notracks", []);
    await expect(setup(id, ["أ", "ب"])).rejects.toThrow(/لا مسارات/);
    expect(await counts(id)).toMatchObject({ units: 0, fields: 0, templates: 0 });
  });

  it("مادة فارغة تُردّ", async () => {
    const id = await makeProgram("qs-nolines", ["م"]);
    await expect(setup(id, [])).rejects.toThrow(/المادة مطلوبة/);
  });

  it("بلا واجبات يُردّ", async () => {
    const id = await makeProgram("qs-nofields", ["م"]);
    await expect(setup(id, ["أ"], 5, 0, "[]")).rejects.toThrow(/واجب واحد على الأقل/);
    expect((await counts(id)).units).toBe(0);
  });

  it("مدّة خارج الحدّ تُردّ", async () => {
    const id = await makeProgram("qs-toolong", ["م"]);
    await expect(setup(id, ["أ"], 400, 0)).rejects.toThrow(/مدّة الخطة/);
  });

  it("**نوع واجب غير معروف يُردّ ولا يترك أثراً**", async () => {
    const id = await makeProgram("qs-badkind", ["م"]);
    await expect(
      setup(id, ["أ"], 5, 0, JSON.stringify([{ label: "س", kind: "خطأ", amount: 1 }])),
    ).rejects.toThrow();
    expect(await counts(id)).toMatchObject({ units: 0, parts: 0, templates: 0 });
  });
});

describe("بداية لا تصحيح", () => {
  it("**لا يُعاد على برنامج مُعَدّ** — فلا يُمحى عمل يدوي بافتراضات", async () => {
    const id = await makeProgram("qs-twice", ["م"]);
    await setup(id, ["أ", "ب"], 5, 0);
    await expect(setup(id, ["ج", "د"], 5, 0)).rejects.toThrow(/ليس فارغاً/);
    expect((await counts(id)).units).toBe(2);
  });
});
