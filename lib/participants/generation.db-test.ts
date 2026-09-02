import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * محرّك التوليد — `BR-GEN-01/02/03` عبر أربعين يوماً.
 *
 * **أخطر منطق في المرحلة الأولى**، وأخفاه: خطأ هنا يُسنِد للمشارك محفوظاً
 * ليس من مساره، أو يقفز به فوق ما لم يحفظه — ولا يظهر إلا بعد أن يبني عليه
 * شهراً كاملاً. فالمحاكاة هنا ليست ترفاً.
 *
 * التركيبة: مسار **متفرّق** مقطعاه [١..٤٠] و[٨١..١٢٠] — ثمانون وحدة بفجوة
 * أربعين وحدة بينهما. وثلاثة حقول: حفظ نطاقي (٢) · مراجعة نطاقي (٣) ·
 * تكرار عددي (١٥). وخطة أربعين يوماً براحة كل سابع.
 *
 * ومشاركان: **منضبط** يُرسل كل شيء، و**متعثّر** يُرسل ثلاثة أيام كاملة ثم
 * ثلاثة بالحفظ وحده ثم يتوقّف.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let planId: string;
let templateId: string;
let fieldHifz: string;
let fieldMuraja: string;
let fieldTikrar: string;
let steady: string;
let struggling: string;
/** أرقام أيام الخطة مرتّبة، ومعها نوعها. */
let days: { id: string; number: number; type: string }[];
let STEADY: Who;
let STRUGGLING: Who;

const STEADY_USER = "00000000-0000-4000-8000-000000000a01";
const STRUGGLING_USER = "00000000-0000-4000-8000-000000000a02";

type Task = {
  task_field_id: string;
  label: string;
  kind: string;
  amount: string;
  ordinal_start: number | null;
  ordinal_end: number | null;
  is_done: boolean;
  range_start: number | null;
  range_end: number | null;
  submitted: boolean;
};

