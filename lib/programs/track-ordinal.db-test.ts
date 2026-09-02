import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * اختبارات الرتبة المحلّية للمسار — `adr/0021`.
 *
 * القاعدة التي تُفحَص: **التوليد يعمل على خطّ متّصل بالبناء**، والفجوات بين
 * مقاطع المسار تُعالَج في التحويل وحده. خطأ هنا يعني أن يُسنَد للمشارك محفوظٌ
 * ليس من مساره — وهو أخطر عطب ممكن في المرحلة الأولى.
 *
 * التركيبة المفحوصة: مسار بمقطعين متباعدين — [١..١٠] ثم [٥١..٦٠].
 * بينهما فجوة تخصّ مساراً آخر، فالرتبة ١١ يجب أن تقع على الوحدة ٥١ لا ١١.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
/** مسار ثانٍ بمقاطع مرتّبة عكس ترقيمها — يفحص أن الرتبة تتبع sort_order. */
let reversedTrackId: string;

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const section = await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار الرتبة') returning id`,
  );
  sectionId = section.rows[0]!.id;

  const program = await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug)
     values ($1, 'برنامج اختبار الرتبة', 'ordinal-test') returning id`,
    [sectionId],
  );
  programId = program.rows[0]!.id;

  const track = await db.query<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'مسار متفرّق') returning id`,
    [programId],
  );
  trackId = track.rows[0]!.id;

  await db.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
     values ($1, 1, 10, 0), ($1, 51, 60, 1)`,
    [trackId],
  );

  const reversed = await db.query<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'مسار معكوس الترتيب') returning id`,
    [programId],
  );
  reversedTrackId = reversed.rows[0]!.id;

  // المقطع المتأخر رقماً يُقدَّم ترتيباً — يقع أحياناً في المناهج
  await db.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
     values ($1, 100, 104, 0), ($1, 20, 24, 1)`,
    [reversedTrackId],
  );
});

afterAll(async () => {
  if (programId) {
    await db.query(
      `delete from public.track_content_ranges where track_id in
         (select id from public.tracks where program_id = $1)`,
      [programId],
    );
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
  }
  if (sectionId) await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db?.end();
});

async function unitAt(track: string, ordinal: number): Promise<number | null> {
  const { rows } = await db.query<{ v: number | null }>(
    `select public.fn_track_unit_at($1, $2) as v`,
    [track, ordinal],
  );
  return rows[0]?.v ?? null;
}

async function ordinalOf(track: string, sequence: number): Promise<number | null> {
  const { rows } = await db.query<{ v: number | null }>(
    `select public.fn_track_ordinal_of($1, $2) as v`,
    [track, sequence],
  );
  return rows[0]?.v ?? null;
}

describe("عدّ وحدات المسار", () => {
  it("يجمع المقاطع ولا يعدّ الفجوة", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select public.fn_track_unit_count($1) as n`,
      [trackId],
    );
    expect(rows[0]?.n).toBe(20);
  });
});

describe("الرتبة إلى رقم الوحدة", () => {
  it("أول المقطع الأول", async () => {
    expect(await unitAt(trackId, 1)).toBe(1);
  });

  it("آخر المقطع الأول", async () => {
    expect(await unitAt(trackId, 10)).toBe(10);
  });

  it("**الرتبة التالية تقفز الفجوة** إلى أول المقطع الثاني", async () => {
    expect(await unitAt(trackId, 11)).toBe(51);
  });

  it("آخر المقطع الثاني", async () => {
    expect(await unitAt(trackId, 20)).toBe(60);
  });

  it("رتبة خارج المدى تُرجع فارغاً لا صفراً ولا خطأ", async () => {
    expect(await unitAt(trackId, 21)).toBeNull();
    expect(await unitAt(trackId, 0)).toBeNull();
    expect(await unitAt(trackId, -3)).toBeNull();
  });
});

describe("رقم الوحدة إلى الرتبة", () => {
  it("داخل المقطع الأول", async () => {
    expect(await ordinalOf(trackId, 7)).toBe(7);
  });

  it("أول المقطع الثاني رتبته تلي آخر الأول", async () => {
    expect(await ordinalOf(trackId, 51)).toBe(11);
  });

  it("**وحدة في الفجوة خارج المسار** فتُرجع فارغاً", async () => {
    expect(await ordinalOf(trackId, 25)).toBeNull();
    expect(await ordinalOf(trackId, 50)).toBeNull();
    expect(await ordinalOf(trackId, 61)).toBeNull();
  });
});

describe("التحويل عكسيّ متطابق ذهاباً وإياباً", () => {
  it("كل رتبة من ١ إلى ٢٠ تعود إلى نفسها", async () => {
    for (let ordinal = 1; ordinal <= 20; ordinal += 1) {
      const sequence = await unitAt(trackId, ordinal);
      expect(sequence, `الرتبة ${ordinal} بلا وحدة`).not.toBeNull();
      expect(await ordinalOf(trackId, sequence!), `انكسر التطابق عند الرتبة ${ordinal}`).toBe(
        ordinal,
      );
    }
  });
});

describe("الرتبة تتبع sort_order لا ترتيب الأرقام", () => {
  it("المقطع المتأخر رقماً يأتي أولاً إن قُدِّم ترتيبه", async () => {
    expect(await unitAt(reversedTrackId, 1)).toBe(100);
    expect(await unitAt(reversedTrackId, 5)).toBe(104);
    expect(await unitAt(reversedTrackId, 6)).toBe(20);
    expect(await ordinalOf(reversedTrackId, 20)).toBe(6);
  });
});

describe("منع التداخل قيداً لا فحصاً", () => {
  it("مقطع يتداخل مع قائم يُرفض عند الكتابة", async () => {
    await expect(
      db.query(
        `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
         values ($1, 5, 15, 2)`,
        [trackId],
      ),
    ).rejects.toThrow(/exclusion|excl_track_ranges_no_overlap/i);
  });

  it("التماس عند الحدّ تداخل: [1..10] و[10..20] تشتركان في الوحدة ١٠", async () => {
    await expect(
      db.query(
        `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
         values ($1, 10, 20, 3)`,
        [trackId],
      ),
    ).rejects.toThrow(/exclusion|excl_track_ranges_no_overlap/i);
  });

  it("مقطع مجاور بلا تداخل يُقبل", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
       values ($1, 61, 65, 2) returning id`,
      [trackId],
    );
    expect(rows[0]?.id).toBeTruthy();
    await db.query(`delete from public.track_content_ranges where id = $1`, [rows[0]!.id]);
  });

  it("نهاية قبل بداية تُرفض", async () => {
    await expect(
      db.query(
        `insert into public.track_content_ranges (track_id, from_sequence, to_sequence)
         values ($1, 90, 80)`,
        [trackId],
      ),
    ).rejects.toThrow(/chk_track_range_order/i);
  });
});
