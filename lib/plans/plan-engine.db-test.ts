import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * الخطة الجديدة — الهجرتان ٠٥٩ و٠٦٠ (`adr/0036` · `0037` · `0038`).
 *
 * الخطة تُكتب كاملة من `fn_save_plan` وحدها، فتُفحص على كل مسار يستعملها،
 * وتُقفل الأيام التي أتمّها مشارك (`BR-PLAN-02`)، ولا يتجاوز المقيَّدُ الأساسَ
 * (`BR-PLAN-03`)، وكل حفظٍ نسخة.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackA: string;
let trackB: string;
let roleId: string;
let hifz: string;
let rabt: string;
let review: string;
let planId: string;
let participantId: string;

const ADMIN = "00000000-0000-4000-8000-000000000591";
const OUTSIDER = "00000000-0000-4000-8000-000000000592";
const PLAYER = "00000000-0000-4000-8000-000000000593";
const USERS = [ADMIN, OUTSIDER, PLAYER];

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

async function id(sql: string, params: unknown[] = []): Promise<string> {
  return (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
}

type Value = { day: number; field_id: string; amount?: number; from?: number; to?: number; value?: number; repetition?: number };

const save = (values: Value[], dayCount: number, uid = ADMIN, plan = () => planId) =>
  asUser(uid, () =>
    db.query<{ v: number }>(`select public.fn_save_plan($1, $2::jsonb, 'اختبار') as v`, [
      plan(),
      JSON.stringify({ day_count: dayCount, values }),
    ]),
  );

/** أول ثلاثة أيام من خطة المسار الأول ١٤٤٨. */
const firstDays = (): Value[] => [
  { day: 1, field_id: hifz, amount: 1, repetition: 15 },
  { day: 2, field_id: hifz, amount: 1, repetition: 15 },
  { day: 2, field_id: rabt, from: 1, to: 1, repetition: 5 },
  { day: 3, field_id: hifz, amount: 1, repetition: 15 },
  { day: 3, field_id: rabt, from: 2, to: 2, repetition: 5 },
  { day: 3, field_id: review, from: 1, to: 2 },
];

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `plan-engine-${i}@test.local`],
    );
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الخطة', $2)`, [
      uid,
      `+96650005910${i}`,
    ]);
  }
  sectionId = await id(`insert into public.sections (name) values ('قسم الخطة الجديدة') returning id`);
  programId = await id(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج الخطة الجديدة', 'plan-engine-test') returning id`,
    [sectionId],
  );
  roleId = await id(`insert into public.roles (name) values ('دور الخطة الجديدة') returning id`);
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [roleId, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);

  await asUser(ADMIN, () =>
    db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [
      programId,
      JSON.stringify([
        { name: "الإيمان", count: 47 },
        { name: "الطهارة", count: 44 },
      ]),
    ]),
  );
  trackA = await id(`insert into public.tracks (program_id, name, sort_order) values ($1, 'الأول', 1) returning id`, [
    programId,
  ]);
  trackB = await id(`insert into public.tracks (program_id, name, sort_order) values ($1, 'الثاني', 2) returning id`, [
    programId,
  ]);
  await db.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 47), ($2, 1, 91)`,
    [trackA, trackB],
  );

  const field = (label: string, kind: string, base: boolean, constrained: boolean) =>
    id(
      `insert into public.task_fields (program_id, label, kind, is_base, is_constrained)
       values ($1, $2, $3::public.field_kind, $4, $5) returning id`,
      [programId, label, kind, base, constrained],
    );
  hifz = await field("حفظ", "ranged", true, false);
  rabt = await field("ربط", "explicit", false, true);
  review = await field("مراجعة", "explicit", false, true);

  participantId = await id(
    `insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`,
    [PLAYER, programId, trackA],
  );
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
    await db.query(`delete from public.day_completions where participant_id = $1`, [participantId]);
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    await db.query(
      `delete from public.plan_versions where plan_id in (select id from public.plans where program_id = $1)`,
      [programId],
    );
    await db.query(
      `delete from public.plan_values where plan_id in (select id from public.plans where program_id = $1)`,
      [programId],
    );
    await db.query(`delete from public.plans where program_id = $1`, [programId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.track_content_ranges where track_id = any($1::uuid[])`, [[trackA, trackB]]);
    await db.query(`delete from public.content_units where program_id = $1`, [programId]);
    await db.query(`delete from public.material_sections where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
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

describe("حقول الخطة", () => {
  it("حقلٌ أساس واحد في البرنامج", async () => {
    await expect(
      db.query(
        `insert into public.task_fields (program_id, label, kind, is_base) values ($1, 'أساس ثانٍ', 'ranged', true)`,
        [programId],
      ),
    ).rejects.toThrow(/idx_task_fields_base/);
  });

  it("العددي بلا وحدة يُكمَّل «مرة» ويُفكّ من المادة — الهجرة 062", async () => {
    const { rows } = await db.query<{ count_unit: string; is_material_linked: boolean }>(
      `insert into public.task_fields (program_id, label, kind) values ($1, 'عددي', 'counted')
       returning count_unit, is_material_linked`,
      [programId],
    );
    expect(rows[0]).toEqual({ count_unit: "مرة", is_material_linked: false });
    await expect(
      db.query(`insert into public.task_fields (program_id, label, kind, is_base) values ($1, 'أساس عددي', 'counted', true)`, [
        programId,
      ]),
    ).rejects.toThrow(/chk_task_fields_properties/);
    await db.query(`delete from public.task_fields where program_id = $1 and label = 'عددي'`, [programId]);
  });
});

describe("الخطة الافتراضية والحفظ", () => {
  it("تُنشأ مرة واحدة للبرنامج", async () => {
    planId = (await asUser(ADMIN, () => db.query<{ id: string }>(`select public.fn_create_plan($1, null, false) as id`, [programId])))
      .rows[0]!.id;
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_create_plan($1, null, false)`, [programId])),
    ).rejects.toThrow(/خطة افتراضية/);
  });

  it("**الحفظ يُفحص على كل مسار يستعملها**، والنقص في التغطية تنبيهٌ لا خطأ", async () => {
    const { rows } = await save(firstDays(), 3);
    expect(rows[0]!.v).toBe(1);
    const issues = await asUser(ADMIN, () =>
      db.query<{ severity: string; message: string }>(`select severity, message from public.fn_plan_issues($1)`, [planId]),
    );
    expect(issues.rows.map((r) => r.severity)).toEqual(["warning", "warning"]);
    expect(issues.rows[0]!.message).toBe("الأول: الخطة لا تغطّي نصيب المسار كله: مجموع مقادير «حفظ» 3 من 47");
  });

  it("**BR-PLAN-03: المقيَّد لا يتجاوز ما بلغه الحفظ في يومه**", async () => {
    const values = firstDays().map((v) => (v.day === 2 && v.field_id === rabt ? { ...v, to: 3 } : v));
    await expect(save(values, 3)).rejects.toThrow(/يتجاوز ما بلغه الحفظ/);
  });

  it("الصيغة واليوم الفارغ والتكرار والمجموع", async () => {
    await expect(save([...firstDays(), { day: 1, field_id: rabt, amount: 2 }], 3)).rejects.toThrow(/«من» و«إلى»/);
    await expect(save([...firstDays(), { day: 1, field_id: hifz, amount: 2 }], 3)).rejects.toThrow(/مكرّر/);
    await expect(save(firstDays(), 4)).rejects.toThrow(/اليوم 4 بلا نشاط إلزامي/);
    await expect(save([{ day: 1, field_id: hifz, amount: 48 }], 1)).rejects.toThrow(/يتجاوز نصيب المسار/);
    await expect(save(firstDays(), 400)).rejects.toThrow(/بين 1 و366/);
  });

  it("من لا يملك الكتابة يُرفض", async () => {
    await expect(save(firstDays(), 3, OUTSIDER)).rejects.toThrow(/لا صلاحية/);
  });
});