/** ينفّذ العمل بهوية مستخدم — الدوال تقرأ `auth.uid()` من هذا الإعداد. */
async function as<T>(userId: string, work: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    return await work();
  } finally {
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

/** الدالة تحرس نفسها، فالقراءة تكون بهوية صاحبها لا بهوية المالك. */
async function tasksOf(who: Who, dayNumber: number): Promise<Task[]> {
  const day = days.find((d) => d.number === dayNumber)!;
  return as(who.userId, async () => {
    const { rows } = await db.query<Task>(
      `select * from public.fn_plan_day_tasks($1, $2)`,
      [who.id, day.id],
    );
    return rows;
  });
}

type Who = { id: string; userId: string };

function pick(tasks: Task[], fieldId: string): Task {
  const found = tasks.find((t) => t.task_field_id === fieldId);
  if (!found) throw new Error("الحقل غير موجود في واجب اليوم");
  return found;
}

/** يُرسل يوماً بحقول محدّدة مُتَمّة. */
async function submit(who: Who, dayNumber: number, doneFields: string[]): Promise<number> {
  const day = days.find((d) => d.number === dayNumber)!;
  return as(who.userId, async () => {
    const { rows } = await db.query<{ v: number }>(
      `select public.fn_submit_day($1, $2) as v`,
      [day.id, doneFields],
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
    `insert into public.sections (name) values ('قسم اختبار التوليد') returning id`,
  );
  sectionId = section.rows[0]!.id;

  const program = await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug)
     values ($1, 'برنامج التوليد', 'generation-test') returning id`,
    [sectionId],
  );
  programId = program.rows[0]!.id;

  const track = await db.query<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'مسار متفرّق') returning id`,
    [programId],
  );
  trackId = track.rows[0]!.id;

  await db.query(
    `insert into public.content_units (program_id, sequence, label)
     select $1, g, 'حديث ' || g from generate_series(1, 120) as g`,
    [programId],
  );

  // فجوة أربعين وحدة بين المقطعين: الرتبة ٤١ تقع على الوحدة ٨١ لا ٤١.
  await db.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
     values ($1, 1, 40, 0), ($1, 81, 120, 1)`,
    [trackId],
  );

  const fields = await db.query<{ id: string; label: string }>(
    `insert into public.task_fields (program_id, label, kind, sort_order) values
       ($1, 'حفظ',   'ranged',  0),
       ($1, 'مراجعة','ranged',  1),
       ($1, 'تكرار', 'counted', 2)
     returning id, label`,
    [programId],
  );
  fieldHifz = fields.rows.find((f) => f.label === "حفظ")!.id;
  fieldMuraja = fields.rows.find((f) => f.label === "مراجعة")!.id;
  fieldTikrar = fields.rows.find((f) => f.label === "تكرار")!.id;

  const template = await db.query<{ id: string }>(
    `insert into public.day_templates (program_id, name) values ($1, 'يوم كامل') returning id`,
    [programId],
  );
  templateId = template.rows[0]!.id;

  await db.query(
    `insert into public.day_template_fields (day_template_id, task_field_id, base_amount, sort_order)
     values ($1, $2, 2, 0), ($1, $3, 3, 1), ($1, $4, 15, 2)`,
    [templateId, fieldHifz, fieldMuraja, fieldTikrar],
  );

  const plan = await db.query<{ id: string }>(
    `insert into public.plans (track_id, name) values ($1, 'خطة أربعين يوماً') returning id`,
    [trackId],
  );
  planId = plan.rows[0]!.id;

  // أربعون يوماً، راحة كل سابع — كما يولّدها `generateDays` في التطبيق.
  await db.query(
    `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
     select $1, g,
            case when g % 7 = 0 then 'rest'::public.day_type else 'normal'::public.day_type end,
            case when g % 7 = 0 then null else $2::uuid end
     from generate_series(1, 40) as g`,
    [planId, templateId],
  );

  const dayRows = await db.query<{ id: string; day_number: number; day_type: string }>(
    `select id, day_number, day_type from public.plan_days
     where plan_id = $1 and deleted_at is null order by day_number`,
    [planId],
  );
  days = dayRows.rows.map((d) => ({ id: d.id, number: d.day_number, type: d.day_type }));

  await db.query(
    `insert into auth.users (id, email, aud, role) values
       ($1, 'steady@test.local', 'authenticated', 'authenticated'),
       ($2, 'struggling@test.local', 'authenticated', 'authenticated')`,
    [STEADY_USER, STRUGGLING_USER],
  );

  // `fn_is_active` تفحص ملف التعريف لا حساب المصادقة — والإرسال يشترطها.
  await db.query(
    `insert into public.profiles (user_id, full_name, phone) values
       ($1, 'مشارك منضبط', '0500000001'),
       ($2, 'مشارك متعثّر', '0500000002')`,
    [STEADY_USER, STRUGGLING_USER],
  );

  const parts = await db.query<{ id: string; user_id: string }>(
    `insert into public.participants (user_id, program_id, track_id, status) values
       ($1, $3, $4, 'registered'),
       ($2, $3, $4, 'registered')
     returning id, user_id`,
    [STEADY_USER, STRUGGLING_USER, programId, trackId],
  );
  steady = parts.rows.find((p) => p.user_id === STEADY_USER)!.id;
  struggling = parts.rows.find((p) => p.user_id === STRUGGLING_USER)!.id;
  STEADY = { id: steady, userId: STEADY_USER };
  STRUGGLING = { id: struggling, userId: STRUGGLING_USER };
});

afterAll(async () => {
  if (sectionId) {
    await db.query(`select set_config('request.jwt.claims', '', false)`);
    await db.query(
      `delete from public.achievements where participant_id in
         (select id from public.participants where program_id in
           (select id from public.programs where section_id = $1))`,
      [sectionId],
    );
    await db.query(
      `delete from public.participants where program_id in
         (select id from public.programs where section_id = $1)`,
      [sectionId],
    );
    // مقصورٌ على مستخدمي الاختبار وحدهم — بمعرّفاتهم لا بشرط عامّ.
    await db.query(
      `delete from public.profiles where user_id in
         (select id from auth.users where email in
           ('steady@test.local', 'struggling@test.local', 'fresh@test.local'))`,
    );
    await db.query(
      `delete from auth.users where email in
         ('steady@test.local', 'struggling@test.local', 'fresh@test.local')`,
    );
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
    await db.query(`delete from public.plans where id = $1`, [planId]);
    await db.query(
      `delete from public.day_template_fields where day_template_id = $1`,
      [templateId],
    );
    await db.query(`delete from public.day_templates where id = $1`, [templateId]);
    await db.query(
      `delete from public.task_fields where program_id in
         (select id from public.programs where section_id = $1)`,
      [sectionId],
    );
    await db.query(`delete from public.track_content_ranges where track_id = $1`, [trackId]);
    await db.query(
      `delete from public.content_units where program_id in
         (select id from public.programs where section_id = $1)`,
      [sectionId],
    );
    await db.query(`delete from public.tracks where id = $1`, [trackId]);
    await db.query(`delete from public.programs where section_id = $1`, [sectionId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  await db?.end();
});

describe("اليوم الأول — التوليد يبدأ من الرتبة ١", () => {
  it("الحقل النطاقي يبدأ من أول المسار لا من أول المادة", async () => {
    const tasks = await tasksOf(STEADY, 1);
    expect(tasks).toHaveLength(3);

    const hifz = pick(tasks, fieldHifz);
    expect(hifz.ordinal_start).toBe(1);
    expect(hifz.ordinal_end).toBe(2);
    expect(hifz.range_start).toBe(1);
    expect(hifz.range_end).toBe(2);
  });

  it("المقدار = الأساسي × مضاعف اليوم", async () => {
    const tasks = await tasksOf(STEADY, 1);
    expect(Number(pick(tasks, fieldHifz).amount)).toBe(2);
    expect(Number(pick(tasks, fieldMuraja).amount)).toBe(3);
  });

  it("**الحقل العددي بلا نطاق إطلاقاً** — لا يدخل التوليد", async () => {
    const tikrar = pick(await tasksOf(STEADY, 1), fieldTikrar);
    expect(tikrar.kind).toBe("counted");
    expect(tikrar.ordinal_start).toBeNull();
    expect(tikrar.range_start).toBeNull();
    expect(Number(tikrar.amount)).toBe(15);
  });

  it("يوم الراحة بلا واجب — `BR-GEN-03`", async () => {
    expect(await tasksOf(STEADY, 7)).toHaveLength(0);
  });
});

describe("المشارك المنضبط — أربعون يوماً", () => {
  it("يُرسل كل يوم عمل، والراحة تُتجاوَز", async () => {
    for (const day of days) {
      if (day.type !== "normal") continue;
      const written = await submit(STEADY, day.number, [
        fieldHifz,
        fieldMuraja,
        fieldTikrar,
      ]);
      expect(written, `اليوم ${day.number}`).toBe(3);
    }

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.achievements
       where participant_id = $1 and deleted_at is null`,
      [steady],
    );
    // خمسة وثلاثون يوم عمل × ثلاثة حقول.
    expect(rows[0]?.n).toBe("105");
  });

  it("أول إرسال ينقل الحالة من `registered` إلى `memorizing`", async () => {
    const { rows } = await db.query<{ status: string }>(
      `select status from public.participants where id = $1`,
      [steady],
    );
    expect(rows[0]?.status).toBe("memorizing");
  });

  it("الحفظ تراكم وحدتين لكل يوم عمل — لا لكل يوم تقويم", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select max(a.ordinal_end) as n from public.achievements a
       where a.participant_id = $1 and a.task_field_id = $2 and a.is_done`,
      [steady, fieldHifz],
    );
    // ٣٥ يوم عمل × ٢ = ٧٠. ولو حُسبت الراحة لبلغت ٨٠.
    expect(rows[0]?.n).toBe(70);
  });

  it("**آخر الحفظ يقع على الوحدة ١١٠ لا ٧٠** — الفجوة عُبرت", async () => {
    const last = await db.query<{ range_end: number }>(
      `select a.range_end from public.achievements a
       join public.plan_days pd on pd.id = a.plan_day_id
       where a.participant_id = $1 and a.task_field_id = $2 and a.is_done
       order by pd.day_number desc limit 1`,
      [steady, fieldHifz],
    );
    // الرتبة ٧٠ = ٨١ + (٧٠ − ٤١) = ١١٠.
    expect(last.rows[0]?.range_end).toBe(110);
  });
});

describe("النطاق العابر للفجوة يُعرَض مقطعين", () => {
  it("**الرتب ٤٠–٤٢ تُعرَض [٤٠] و[٨١–٨٢]** لا مدىً واحداً", async () => {
    const { rows } = await db.query<{
      from_sequence: number;
      to_sequence: number;
      part_order: number;
    }>(`select * from public.fn_track_ordinal_span($1, 40, 42) order by part_order`, [trackId]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ from_sequence: 40, to_sequence: 40 });
    expect(rows[1]).toMatchObject({ from_sequence: 81, to_sequence: 82 });
  });

  it("مدىً داخل مقطع واحد يبقى مقطعاً واحداً", async () => {
    const { rows } = await db.query(
      `select * from public.fn_track_ordinal_span($1, 5, 9)`,
      [trackId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_sequence: 5, to_sequence: 9 });
  });

  it("مدىً كامل بعد الفجوة يبقى واحداً ومزاحاً", async () => {
    const { rows } = await db.query(
      `select * from public.fn_track_ordinal_span($1, 41, 45)`,
      [trackId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_sequence: 81, to_sequence: 85 });
  });

  it("**اليوم الذي عبر الفجوة فعلاً في خطة المنضبط** انقسم مقطعين", async () => {
    // مراجعة ٣ لكل يوم عمل: اليوم الرابع عشر عملاً يغطّي الرتب ٤٠–٤٢.
    const crossing = await db.query<{ ordinal_start: number; ordinal_end: number }>(
      `select a.ordinal_start, a.ordinal_end from public.achievements a
       where a.participant_id = $1 and a.task_field_id = $2 and a.is_done
         and a.ordinal_start <= 40 and a.ordinal_end > 40`,
      [steady, fieldMuraja],
    );
    expect(crossing.rows).toHaveLength(1);

    const { rows } = await db.query(
      `select * from public.fn_track_ordinal_span($1, $2, $3) order by part_order`,
      [trackId, crossing.rows[0]!.ordinal_start, crossing.rows[0]!.ordinal_end],
    );
    expect(rows.length).toBeGreaterThan(1);
  });
});

describe("المشارك المتعثّر — يُكمل من حيث وقف", () => {
  it("ثلاثة أيام كاملة، ثم ثلاثة بالحفظ وحده، ثم توقّف", async () => {
    for (const n of [1, 2, 3]) {
      expect(await submit(STRUGGLING, n, [fieldHifz, fieldMuraja, fieldTikrar]))
        .toBe(3);
    }
    for (const n of [4, 5, 6]) {
      expect(await submit(STRUGGLING, n, [fieldHifz])).toBe(3);
    }
  });

  it("الحقل غير المُتَمّ يُسجَّل بلا لقطة — الإنجاز الجزئي مرصود", async () => {
    const { rows } = await db.query<{ is_done: boolean; ordinal_end: number | null }>(
      `select a.is_done, a.ordinal_end from public.achievements a
       join public.plan_days pd on pd.id = a.plan_day_id
       where a.participant_id = $1 and a.task_field_id = $2 and pd.day_number = 4`,
      [struggling, fieldMuraja],
    );
    expect(rows[0]?.is_done).toBe(false);
    expect(rows[0]?.ordinal_end).toBeNull();
  });

  it("**حفظه تقدّم ومراجعته وقفت** — الحقلان مستقلّان في السلسلة", async () => {
    const tasks = await tasksOf(STRUGGLING, 8);

    // ستة أيام عمل × ٢ = ١٢، فالتالي ١٣.
    expect(pick(tasks, fieldHifz).ordinal_start).toBe(13);
    // ثلاثة أيام مُتَمّة × ٣ = ٩، فالتالي ١٠ — لا ٢٢.
    expect(pick(tasks, fieldMuraja).ordinal_start).toBe(10);
  });

  it("**لا يُقفَز به إلى موضع المنضبط**", async () => {
    const strugglingTasks = await tasksOf(STRUGGLING, 8);
    const steadyDay8 = await db.query<{ ordinal_start: number }>(
      `select a.ordinal_start from public.achievements a
       join public.plan_days pd on pd.id = a.plan_day_id
       where a.participant_id = $1 and a.task_field_id = $2 and pd.day_number = 8`,
      [steady, fieldMuraja],
    );

    // قبل اليوم الثامن ستة أيام عمل (السابع راحة): ٦ × ٣ = ١٨، فالبداية ١٩.
    expect(steadyDay8.rows[0]?.ordinal_start).toBe(19);
    // والمتعثّر أتمّ مراجعته ثلاثة أيام فقط: ٩، فالبداية ١٠.
    expect(pick(strugglingTasks, fieldMuraja).ordinal_start).toBe(10);
  });

  it("التوقّف لا يقفز به: اليوم الأربعون يبدأ من حيث وقف تماماً", async () => {
    const tasks = await tasksOf(STRUGGLING, 40);
    // لم يُرسل شيئاً بعد اليوم السادس، فالسلسلة لم تتحرّك.
    expect(pick(tasks, fieldHifz).ordinal_start).toBe(13);
    expect(pick(tasks, fieldMuraja).ordinal_start).toBe(10);
  });
});

describe("`BR-GEN-02` — التوليد للأمام فقط", () => {
  it("**تعديل مضاعف يومٍ أُرسِل لا يمسّ لقطته**", async () => {
    const before = await tasksOf(STRUGGLING, 2);
    const beforeEnd = pick(before, fieldHifz).ordinal_end;

    await db.query(
      `update public.plan_days set amount_multiplier = 5
       where plan_id = $1 and day_number = 2`,
      [planId],
    );

    const after = await tasksOf(STRUGGLING, 2);
    expect(pick(after, fieldHifz).ordinal_end).toBe(beforeEnd);
    expect(pick(after, fieldHifz).submitted).toBe(true);

    await db.query(
      `update public.plan_days set amount_multiplier = 1
       where plan_id = $1 and day_number = 2`,
      [planId],
    );
  });

  it("التعديل يظهر في أول يوم لم يُرسَل", async () => {
    await db.query(
      `update public.plan_days set amount_multiplier = 4
       where plan_id = $1 and day_number = 8`,
      [planId],
    );

    const tasks = await tasksOf(STRUGGLING, 8);
    // ٢ × ٤ = ٨ وحدات، من الرتبة ١٣ إلى ٢٠.
    expect(Number(pick(tasks, fieldHifz).amount)).toBe(8);
    expect(pick(tasks, fieldHifz).ordinal_end).toBe(20);

    await db.query(
      `update public.plan_days set amount_multiplier = 1
       where plan_id = $1 and day_number = 8`,
      [planId],
    );
  });

  it("لا إرسال مرتين — اللقطة تُثبَّت مرة واحدة", async () => {
    await expect(submit(STRUGGLING, 3, [fieldHifz])).rejects.toThrow(
      /أُرسل هذا اليوم سلفاً/,
    );
  });
});

describe("نهاية المسار", () => {
  it("الحقل الذي استنفد المسار يُرجَع بلا نطاق لا برقم كاذب", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select public.fn_track_unit_count($1) as n`,
      [trackId],
    );
    expect(rows[0]?.n).toBe(80);

    // مراجعة المنضبط: ٣٥ يوماً × ٣ = ١٠٥ مطلوبة على مسار من ٨٠.
    const capped = await db.query<{ ordinal_end: number }>(
      `select max(a.ordinal_end) as ordinal_end from public.achievements a
       where a.participant_id = $1 and a.task_field_id = $2 and a.is_done`,
      [steady, fieldMuraja],
    );
    expect(capped.rows[0]?.ordinal_end).toBe(80);

    const exhausted = await db.query<{ n: string }>(
      `select count(*)::text as n from public.achievements a
       where a.participant_id = $1 and a.task_field_id = $2
         and a.is_done and a.ordinal_start is null`,
      [steady, fieldMuraja],
    );
    expect(Number(exhausted.rows[0]!.n)).toBeGreaterThan(0);
  });
});

