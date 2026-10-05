import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * النشر لا يقع قبل الجاهزية — الهجرة ٠٤٢ · `adr/0029`.
 *
 * الحارس في القاعدة لا في الشاشة: زرٌّ معطَّل يُتجاوَز بطلبٍ مباشر، والبرنامج
 * الفارغ المنشور يُفتح تسجيله فيدخله الناس إلى لا شيء.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let fieldId: string;
let planId: string;

async function publish(): Promise<void> {
  await db.query(`update public.programs set status = 'published' where id = $1`, [programId]);
}

async function statusOf(): Promise<string> {
  const { rows } = await db.query<{ status: string }>(
    `select status from public.programs where id = $1`,
    [programId],
  );
  return rows[0]!.status;
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  sectionId = (await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار النشر') returning id`,
  )).rows[0]!.id;
  programId = (await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج النشر', 'publish-guard-test') returning id`,
    [sectionId],
  )).rows[0]!.id;
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.page_blocks where program_id = $1`, [programId]);
    await db.query(`delete from public.plan_values where plan_id = $1`, [planId]);
    await db.query(`delete from public.plans where id = $1`, [planId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.track_content_ranges where track_id = $1`, [trackId]);
    await db.query(`delete from public.content_units where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  await db?.end();
});

describe("حارس النشر", () => {
  it("**البرنامج الفارغ لا يُنشر، والرسالة تسمّي الناقص**", async () => {
    await expect(publish()).rejects.toThrow(/لا يُنشر البرنامج قبل: المسارات · المادة/);
    expect(await statusOf()).toBe("draft");
  });

  it("ومسارٌ بلا نصيب ولا خطة يبقى ناقصاً", async () => {
    trackId = (await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'مسار النشر') returning id`,
      [programId],
    )).rows[0]!.id;
    await db.query(
      `insert into public.content_units (program_id, sequence, label)
       select $1, g, 'وحدة ' || g from generate_series(1, 10) as g`,
      [programId],
    );

    await expect(publish()).rejects.toThrow(/نصيب كل مسار من المادة/);
    await expect(publish()).rejects.toThrow(/حقول الخطة/);
  });

  it("والخطة بلا قيم لا تُعَدّ خطة", async () => {
    await db.query(
      `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
       values ($1, 1, 10, 0)`,
      [trackId],
    );
    fieldId = (await db.query<{ id: string }>(
      `insert into public.task_fields (program_id, label, kind, sort_order, is_base)
       values ($1, 'حفظ', 'ranged', 0, true) returning id`,
      [programId],
    )).rows[0]!.id;
    // الافتراضية للبرنامج كله — يرثها المسار (adr/0038).
    planId = (await db.query<{ id: string }>(
      `insert into public.plans (program_id, name, day_count) values ($1, 'خطة النشر', 5) returning id`,
      [programId],
    )).rows[0]!.id;

    await expect(publish()).rejects.toThrow(/خطة لكل مسار/);
  });

  it("وتبقى الصفحة المعلنة آخر ما يُشترط", async () => {
    await db.query(
      `insert into public.plan_values (plan_id, day_number, task_field_id, amount)
       select $1, g, $2, 2 from generate_series(1, 5) as g`,
      [planId, fieldId],
    );
    await expect(publish()).rejects.toThrow(/الصفحة المعلنة/);
  });

  it("**فإذا اكتملت الأساسيات نُشر**", async () => {
    await db.query(
      `insert into public.page_blocks (program_id, block_type, sort_order, content)
       values ($1, 'header', 0, '{"title":"برنامج النشر"}'::jsonb)`,
      [programId],
    );
    await publish();
    expect(await statusOf()).toBe("published");
  });

  it("والتراجع بلا شرط — المسوّدة والإغلاق لا يُحرسان", async () => {
    await db.query(`update public.programs set status = 'draft' where id = $1`, [programId]);
    expect(await statusOf()).toBe("draft");
    await db.query(`delete from public.page_blocks where program_id = $1`, [programId]);
    await db.query(`update public.programs set status = 'closed' where id = $1`, [programId]);
    expect(await statusOf()).toBe("closed");
  });
});
