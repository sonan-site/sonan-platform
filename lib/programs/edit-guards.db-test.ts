import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * حرّاس تصحيح المُعِدّ — الهجرة ٠٣٣.
 *
 * لكل منعٍ حالتان: يُرفض حين يُتلف، ويمرّ حين لا يُتلف. المنع بلا الحالة الثانية
 * يُغلق التصحيح كله، والتصحيح هو ما وُجدت هذه الهجرة من أجله.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let planId: string;

const PLAYER = "00000000-0000-4000-8000-000000000ba1";

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  return rows[0] as T;
}

const softDelete = (table: string, id: string) =>
  db.query(`update public.${table} set deleted_at = now() where id = $1`, [id]);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  sectionId = (await one<{ id: string }>(
    `insert into public.sections (name) values ('قسم حرّاس التصحيح') returning id`,
  )).id;
  programId = (await one<{ id: string }>(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج التصحيح', 'edit-guards-test') returning id`,
    [sectionId],
  )).id;
  trackId = (await one<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'م') returning id`,
    [programId],
  )).id;
  await db.query(
    `insert into public.content_units (program_id, sequence, label)
     select $1, g, 'وحدة ' || g from generate_series(1, 20) g`,
    [programId],
  );
  await db.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 10)`,
    [trackId],
  );
  planId = (await one<{ id: string }>(
    `insert into public.plans (track_id, name) values ($1, 'خطة') returning id`,
    [trackId],
  )).id;

  await db.query(
    `insert into auth.users (id, email, aud, role) values ($1, 'edit-guards@test.local', 'authenticated', 'authenticated')`,
    [PLAYER],
  );
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.achievements where participant_id in (select id from public.participants where program_id = $1)`, [programId]);
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
    await db.query(`delete from public.plans where id = $1`, [planId]);
    await db.query(`delete from public.day_template_fields where day_template_id in (select id from public.day_templates where program_id = $1)`, [programId]);
    await db.query(`delete from public.day_templates where program_id = $1`, [programId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.track_content_ranges where track_id = $1`, [trackId]);
    await db.query(`delete from public.content_units where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  await db.query(`delete from auth.users where id = $1`, [PLAYER]);
  await db?.end();
});

async function unit(sequence: number): Promise<string> {
  return (await one<{ id: string }>(
    `select id from public.content_units where program_id = $1 and sequence = $2 and deleted_at is null`,
    [programId, sequence],
  )).id;
}

async function field(label: string, kind = "counted"): Promise<string> {
  return (await one<{ id: string }>(
    `insert into public.task_fields (program_id, label, kind) values ($1, $2, $3::public.field_kind) returning id`,
    [programId, label, kind],
  )).id;
}

async function template(name: string): Promise<string> {
  return (await one<{ id: string }>(
    `insert into public.day_templates (program_id, name) values ($1, $2) returning id`,
    [programId, name],
  )).id;
}

async function attach(templateId: string, fieldId: string): Promise<string> {
  return (await one<{ id: string }>(
    `insert into public.day_template_fields (day_template_id, task_field_id, base_amount) values ($1, $2, 1) returning id`,
    [templateId, fieldId],
  )).id;
}

async function dayUsing(templateId: string, dayNumber: number): Promise<string> {
  return (await one<{ id: string }>(
    `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
     values ($1, $2, 'normal', $3) returning id`,
    [planId, dayNumber, templateId],
  )).id;
}

describe("وحدة المادة", () => {
  it("**داخل نصيب مسار ← لا تُحذف**", async () => {
    await expect(softDelete("content_units", await unit(5))).rejects.toThrow(/داخل نصيب مسار/);
  });

  it("**ولا يتغيّر رقمها**", async () => {
    await expect(
      db.query(`update public.content_units set sequence = 99 where id = $1`, [await unit(6)]),
    ).rejects.toThrow(/داخل نصيب مسار/);
  });

  it("خارج كل نصيب ← تُحذف", async () => {
    const { rowCount } = await softDelete("content_units", await unit(15));
    expect(rowCount).toBe(1);
  });

  it("النصّ يُعدَّل دائماً — ولو داخل النصيب", async () => {
    const { rowCount } = await db.query(
      `update public.content_units set label = 'نصّ مصحَّح' where id = $1`,
      [await unit(3)],
    );
    expect(rowCount).toBe(1);
  });
});

describe("الواجب", () => {
  it("**مستعمَل في شكل يوم ← لا يُحذف**، وبعد إزالته منه يُحذف", async () => {
    const f = await field("واجب مستعمَل");
    const t = await template("شكل للواجب");
    const link = await attach(t, f);
    await expect(softDelete("task_fields", f)).rejects.toThrow(/مستعمَل في شكل يوم/);

    await db.query(`update public.day_template_fields set deleted_at = now() where id = $1`, [link]);
    const { rowCount } = await softDelete("task_fields", f);
    expect(rowCount).toBe(1);
  });

  it("**له إرسال ← نوعه لا يُغيَّر ولا يُحذف**", async () => {
    const f = await field("واجب مُرسَل");
    const t = await template("شكل مُرسَل");
    await attach(t, f);
    const day = await dayUsing(t, 1);
    const participant = (await one<{ id: string }>(
      `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3) returning id`,
      [PLAYER, programId, trackId],
    )).id;
    await db.query(
      `insert into public.achievements (participant_id, plan_day_id, task_field_id, is_done, amount)
       values ($1, $2, $3, true, 1)`,
      [participant, day, f],
    );

    await expect(
      db.query(`update public.task_fields set kind = 'ranged' where id = $1`, [f]),
    ).rejects.toThrow(/فنوعه لا يُغيَّر/);

    const { rowCount } = await db.query(
      `update public.task_fields set label = 'اسم مصحَّح' where id = $1`,
      [f],
    );
    expect(rowCount).toBe(1);
  });

  it("بلا إرسال ← نوعه يُغيَّر", async () => {
    const f = await field("واجب جديد");
    const { rowCount } = await db.query(
      `update public.task_fields set kind = 'ranged' where id = $1`,
      [f],
    );
    expect(rowCount).toBe(1);
  });
});

describe("شكل اليوم وواجباته", () => {
  it("**مستعمَل في خطة ← لا يُحذف**، وغير المستعمَل يُحذف", async () => {
    const used = await template("شكل في الخطة");
    await attach(used, await field("واجب أ"));
    await dayUsing(used, 2);
    await expect(softDelete("day_templates", used)).rejects.toThrow(/مستعمَل في خطة/);

    const unused = await template("شكل زائد");
    const { rowCount } = await softDelete("day_templates", unused);
    expect(rowCount).toBe(1);
  });

  it("**آخر واجب في شكلٍ مستعمَل ← لا يُزال**، وما قبله يُزال", async () => {
    const t = await template("شكل بواجبين");
    const first = await attach(t, await field("واجب ب"));
    const second = await attach(t, await field("واجب ج"));
    await dayUsing(t, 3);

    const { rowCount } = await softDelete("day_template_fields", first);
    expect(rowCount).toBe(1);
    await expect(softDelete("day_template_fields", second)).rejects.toThrow(/آخر واجب/);
  });

  it("آخر واجب في شكلٍ غير مستعمَل ← يُزال", async () => {
    const t = await template("شكل وحيد");
    const only = await attach(t, await field("واجب د"));
    const { rowCount } = await softDelete("day_template_fields", only);
    expect(rowCount).toBe(1);
  });
});

describe("رابط البرنامج", () => {
  it("مسوّدةً ← يتغيّر", async () => {
    const { rowCount } = await db.query(
      `update public.programs set slug = 'edit-guards-renamed' where id = $1`,
      [programId],
    );
    expect(rowCount).toBe(1);
  });

  it("**بعد النشر ← لا يتغيّر**، والاسم يتغيّر", async () => {
    await db.query(`update public.programs set status = 'published' where id = $1`, [programId]);
    try {
      await expect(
        db.query(`update public.programs set slug = 'edit-guards-other' where id = $1`, [programId]),
      ).rejects.toThrow(/لا يتغيّر بعد نشره/);
      const { rowCount } = await db.query(
        `update public.programs set name = 'اسم مصحَّح' where id = $1`,
        [programId],
      );
      expect(rowCount).toBe(1);
    } finally {
      await db.query(`update public.programs set status = 'draft' where id = $1`, [programId]);
    }
  });
});