describe("الصلاحية — الدالة تحرس نفسها", () => {
  it("**لا يقرأ مشاركٌ واجبَ غيره** ولو مرّر معرّفه", async () => {
    await expect(
      as(STRUGGLING_USER, async () =>
        db.query(`select * from public.fn_plan_day_tasks($1, $2)`, [steady, days[0]!.id]),
      ),
    ).rejects.toThrow(/لا صلاحية لك/);
  });

  it("لا يُرسل يوماً لخطة ليس فيها", async () => {
    await expect(
      as("00000000-0000-4000-8000-0000000000ff", async () =>
        db.query(`select public.fn_submit_day($1, $2)`, [days[9]!.id, []]),
      ),
    ).rejects.toThrow(/لست مشاركاً/);
  });
});

describe("منع مسح يومٍ له إنجاز — وعد `س٥`", () => {
  it("**اليوم الذي أُرسِل لا يُحذف**", async () => {
    await expect(
      db.query(`select public.fn_plan_remove_day($1)`, [days[0]!.id]),
    ).rejects.toThrow(/إنجاز مسجَّل/);
  });

  it("يومٌ بلا إنجاز يُحذف عادةً", async () => {
    const fresh = await db.query<{ id: string }>(
      `insert into public.plan_days (plan_id, day_number, day_type)
       values ($1, 41, 'rest') returning id`,
      [planId],
    );
    const { rows } = await db.query<{ v: number }>(
      `select public.fn_plan_remove_day($1) as v`,
      [fresh.rows[0]!.id],
    );
    expect(rows[0]?.v).toBe(1);
  });
});

