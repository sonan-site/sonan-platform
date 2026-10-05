import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * الإعداد السريع — `fn_quick_setup`.
 *
 * ما يُفحَص: أنه يكتب المادة والنصيب والحقول وشكل اليوم والخطة الافتراضية
 * معاً، وأن **نصف إعداد لا يقع**. مادةٌ بلا نصيب، أو حقولٌ بلا خطة، تترك
 * البرنامج في حالة لا تُفهَم ولا تُصلَح بزرّ — وهذا أسوأ من رسالة رفض.
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
      `select count(*)::text n from public.plans p where p.program_id = $1 and p.deleted_at is null`,
    ),
    days: await one(
      `select coalesce(max(p.day_count), 0)::text n from public.plans p
       where p.program_id = $1 and p.deleted_at is null`,
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

async function setup(programId: string, lines: string[], dayCount = 30, fields = FIELDS) {
  return asUser(async () => {
    const { rows } = await db.query<{ v: Record<string, number> }>(
      `select public.fn_quick_setup($1, $2::text[], $3::jsonb, $4) as v`,
      [programId, lines, fields, dayCount],
    );
    return rows[0]!.v;
  });
}

/** قيم الخطة الافتراضية لحقلٍ باسمه، يوماً يوماً. */
async function valuesOf(programId: string, label: string) {
  const { rows } = await db.query<{ day_number: number; amount: number | null; value: string | null }>(
    `select v.day_number, v.amount, v.value from public.plan_values v
     join public.plans p on p.id = v.plan_id and p.program_id = $1 and p.track_id is null
     join public.task_fields f on f.id = v.task_field_id and f.label = $2
     where v.deleted_at is null order by v.day_number`,
    [programId, label],
  );
  return rows;
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
     values ($1, 'معِدّ اختبار', '+966500000009')`,
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
    await db.query(`delete from public.audit_log where actor_id = $1`, [TEST_USER]);
    await db.query(`delete from public.plan_versions where plan_id in
      (select id from public.plans where program_id in ${progs})`);
    await db.query(`delete from public.plan_values where plan_id in
      (select id from public.plans where program_id in ${progs})`);
    await db.query(`delete from public.plans where program_id in ${progs}`);
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
      db.query(`select public.fn_quick_setup($1, $2::text[], $3::jsonb, 5)`, [
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
  it("يكتب المادة والنصيب والحقول وشكل اليوم وخطةً افتراضية واحدة", async () => {
    const id = await makeProgram("qs-full", ["الأول", "الثاني"]);
    const result = await setup(id, ["حديث ١", "حديث ٢", "حديث ٣", "حديث ٤", "حديث ٥"], 14);

    expect(result).toMatchObject({ units: 5, tracks: 2, fields: 3, days: 14 });

    const c = await counts(id);
    expect(c).toEqual({ units: 5, fields: 3, templates: 1, parts: 2, plans: 1, days: 14 });
  });

  it("**الحفظ أساسٌ، ومقداره يقف عند آخر المادة** — والعددي يبقى كل يوم", async () => {
    const id = await makeProgram("qs-values", ["م"]);
    await setup(id, ["أ", "ب", "ج", "د", "و"], 5);
    const { rows: base } = await db.query<{ label: string }>(
      `select label from public.task_fields where program_id = $1 and is_base`,
      [id],
    );
    expect(base.map((r) => r.label)).toEqual(["حفظ"]);
    // خمس وحدات بوحدتين يومياً: ٢ ثم ٢ ثم ١، ولا شيء بعدها.
    expect((await valuesOf(id, "حفظ")).map((v) => v.amount)).toEqual([2, 2, 1]);
    expect((await valuesOf(id, "تكرار")).map((v) => Number(v.value))).toEqual([15, 15, 15, 15, 15]);
  });

  it("**بلا حقلٍ عددي تقصر الخطة عند نفاد المادة** — فلا يومَ بلا نشاط", async () => {
    const id = await makeProgram("qs-short", ["م"]);
    const result = await setup(id, ["أ", "ب", "ج"], 30, JSON.stringify([{ label: "حفظ", kind: "ranged", amount: 1 }]));
    expect(result.days).toBe(3);
  });

  it("والخطة تُكتب بالحفظ نفسه — بنسخة", async () => {
    const id = await makeProgram("qs-version", ["م"]);
    await setup(id, ["أ", "ب"], 4);
    const { rows } = await db.query<{ note: string }>(
      `select v.note from public.plan_versions v join public.plans p on p.id = v.plan_id where p.program_id = $1`,
      [id],
    );
    expect(rows.map((r) => r.note)).toEqual(["الإعداد السريع"]);
  });

  it("نصيب كل مسار المادة كاملة — الافتراض المعقول", async () => {
    const id = await makeProgram("qs-parts", ["مسار واحد"]);
    await setup(id, ["أ", "ب", "ج"], 7);
    const { rows } = await db.query<{ from_sequence: number; to_sequence: number }>(
      `select r.from_sequence, r.to_sequence from public.track_content_ranges r
       join public.tracks t on t.id = r.track_id where t.program_id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({ from_sequence: 1, to_sequence: 3 });
  });

  it("السطور الفارغة تُتجاهل ولا تُزحزح الترقيم", async () => {
    const id = await makeProgram("qs-blank", ["م"]);
    const result = await setup(id, ["أ", "  ", "ب", ""], 5);
    expect(result.units).toBe(2);
    const { rows } = await db.query<{ sequence: number }>(
      `select sequence from public.content_units where program_id = $1 order by sequence`,
      [id],
    );
    expect(rows.map((r) => r.sequence)).toEqual([1, 2]);
  });
});

