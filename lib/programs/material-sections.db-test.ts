import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * المادة بأقسامها — الهجرة ٠٥٦ (`adr/0039`).
 *
 * الأقسام تولّد الوحدات وأرقامها المتّصلة، وتعديلها يعيد الترقيم **دون أن يمسّ
 * رقماً لا يتغيّر**: النصّ يرحل مع وحدته، وإضافة قسم في الآخر لا تلمس ما قبله،
 * وإزاحة وحدة تحت نصيب مسار تُرفض كلها.
 */

let db: Client;
let sectionId: string;
let programId: string;
let legacyProgramId: string;
let trackId: string;
let roleId: string;

const ADMIN = "00000000-0000-4000-8000-000000000561";
const OUTSIDER = "00000000-0000-4000-8000-000000000562";
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

type Entry = { id?: string; name: string; count: number | string };

const setSections = (program: string, entries: Entry[], uid = ADMIN) =>
  asUser(uid, () =>
    db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [program, JSON.stringify(entries)]),
  );

type UnitView = { sequence: number; label: string | null; name: string | null };

async function units(program: string): Promise<UnitView[]> {
  const { rows } = await db.query<UnitView>(
    `select u.sequence, u.label, s.name
     from public.content_units u
     left join public.material_sections s on s.id = u.section_id
     where u.program_id = $1 and u.deleted_at is null
     order by u.sequence`,
    [program],
  );
  return rows;
}

async function sections(program: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await db.query<{ id: string; name: string }>(
    `select id, name from public.material_sections
     where program_id = $1 and deleted_at is null order by sort_order`,
    [program],
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
      [uid, `material-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب المادة', $2)`,
      [uid, `+96650005610${i}`],
    );
  }

  sectionId = (
    await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم أبواب المادة') returning id`)
  ).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug) values ($1, 'برنامج الأبواب', 'material-sections-test') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  legacyProgramId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug) values ($1, 'مادة بلا أبواب', 'material-legacy-test') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  trackId = (
    await db.query<{ id: string }>(`insert into public.tracks (program_id, name) values ($1, 'م') returning id`, [
      programId,
    ])
  ).rows[0]!.id;

  roleId = (
    await db.query<{ id: string }>(`insert into public.roles (name) values ('دور أبواب المادة') returning id`)
  ).rows[0]!.id;
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [roleId, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);
});