describe("الحدود — ما يحرس المحرّك من العالم حوله", () => {
  it("**تعديل مقاطع مسارٍ لمشاركيه إنجاز يُرفض** — `adr/0021`", async () => {
    // مقطع جديد بترتيب أسبق يُزيح كل الرتب بعده، فيُسنَد محفوظٌ ليس من المسار.
    await expect(
      db.query(
        `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
         values ($1, 200, 240, -1)`,
        [trackId],
      ),
    ).rejects.toThrow(/مقاطعه لا تُعدَّل/);
  });

  it("والحذف كذلك — وهو أصمت: يقصّر المسار دون رتبة المشارك", async () => {
    await expect(
      db.query(
        `delete from public.track_content_ranges where track_id = $1 and from_sequence = 1`,
        [trackId],
      ),
    ).rejects.toThrow(/مقاطعه لا تُعدَّل/);
  });

  it("والحذف الليّن كذلك — التعديل لا الحذف وحده", async () => {
    await expect(
      db.query(
        `update public.track_content_ranges set deleted_at = now()
         where track_id = $1 and from_sequence = 1`,
        [trackId],
      ),
    ).rejects.toThrow(/مقاطعه لا تُعدَّل/);
  });

  it("مسارٌ بلا إنجاز تُعدَّل مقاطعه عادةً", async () => {
    const free = await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'مسار حرّ') returning id`,
      [programId],
    );
    const { rows } = await db.query<{ id: string }>(
      `insert into public.track_content_ranges (track_id, from_sequence, to_sequence)
       values ($1, 1, 5) returning id`,
      [free.rows[0]!.id],
    );
    expect(rows[0]?.id).toBeTruthy();
    await db.query(`delete from public.track_content_ranges where id = $1`, [rows[0]!.id]);
    await db.query(`delete from public.tracks where id = $1`, [free.rows[0]!.id]);
  });

  it("**تحويل يومٍ أُرسِل إلى راحة يُرفض** — يُخفي الإنجاز ولا يمحوه", async () => {
    await expect(
      db.query(
        `update public.plan_days set day_type = 'rest', day_template_id = null where id = $1`,
        [days[0]!.id],
      ),
    ).rejects.toThrow(/إنجاز مسجَّل/);
  });

  it("مضاعف يومٍ أُرسِل يبقى قابلاً للتعديل — أثره على أول يوم لم يُرسَل", async () => {
    await db.query(`update public.plan_days set amount_multiplier = 2 where id = $1`, [
      days[0]!.id,
    ]);
    await db.query(`update public.plan_days set amount_multiplier = 1 where id = $1`, [
      days[0]!.id,
    ]);
  });
});

describe("الإرسال — الجاري وحده، في القاعدة لا في الشاشة", () => {
  let freeUser: string;
  let freeParticipant: string;

  beforeAll(async () => {
    freeUser = "00000000-0000-4000-8000-000000000a03";
    await db.query(
      `insert into auth.users (id, email, aud, role)
       values ($1, 'fresh@test.local', 'authenticated', 'authenticated')`,
      [freeUser],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone)
       values ($1, 'مشارك جديد', '0500000003')`,
      [freeUser],
    );
    const row = await db.query<{ id: string }>(
      `insert into public.participants (user_id, program_id, track_id, status)
       values ($1, $2, $3, 'registered') returning id`,
      [freeUser, programId, trackId],
    );
    freeParticipant = row.rows[0]!.id;
  });

  it("**يوم بعيد يُرفض** — وكان يُقبَل فيكتب لقطة كاذبة ويكرّر وحدتين", async () => {
    await expect(
      as(freeUser, async () =>
        db.query(`select public.fn_submit_day($1, $2)`, [days[39]!.id, []]),
      ),
    ).rejects.toThrow(/اليوم الجاري وحده/);
  });

  it("يوم الراحة يُرفض ولا يقلب الحالة", async () => {
    await expect(
      as(freeUser, async () =>
        db.query(`select public.fn_submit_day($1, $2)`, [days[6]!.id, []]),
      ),
    ).rejects.toThrow(/اليوم الجاري وحده/);

    const { rows } = await db.query<{ status: string }>(
      `select status from public.participants where id = $1`,
      [freeParticipant],
    );
    expect(rows[0]?.status).toBe("registered");
  });

  it("اليوم الأول يُقبَل، ثم يصير الجاري هو الثاني", async () => {
    const first = await as(freeUser, async () =>
      db.query<{ v: number }>(`select public.fn_submit_day($1, $2) as v`, [days[0]!.id, []]),
    );
    expect(first.rows[0]?.v).toBe(3);

    await expect(
      as(freeUser, async () =>
        db.query(`select public.fn_submit_day($1, $2)`, [days[2]!.id, []]),
      ),
    ).rejects.toThrow(/اليوم الجاري وحده/);

    const second = await as(freeUser, async () =>
      db.query<{ v: number }>(`select public.fn_submit_day($1, $2) as v`, [days[1]!.id, []]),
    );
    expect(second.rows[0]?.v).toBe(3);
  });

  it("**الحساب الموقوف لا يكتب** — الطبقة الرابعة من الفحص الرباعي", async () => {
    await db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [freeUser]);
    await expect(
      as(freeUser, async () =>
        db.query(`select public.fn_submit_day($1, $2)`, [days[2]!.id, []]),
      ),
    ).rejects.toThrow(/الحساب موقوف/);
    await db.query(`update public.profiles set deleted_at = null where user_id = $1`, [freeUser]);
  });

  it("الإرسال بلا إتمام يُقبَل — تسجيلُ يومٍ لم يُنجَز واقعةٌ لا فراغ", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.achievements
       where participant_id = $1 and is_done`,
      [freeParticipant],
    );
    expect(rows[0]?.n).toBe("0");
  });
});