describe("إما الكلّ أو لا شيء", () => {
  it("**مقدار الحفظ الكسري يُردّ ولا يترك أثراً** — المادة تُعدّ وحدةً وحدة", async () => {
    const id = await makeProgram("qs-fraction", ["م"]);
    await expect(
      setup(id, ["أ", "ب"], 5, JSON.stringify([{ label: "حفظ", kind: "ranged", amount: 1.5 }])),
    ).rejects.toThrow(/صحيحٌ في التراكمي/);
    expect(await counts(id)).toMatchObject({ units: 0, parts: 0, plans: 0 });
  });

  it("**برنامج بلا مسارات: لا مادة تبقى** — والرسالة تقول ما ينقص", async () => {
    const id = await makeProgram("qs-notracks", []);
    await expect(setup(id, ["أ", "ب"])).rejects.toThrow(/لا مسارات/);
    expect(await counts(id)).toMatchObject({ units: 0, fields: 0, templates: 0 });
  });

  it("مادة فارغة تُردّ", async () => {
    const id = await makeProgram("qs-nolines", ["م"]);
    await expect(setup(id, [])).rejects.toThrow(/المادة مطلوبة/);
  });

  it("بلا حقول يُردّ", async () => {
    const id = await makeProgram("qs-nofields", ["م"]);
    await expect(setup(id, ["أ"], 5, "[]")).rejects.toThrow(/حقلٌ واحد على الأقل/);
    expect((await counts(id)).units).toBe(0);
  });

  it("مدّة خارج الحدّ تُردّ", async () => {
    const id = await makeProgram("qs-toolong", ["م"]);
    await expect(setup(id, ["أ"], 400)).rejects.toThrow(/مدّة الخطة/);
  });

  it("**نوع حقل غير معروف يُردّ ولا يترك أثراً**", async () => {
    const id = await makeProgram("qs-badkind", ["م"]);
    await expect(
      setup(id, ["أ"], 5, JSON.stringify([{ label: "س", kind: "خطأ", amount: 1 }])),
    ).rejects.toThrow();
    expect(await counts(id)).toMatchObject({ units: 0, parts: 0, templates: 0 });
  });
});

describe("بداية لا تصحيح", () => {
  it("**لا يُعاد على برنامج مُعَدّ** — فلا يُمحى عمل يدوي بافتراضات", async () => {
    const id = await makeProgram("qs-twice", ["م"]);
    await setup(id, ["أ", "ب"], 5);
    await expect(setup(id, ["ج", "د"], 5)).rejects.toThrow(/ليس فارغاً/);
    expect((await counts(id)).units).toBe(2);
  });
});