afterAll(async () => {
  if (sectionId) {
    const programs = [programId, legacyProgramId].filter(Boolean);
    if (trackId) await db.query(`delete from public.track_content_ranges where track_id = $1`, [trackId]);
    await db.query(`delete from public.content_units where program_id = any($1::uuid[])`, [programs]);
    await db.query(`delete from public.material_sections where program_id = any($1::uuid[])`, [programs]);
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

describe("الأقسام تولّد الوحدات", () => {
  it("كل قسم يبدأ بعد ما قبله، والترقيم متّصل", async () => {
    await setSections(programId, [
      { name: "الإيمان", count: 47 },
      { name: "الطهارة", count: 44 },
    ]);
    const all = await units(programId);
    expect(all).toHaveLength(91);
    expect(all.map((u) => u.sequence)).toEqual(Array.from({ length: 91 }, (_, i) => i + 1));
    expect(all[46]!.name).toBe("الإيمان");
    expect(all[47]!.name).toBe("الطهارة");
  });

  it("**النصّ يرحل مع وحدته** حين يكبر قسمٌ قبلها", async () => {
    const [iman, tahara] = await sections(programId);
    await db.query(`update public.content_units set label = 'أول الطهارة' where program_id = $1 and sequence = 48`, [
      programId,
    ]);
    await setSections(programId, [
      { id: iman!.id, name: "الإيمان", count: 48 },
      { id: tahara!.id, name: "الطهارة", count: 44 },
    ]);
    const moved = (await units(programId)).find((u) => u.label === "أول الطهارة");
    expect(moved?.sequence).toBe(49);
  });

  it("وتبادل الترتيب ينقل القسمين بوحداتهما ونصوصهما", async () => {
    const [iman, tahara] = await sections(programId);
    await setSections(programId, [
      { id: tahara!.id, name: "الطهارة", count: 44 },
      { id: iman!.id, name: "الإيمان", count: 47 },
    ]);
    const all = await units(programId);
    expect(all[0]).toMatchObject({ name: "الطهارة", label: "أول الطهارة" });
    expect(all[44]!.name).toBe("الإيمان");

    await setSections(programId, [
      { id: iman!.id, name: "الإيمان", count: 47 },
      { id: tahara!.id, name: "الطهارة", count: 44 },
    ]);
  });
});

describe("القفل: ما يُزيح وحدةً تحت نصيب مسار", () => {
  it("**يُرفض كله** — ولا يتغيّر رقم", async () => {
    await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 48, 60)`, [
      trackId,
    ]);
    const [iman, tahara] = await sections(programId);
    await expect(
      setSections(programId, [
        { id: iman!.id, name: "الإيمان", count: 46 },
        { id: tahara!.id, name: "الطهارة", count: 44 },
      ]),
    ).rejects.toThrow(/داخل نصيب مسار/);
    expect(await units(programId)).toHaveLength(91);
  });

  it("وإضافة قسم في الآخر تمرّ — لا تُزيح شيئاً", async () => {
    const [iman, tahara] = await sections(programId);
    await setSections(programId, [
      { id: iman!.id, name: "الإيمان", count: 47 },
      { id: tahara!.id, name: "الطهارة", count: 44 },
      { name: "الصلاة", count: 48 },
    ]);
    const all = await units(programId);
    expect(all).toHaveLength(139);
    expect(all[138]!.name).toBe("الصلاة");
  });

  it("وتبادل اسمين لا يصطدم بفهرس التفرّد", async () => {
    const [a, b, c] = await sections(programId);
    await setSections(programId, [
      { id: a!.id, name: "الطهارة", count: 47 },
      { id: b!.id, name: "الإيمان", count: 44 },
      { id: c!.id, name: "الصلاة", count: 48 },
    ]);
    expect((await sections(programId)).map((s) => s.name)).toEqual(["الطهارة", "الإيمان", "الصلاة"]);
  });
});

describe("المدخل الواحد", () => {
  it("الاسم المكرر والعدد غير الصحيح يُرفضان قبل أي كتابة", async () => {
    await expect(setSections(programId, [{ name: "أ", count: 1 }, { name: "أ", count: 2 }])).rejects.toThrow(/مكرر/);
    await expect(setSections(programId, [{ name: "أ", count: "x" }])).rejects.toThrow(/عدد صحيح/);
  });

  it("**الكتابة المباشرة على حجم القسم أو وحداته ممنوعة**، والاسم مفتوح", async () => {
    const [first] = await sections(programId);
    await expect(
      asUser(ADMIN, () => db.query(`update public.material_sections set unit_count = 5 where id = $1`, [first!.id])),
    ).rejects.toThrow(/تُكتب من شاشة المادة/);
    await expect(
      asUser(ADMIN, () =>
        db.query(`update public.content_units set deleted_at = now() where program_id = $1 and sequence = 139`, [
          programId,
        ]),
      ),
    ).rejects.toThrow(/تتبع عدده/);
    const third = (await sections(programId))[2]!.id;
    const { rowCount } = await asUser(ADMIN, () =>
      db.query(`update public.material_sections set name = 'الصلاة والجمعة' where id = $1`, [third]),
    );
    expect(rowCount).toBe(1);
  });

  it("من لا يملك الكتابة يُرفض", async () => {
    await expect(setSections(programId, [], OUTSIDER)).rejects.toThrow(/لا صلاحية/);
  });
});

describe("مادة لُصقت قبل تقسيمها", () => {
  it("**الأقسام تضمّ وحداتها القائمة بنصوصها**، وتولّد الناقص", async () => {
    await db.query(
      `insert into public.content_units (program_id, sequence, label)
       select $1, g, 'ح' || g from generate_series(1, 46) g`,
      [legacyProgramId],
    );
    await setSections(legacyProgramId, [
      { name: "أ", count: 20 },
      { name: "ب", count: 30 },
    ]);
    const all = await units(legacyProgramId);
    expect(all).toHaveLength(50);
    expect(all[19]!.name).toBe("أ");
    expect(all[20]!.name).toBe("ب");
    expect(all[45]!.label).toBe("ح46");
    expect(all[46]!.label).toBeNull();
  });

  it("النصوص تُكتب على الوحدات القائمة — والسطر الفارغ يمحو", async () => {
    const { rows } = await asUser(ADMIN, () =>
      db.query<{ n: number }>(`select public.fn_set_unit_labels($1, 2, $2::text[]) as n`, [
        legacyProgramId,
        ["س", "  ", "ص"],
      ]),
    );
    expect(rows[0]!.n).toBe(3);
    const all = await units(legacyProgramId);
    expect([all[1]!.label, all[2]!.label, all[3]!.label]).toEqual(["س", null, "ص"]);
    await expect(
      asUser(ADMIN, () =>
        db.query(`select public.fn_set_unit_labels($1, 49, $2::text[])`, [legacyProgramId, ["أ", "ب", "ج"]]),
      ),
    ).rejects.toThrow(/تتجاوز آخر وحدة/);
  });

  it("حذف الأقسام كلها يحذف وحداتها", async () => {
    await setSections(legacyProgramId, []);
    expect(await units(legacyProgramId)).toHaveLength(0);
  });
});