describe("BR-PLAN-02: اليوم المتمّ مقفل", () => {
  it("**لا يتغيّر ولا تقلّ الأيام عنه**، وما بعده يُعدَّل", async () => {
    await db.query(
      `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
       values ($1, $2, $3, 1, now()), ($1, $2, $3, 2, now())`,
      [participantId, planId, trackA],
    );
    const { rows } = await asUser(ADMIN, () =>
      db.query<{ v: number }>(`select public.fn_plan_locked_through($1) as v`, [planId]),
    );
    expect(rows[0]!.v).toBe(2);

    const changed = firstDays().map((v) => (v.day === 1 ? { ...v, repetition: 10 } : v));
    await expect(save(changed, 3)).rejects.toThrow(/أتمّها مشاركون/);
    await expect(save(firstDays().filter((v) => v.day === 1), 1)).rejects.toThrow(/فلا تقلّ أيامها/);

    const later = firstDays().map((v) => (v.day === 3 && v.field_id === review ? { ...v, to: 3 } : v));
    expect((await save(later, 3)).rows[0]!.v).toBe(2);
  });

  it("**ولا تُستبدل خطة مسارٍ أتمّ أحد مشاركيه يوماً منها**", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_create_plan($1, $2, true)`, [programId, trackA])),
    ).rejects.toThrow(/فلا تُستبدل خطتهم/);
  });
});

describe("الخطة المخصّصة والنسخ", () => {
  it("تُنسخ من الافتراضية، وتحلّ محلّها في مسارها وحده، ثم يرجع المسار", async () => {
    const custom = (
      await asUser(ADMIN, () =>
        db.query<{ id: string }>(`select public.fn_create_plan($1, $2, true) as id`, [programId, trackB]),
      )
    ).rows[0]!.id;
    const copied = await db.query<{ c: number }>(
      `select count(*)::int as c from public.plan_values where plan_id = $1 and deleted_at is null`,
      [custom],
    );
    expect(copied.rows[0]!.c).toBe(6);
    const plan = async (track: string) =>
      (await db.query<{ v: string }>(`select public.fn_track_plan($1) as v`, [track])).rows[0]!.v;
    expect(await plan(trackB)).toBe(custom);
    expect(await plan(trackA)).toBe(planId);

    await asUser(ADMIN, () => db.query(`select public.fn_remove_custom_plan($1)`, [custom]));
    expect(await plan(trackB)).toBe(planId);
  });

  it("الرجوع إلى نسخة حفظٌ جديد يمرّ بالقفل", async () => {
    const version = await id(`select id from public.plan_versions where plan_id = $1 and version_number = 1`, [planId]);
    const { rows } = await asUser(ADMIN, () =>
      db.query<{ v: number }>(`select public.fn_restore_plan_version($1) as v`, [version]),
    );
    expect(rows[0]!.v).toBe(3);
    const note = await db.query<{ note: string }>(
      `select note from public.plan_versions where plan_id = $1 and version_number = 3`,
      [planId],
    );
    expect(note.rows[0]!.note).toBe("رجوع إلى النسخة 1");
  });
});

describe("حارس الحقل — الهجرة 060", () => {
  it("**حقلٌ له قيمٌ في خطة لا يتغيّر نوعه ولا يُحذف**", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`update public.task_fields set kind = 'ranged', is_constrained = false where id = $1`, [review])),
    ).rejects.toThrow(/قيمٌ في خطة/);
    await expect(
      asUser(ADMIN, () => db.query(`update public.task_fields set deleted_at = now() where id = $1`, [review])),
    ).rejects.toThrow(/قيمٌ في خطة/);
    const { rowCount } = await asUser(ADMIN, () =>
      db.query(`update public.task_fields set label = 'مراجعة الأمس' where id = $1`, [review]),
    );
    expect(rowCount).toBe(1);
  });
});

describe("حارس الخطة — الهجرة 064", () => {
  it("**لا تُكتب أيامها ولا تنتقل ولا تُحذف مقفلةً من خارج دوالّها**، والاسم مفتوح", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`update public.plans set day_count = 1 where id = $1`, [planId])),
    ).rejects.toThrow(/تُكتب من محرّرها/);
    await expect(
      asUser(ADMIN, () => db.query(`update public.plans set track_id = $1 where id = $2`, [trackB, planId])),
    ).rejects.toThrow(/لا تنتقل الخطة/);
    await expect(
      asUser(ADMIN, () => db.query(`update public.plans set deleted_at = now() where id = $1`, [planId])),
    ).rejects.toThrow(/فلا تُحذف/);
    await expect(
      asUser(ADMIN, () =>
        db.query(`insert into public.plans (program_id, track_id, name) values ($1, $2, 'مخصّصة')`, [programId, trackA]),
      ),
    ).rejects.toThrow(/فلا تُستبدل خطتهم/);
    const { rowCount } = await asUser(ADMIN, () =>
      db.query(`update public.plans set name = 'الخطة الافتراضية 1448' where id = $1`, [planId]),
    );
    expect(rowCount).toBe(1);
  });

  it("**حفظان من محرّرين: الأقدم يُرفض**", async () => {
    const latest = (
      await db.query<{ v: number }>(`select max(version_number)::int as v from public.plan_versions where plan_id = $1`, [planId])
    ).rows[0]!.v;
    const snapshot = (await db.query<{ s: unknown }>(`select public.fn_plan_snapshot($1) as s`, [planId])).rows[0]!.s;
    await expect(
      asUser(ADMIN, () =>
        db.query(`select public.fn_save_plan($1, $2::jsonb, 'قديم', $3)`, [planId, JSON.stringify(snapshot), latest - 1]),
      ),
    ).rejects.toThrow(/نسخةٌ أحدث/);
  });

  it("ما يُفسد الأيام المقفلة من خارج الحفظ يُمنع: الخصائص، والنصيب، وإزاحة المادة", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`update public.task_fields set is_required = false where id = $1`, [hifz])),
    ).rejects.toThrow(/لا تتغيّر بعدها/);
    await expect(
      db.query(`update public.track_content_ranges set to_sequence = 46 where track_id = $1`, [trackA]),
    ).rejects.toThrow(/مقاطعه لا تُعدَّل/);
    const sections = (
      await db.query<{ id: string; name: string; unit_count: number }>(
        `select id, name, unit_count from public.material_sections where program_id = $1 and deleted_at is null order by sort_order`,
        [programId],
      )
    ).rows;
    await expect(
      asUser(ADMIN, () =>
        db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [
          programId,
          JSON.stringify(sections.map((s, i) => ({ id: s.id, name: s.name, count: i === 0 ? s.unit_count - 1 : s.unit_count }))),
        ]),
      ),
    ).rejects.toThrow(/خطةٌ مبنية|نصيب مسار/);
  });

  it("المشارك يرى الافتراضية ولا يرى مخصّصة مسارٍ غير مساره", async () => {
    const custom = (
      await asUser(ADMIN, () => db.query<{ id: string }>(`select public.fn_create_plan($1, $2, true) as id`, [programId, trackB]))
    ).rows[0]!.id;
    const seen = await asUser(PLAYER, () =>
      db.query<{ id: string }>(`select id from public.plans where program_id = $1`, [programId]),
    );
    expect(seen.rows.map((r) => r.id)).toEqual([planId]);
    await expect(
      asUser(PLAYER, () => db.query(`select public.fn_plan_locked_through($1)`, [planId])),
    ).rejects.toThrow(/لا صلاحية/);
    await asUser(ADMIN, () => db.query(`select public.fn_remove_custom_plan($1)`, [custom]));
  });
});

describe("القراءة", () => {
  it("المشارك يقرأ خطة برنامجه وإتمامه", async () => {
    const plans = await asUser(PLAYER, () =>
      db.query<{ c: number }>(`select count(*)::int as c from public.plans where id = $1`, [planId]),
    );
    expect(plans.rows[0]!.c).toBe(1);
    const done = await asUser(PLAYER, () => db.query<{ c: number }>(`select count(*)::int as c from public.day_completions`));
    expect(done.rows[0]!.c).toBe(2);
  });
});
