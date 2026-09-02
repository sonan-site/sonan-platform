import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * اختبارات الخطة وأيامها — س٥.
 *
 * ما يُفحَص هنا ثلاثة أشياء لا يُغني عنها اختبار تطبيقي:
 * 1. **اتساق نوع اليوم قيدٌ قاعدي** لا فحصٌ في نموذج — النموذج يُتجاوَز.
 * 2. **الترقيم يبقى متّصلاً** بعد كل إدراج وحذف ونقل. ترقيم مكسور يولّد
 *    واجباً مكسوراً، والكسر لا يظهر إلا بعد أن يبني عليه المشاركون.
 * 3. **المراجع من برنامج الخطة نفسه** — قالبٌ من برنامج آخر واجبٌ لا يخصّ أحداً.
 */

let db: Client;
let sectionId: string;
let programId: string;
let otherProgramId: string;
let trackId: string;
let otherTrackId: string;
let templateId: string;
let otherTemplateId: string;
let examId: string;
let planId: string;

async function numbers(plan: string): Promise<number[]> {
  const { rows } = await db.query<{ day_number: number }>(
    `select day_number from public.plan_days
     where plan_id = $1 and deleted_at is null order by day_number`,
    [plan],
  );
  return rows.map((r) => r.day_number);
}

async function seedDays(plan: string, count: number): Promise<void> {
  await db.query(
    `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
     select $1, g, 'normal', $2 from generate_series(1, $3) as g`,
    [plan, templateId, count],
  );
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const section = await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار الخطة') returning id`,
  );
  sectionId = section.rows[0]!.id;

  const programs = await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug) values
       ($1, 'برنامج الخطة', 'plan-test'),
       ($1, 'برنامج آخر', 'plan-test-other')
     returning id`,
    [sectionId],
  );
  programId = programs.rows[0]!.id;
  otherProgramId = programs.rows[1]!.id;

  const tracks = await db.query<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'مسار الخطة') returning id`,
    [programId],
  );
  trackId = tracks.rows[0]!.id;

  const otherTracks = await db.query<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'مسار غريب') returning id`,
    [otherProgramId],
  );
  otherTrackId = otherTracks.rows[0]!.id;

  const templates = await db.query<{ id: string }>(
    `insert into public.day_templates (program_id, name) values ($1, 'يوم كامل') returning id`,
    [programId],
  );
  templateId = templates.rows[0]!.id;

  const otherTemplates = await db.query<{ id: string }>(
    `insert into public.day_templates (program_id, name) values ($1, 'قالب غريب') returning id`,
    [otherProgramId],
  );
  otherTemplateId = otherTemplates.rows[0]!.id;

  const exams = await db.query<{ id: string }>(
    `insert into public.exams
       (program_id, name, exam_type, stage, pass_percentage, question_count,
        seconds_per_question, max_skips)
     values ($1, 'تصفية أولى', 'remote', 'interim', 80, 20, 60, 3)
     returning id`,
    [programId],
  );
  examId = exams.rows[0]!.id;

  const plans = await db.query<{ id: string }>(
    `insert into public.plans (track_id, name) values ($1, 'خطة المسار') returning id`,
    [trackId],
  );
  planId = plans.rows[0]!.id;
});

afterAll(async () => {
  if (sectionId) {
    await db.query(
      `delete from public.plan_days where plan_id in
         (select p.id from public.plans p
          join public.tracks t on t.id = p.track_id
          where t.program_id in (select id from public.programs where section_id = $1))`,
      [sectionId],
    );
    await db.query(
      `delete from public.plans where track_id in
         (select id from public.tracks
          where program_id in (select id from public.programs where section_id = $1))`,
      [sectionId],
    );
    await db.query(
      `delete from public.exams where program_id in
         (select id from public.programs where section_id = $1)`,
      [sectionId],
    );
    await db.query(
      `delete from public.day_templates where program_id in
         (select id from public.programs where section_id = $1)`,
      [sectionId],
    );
    await db.query(
      `delete from public.tracks where program_id in
         (select id from public.programs where section_id = $1)`,
      [sectionId],
    );
    await db.query(`delete from public.programs where section_id = $1`, [sectionId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  await db?.end();
});

describe("اتساق نوع اليوم — قيدٌ لا عرف", () => {
  it("اليوم العادي بلا قالب يُرفض", async () => {
    await expect(
      db.query(
        `insert into public.plan_days (plan_id, day_number, day_type) values ($1, 900, 'normal')`,
        [planId],
      ),
    ).rejects.toThrow(/chk_plan_days_type_consistency/i);
  });

  it("يوم الاختبار بلا اختبار يُرفض", async () => {
    await expect(
      db.query(
        `insert into public.plan_days (plan_id, day_number, day_type) values ($1, 901, 'exam')`,
        [planId],
      ),
    ).rejects.toThrow(/chk_plan_days_type_consistency/i);
  });

  it("يوم الاختبار بقالب يُرفض — الاختبار يستبدل الواجب لا يزاحمه", async () => {
    await expect(
      db.query(
        `insert into public.plan_days (plan_id, day_number, day_type, exam_id, day_template_id)
         values ($1, 902, 'exam', $2, $3)`,
        [planId, examId, templateId],
      ),
    ).rejects.toThrow(/chk_plan_days_type_consistency/i);
  });

  it("يوم الراحة بقالب يُرفض", async () => {
    await expect(
      db.query(
        `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
         values ($1, 903, 'rest', $2)`,
        [planId, templateId],
      ),
    ).rejects.toThrow(/chk_plan_days_type_consistency/i);
  });

  it("مضاعف صفر يُرفض", async () => {
    await expect(
      db.query(
        `insert into public.plan_days (plan_id, day_number, day_type, day_template_id, amount_multiplier)
         values ($1, 904, 'normal', $2, 0)`,
        [planId, templateId],
      ),
    ).rejects.toThrow(/chk_plan_days_multiplier/i);
  });

  it("الأنواع الثلاثة الصحيحة تُقبل", async () => {
    const { rowCount } = await db.query(
      `insert into public.plan_days (plan_id, day_number, day_type, day_template_id, exam_id) values
         ($1, 910, 'normal', $2, null),
         ($1, 911, 'rest',   null, null),
         ($1, 912, 'exam',   null, $3)`,
      [planId, templateId, examId],
    );
    expect(rowCount).toBe(3);
    await db.query(`delete from public.plan_days where plan_id = $1 and day_number >= 900`, [
      planId,
    ]);
  });
});

describe("المراجع من برنامج الخطة نفسه", () => {
  it("**قالب من برنامج آخر يُرفض**", async () => {
    await expect(
      db.query(
        `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
         values ($1, 920, 'normal', $2)`,
        [planId, otherTemplateId],
      ),
    ).rejects.toThrow(/القالب ليس من برنامج الخطة/);
  });

  it("اختبار من برنامج آخر يُرفض", async () => {
    const foreign = await db.query<{ id: string }>(
      `insert into public.exams
         (program_id, name, exam_type, stage, pass_percentage, question_count,
          seconds_per_question, max_skips)
       values ($1, 'اختبار غريب', 'remote', 'interim', 80, 10, 60, 0)
       returning id`,
      [otherProgramId],
    );
    await expect(
      db.query(
        `insert into public.plan_days (plan_id, day_number, day_type, exam_id)
         values ($1, 921, 'exam', $2)`,
        [planId, foreign.rows[0]!.id],
      ),
    ).rejects.toThrow(/الاختبار ليس من برنامج الخطة/);
  });

  it("التعديل إلى قالب غريب يُرفض أيضاً لا الإدراج وحده", async () => {
    const row = await db.query<{ id: string }>(
      `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
       values ($1, 922, 'normal', $2) returning id`,
      [planId, templateId],
    );
    await expect(
      db.query(`update public.plan_days set day_template_id = $1 where id = $2`, [
        otherTemplateId,
        row.rows[0]!.id,
      ]),
    ).rejects.toThrow(/القالب ليس من برنامج الخطة/);
    await db.query(`delete from public.plan_days where id = $1`, [row.rows[0]!.id]);
  });
});

describe("خطة واحدة لكل مسار", () => {
  it("خطة ثانية لمسار له خطة تُرفض", async () => {
    await expect(
      db.query(`insert into public.plans (track_id, name) values ($1, 'خطة ثانية')`, [trackId]),
    ).rejects.toThrow(/idx_plans_track/i);
  });
});

describe("بنية الاختبار — قيود النوع", () => {
  it("الشفهي المرحلي يُرفض: الشفهي نهائي دائماً", async () => {
    await expect(
      db.query(
        `insert into public.exams
           (program_id, name, exam_type, stage, pass_percentage, question_count,
            judge_count, award_percentage)
         values ($1, 'شفهي مرحلي', 'oral', 'interim', 80, 10, 3, 90)`,
        [programId],
      ),
    ).rejects.toThrow(/chk_exams_oral_is_final/i);
  });

  it("عن بعد بلا زمن سؤال يُرفض", async () => {
    await expect(
      db.query(
        `insert into public.exams
           (program_id, name, exam_type, stage, pass_percentage, question_count, max_skips)
         values ($1, 'ناقص', 'remote', 'interim', 80, 10, 2)`,
        [programId],
      ),
    ).rejects.toThrow(/chk_exams_settings_by_type/i);
  });

  it("شفهي بإعدادات عن بعد يُرفض — كل نوع بإعداداته وحدها", async () => {
    await expect(
      db.query(
        `insert into public.exams
           (program_id, name, exam_type, stage, pass_percentage, question_count,
            judge_count, award_percentage, seconds_per_question)
         values ($1, 'مختلط', 'oral', 'final', 80, 10, 3, 90, 60)`,
        [programId],
      ),
    ).rejects.toThrow(/chk_exams_settings_by_type/i);
  });

  it("**اختبار على مسار من برنامج آخر يُرفض** — المفتاح المركّب", async () => {
    await expect(
      db.query(
        `insert into public.exams
           (program_id, track_id, name, exam_type, stage, pass_percentage, question_count,
            judge_count, award_percentage)
         values ($1, $2, 'مسار غريب', 'oral', 'final', 80, 10, 3, 90)`,
        [programId, otherTrackId],
      ),
    ).rejects.toThrow(/exams_track_id_program_id_fkey|foreign key/i);
  });

  it("اختبار بمسار فارغ يُقبل — وهذه آلية «يسري على الكل»", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.exams
         (program_id, name, exam_type, stage, pass_percentage, question_count,
          judge_count, award_percentage)
       values ($1, 'نهائي عام', 'oral', 'final', 80, 10, 3, 90)
       returning id`,
      [programId],
    );
    expect(rows[0]?.id).toBeTruthy();
    await db.query(`delete from public.exams where id = $1`, [rows[0]!.id]);
  });

  it("اختبار على مسار من برنامجه يُقبل", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.exams
         (program_id, track_id, name, exam_type, stage, pass_percentage, question_count,
          judge_count, award_percentage)
       values ($1, $2, 'نهائي المسار', 'oral', 'final', 80, 10, 3, 90)
       returning id`,
      [programId, trackId],
    );
    expect(rows[0]?.id).toBeTruthy();
    await db.query(`delete from public.exams where id = $1`, [rows[0]!.id]);
  });
});

describe("الترقيم يبقى متّصلاً — الإدراج", () => {
  it("الإدراج في وسط خطة طويلة يزيح ما بعده بلا اصطدام", async () => {
    await seedDays(planId, 20);

    await db.query(`select public.fn_plan_insert_day($1, 5, 'rest')`, [planId]);

    expect(await numbers(planId)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));

    const { rows } = await db.query<{ day_type: string }>(
      `select day_type from public.plan_days
       where plan_id = $1 and day_number = 5 and deleted_at is null`,
      [planId],
    );
    expect(rows[0]?.day_type).toBe("rest");

    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("الإدراج في الأول يزيح الخطة كلها", async () => {
    await seedDays(planId, 5);
    await db.query(`select public.fn_plan_insert_day($1, 1, 'rest')`, [planId]);
    expect(await numbers(planId)).toEqual([1, 2, 3, 4, 5, 6]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("**رقم أبعد من النهاية يُقصَر** فلا تُفتح فجوة", async () => {
    await seedDays(planId, 3);
    await db.query(`select public.fn_plan_insert_day($1, 99, 'rest')`, [planId]);
    expect(await numbers(planId)).toEqual([1, 2, 3, 4]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("الإدراج في خطة فارغة يبدأ من ١", async () => {
    await db.query(`select public.fn_plan_insert_day($1, 7, 'rest')`, [planId]);
    expect(await numbers(planId)).toEqual([1]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });
});

describe("الترقيم يبقى متّصلاً — الحذف", () => {
  it("حذف يوم من الوسط يسحب ما بعده", async () => {
    await seedDays(planId, 10);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and day_number = 4 and deleted_at is null`,
      [planId],
    );

    await db.query(`select public.fn_plan_remove_day($1)`, [rows[0]!.id]);

    expect(await numbers(planId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("حذف الأخير لا يزيح شيئاً", async () => {
    await seedDays(planId, 4);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and day_number = 4 and deleted_at is null`,
      [planId],
    );
    await db.query(`select public.fn_plan_remove_day($1)`, [rows[0]!.id]);
    expect(await numbers(planId)).toEqual([1, 2, 3]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("حذف يوم محذوف لا يزيح مرتين", async () => {
    await seedDays(planId, 4);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and day_number = 2 and deleted_at is null`,
      [planId],
    );
    await db.query(`select public.fn_plan_remove_day($1)`, [rows[0]!.id]);
    await db.query(`select public.fn_plan_remove_day($1)`, [rows[0]!.id]);
    expect(await numbers(planId)).toEqual([1, 2, 3]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });
});

describe("الترقيم يبقى متّصلاً — النقل", () => {
  it("نقل الأول إلى الآخر يقدّم ما بينهما", async () => {
    await seedDays(planId, 5);
    const { rows } = await db.query<{ id: string; day_number: number }>(
      `select id, day_number from public.plan_days
       where plan_id = $1 and deleted_at is null order by day_number`,
      [planId],
    );
    const moved = rows[0]!.id;

    await db.query(`select public.fn_plan_move_day($1, 5)`, [moved]);

    expect(await numbers(planId)).toEqual([1, 2, 3, 4, 5]);
    const after = await db.query<{ day_number: number }>(
      `select day_number from public.plan_days where id = $1`,
      [moved],
    );
    expect(after.rows[0]?.day_number).toBe(5);

    const second = await db.query<{ day_number: number }>(
      `select day_number from public.plan_days where id = $1`,
      [rows[1]!.id],
    );
    expect(second.rows[0]?.day_number).toBe(1);

    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("نقل الأخير إلى الأول يؤخّر ما بينهما", async () => {
    await seedDays(planId, 5);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and deleted_at is null order by day_number`,
      [planId],
    );
    const moved = rows[4]!.id;

    await db.query(`select public.fn_plan_move_day($1, 1)`, [moved]);

    expect(await numbers(planId)).toEqual([1, 2, 3, 4, 5]);
    const after = await db.query<{ day_number: number }>(
      `select day_number from public.plan_days where id = $1`,
      [moved],
    );
    expect(after.rows[0]?.day_number).toBe(1);

    const wasFirst = await db.query<{ day_number: number }>(
      `select day_number from public.plan_days where id = $1`,
      [rows[0]!.id],
    );
    expect(wasFirst.rows[0]?.day_number).toBe(2);

    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("النقل إلى الموضع نفسه لا يغيّر شيئاً", async () => {
    await seedDays(planId, 4);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and day_number = 3 and deleted_at is null`,
      [planId],
    );
    await db.query(`select public.fn_plan_move_day($1, 3)`, [rows[0]!.id]);
    expect(await numbers(planId)).toEqual([1, 2, 3, 4]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("**رقم خارج المدى يُقصَر** ولا يترك فجوة", async () => {
    await seedDays(planId, 4);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and day_number = 2 and deleted_at is null`,
      [planId],
    );
    await db.query(`select public.fn_plan_move_day($1, 99)`, [rows[0]!.id]);
    expect(await numbers(planId)).toEqual([1, 2, 3, 4]);
    const after = await db.query<{ day_number: number }>(
      `select day_number from public.plan_days where id = $1`,
      [rows[0]!.id],
    );
    expect(after.rows[0]?.day_number).toBe(4);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("سلسلة عمليات متتابعة تُبقي الترقيم متّصلاً", async () => {
    await seedDays(planId, 12);

    await db.query(`select public.fn_plan_insert_day($1, 3, 'rest')`, [planId]);
    await db.query(`select public.fn_plan_insert_day($1, 8, 'rest')`, [planId]);

    const mid = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and day_number = 6 and deleted_at is null`,
      [planId],
    );
    await db.query(`select public.fn_plan_remove_day($1)`, [mid.rows[0]!.id]);

    const last = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and deleted_at is null order by day_number desc limit 1`,
      [planId],
    );
    await db.query(`select public.fn_plan_move_day($1, 1)`, [last.rows[0]!.id]);

    expect(await numbers(planId)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });
});

describe("الصلاحية — الدوال `security invoker` وسياسات الصفوف هي الفاصل", () => {
  /**
   * مستخدم مصادَق بلا `programs.write`. دوال الخطة ممنوحة لـ`authenticated`
   * كلها، فالسؤال ليس «هل يستطيع استدعاءها» بل «هل تُغيّر له شيئاً».
   */
  const STRANGER = "00000000-0000-4000-8000-0000000000ff";

  async function asStranger<T>(work: () => Promise<T>): Promise<T> {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      `select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: STRANGER, role: "authenticated" })],
    );
    try {
      return await work();
    } finally {
      await db.query("rollback");
    }
  }

  it("لا يقرأ أيام خطة لا يملك قراءة برنامجها", async () => {
    await seedDays(planId, 3);
    const rows = await asStranger(async () =>
      db.query(`select id from public.plan_days where plan_id = $1`, [planId]),
    );
    expect(rows.rowCount).toBe(0);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("**لا يُدرج يوماً** — قفل الخطة يُصفّى فتُرجع الدالة فارغاً", async () => {
    await seedDays(planId, 3);
    const { rows } = await asStranger(async () =>
      db.query<{ v: string | null }>(
        `select public.fn_plan_insert_day($1, 1, 'rest') as v`,
        [planId],
      ),
    );
    expect(rows[0]?.v).toBeNull();
    expect(await numbers(planId)).toEqual([1, 2, 3]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("**بدائيّة الإزاحة لم تعد موجودة** — لا بابَ يفتح فجوة", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = 'fn_plan_shift_days'`,
    );
    expect(rows[0]?.n).toBe("0");
  });

  it("الحذف لا يحذف شيئاً ويُرجع صفراً — رفضٌ معلَن لا نجاح صامت", async () => {
    await seedDays(planId, 4);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and day_number = 2 and deleted_at is null`,
      [planId],
    );
    const out = await asStranger(async () =>
      db.query<{ v: number }>(`select public.fn_plan_remove_day($1) as v`, [rows[0]!.id]),
    );
    expect(out.rows[0]?.v).toBe(0);
    expect(await numbers(planId)).toEqual([1, 2, 3, 4]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("النقل يُرجع صفراً بلا حركة", async () => {
    await seedDays(planId, 4);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and day_number = 1 and deleted_at is null`,
      [planId],
    );
    const out = await asStranger(async () =>
      db.query<{ v: number }>(`select public.fn_plan_move_day($1, 4) as v`, [rows[0]!.id]),
    );
    expect(out.rows[0]?.v).toBe(0);
    expect(await numbers(planId)).toEqual([1, 2, 3, 4]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });

  it("لا يُنشئ خطة ولا يُعرِّف اختباراً", async () => {
    await expect(
      asStranger(async () =>
        db.query(`insert into public.plans (track_id, name) values ($1, 'خطة دخيل')`, [
          otherTrackId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);

    await expect(
      asStranger(async () =>
        db.query(
          `insert into public.exams
             (program_id, name, exam_type, stage, pass_percentage, question_count,
              seconds_per_question, max_skips)
           values ($1, 'دخيل', 'remote', 'interim', 80, 10, 60, 0)`,
          [programId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("التزامن — القفل يُسلسِل الترقيم", () => {
  /**
   * **العطب المُصلَح، وقد أُعيد إنتاجه قبل إصلاحه:** حاذفان متزامنان كانا
   * يتركان `[1,2,3,5]` — فجوة دائمة. الأول يُزيح فيتغيّر رقم يوم الثاني،
   * والثاني كان يُزيح بالرقم الذي قرأه قبل القفل. وفهرس التفرّد يمنع التكرار
   * لا الفجوة، فلا شيء كان يكشفها.
   *
   * **الاختبار ينتظر حتى تُحجَب المعاملة الثانية فعلاً** قبل أن تُثبِّت
   * الأولى. بدون هذا الانتظار قد تكتمل الثانية بعد الأولى بلا تنازع، فيمرّ
   * الاختبار وهو لا يفحص شيئاً.
   */
  async function waitUntilBlocked(pid: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await db.query<{ blocked: boolean }>(
        `select coalesce(wait_event_type = 'Lock', false) as blocked
         from pg_stat_activity where pid = $1`,
        [pid],
      );
      if (rows[0]?.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("لم تُحجَب المعاملة الثانية — الاختبار لا يفحص تنازعاً.");
  }

  it("**حذفان متزامنان لا يتركان فجوة**", async () => {
    await seedDays(planId, 6);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.plan_days
       where plan_id = $1 and deleted_at is null order by day_number`,
      [planId],
    );
    const third = rows[2]!.id;
    const fifth = rows[4]!.id;

    const other = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await other.connect();
    try {
      const { rows: pidRows } = await other.query<{ pid: number }>(
        `select pg_backend_pid() as pid`,
      );

      await db.query("begin");
      await db.query(`select public.fn_plan_remove_day($1)`, [third]);

      const pending = other.query<{ v: number }>(
        `select public.fn_plan_remove_day($1) as v`,
        [fifth],
      );
      await waitUntilBlocked(pidRows[0]!.pid);

      await db.query("commit");
      const out = await pending;

      expect(out.rows[0]?.v).toBe(1);
      // بالرقم البائت كانت النتيجة [1,2,3,5].
      expect(await numbers(planId)).toEqual([1, 2, 3, 4]);
    } finally {
      await other.end();
      await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
    }
  });

  it("إدراجان متزامنان في الموضع نفسه لا يكسران التفرّد", async () => {
    await seedDays(planId, 4);
    const other = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await other.connect();
    try {
      const { rows: pidRows } = await other.query<{ pid: number }>(
        `select pg_backend_pid() as pid`,
      );

      await db.query("begin");
      await db.query(`select public.fn_plan_insert_day($1, 2, 'rest')`, [planId]);

      const pending = other.query(`select public.fn_plan_insert_day($1, 2, 'rest')`, [planId]);
      await waitUntilBlocked(pidRows[0]!.pid);

      await db.query("commit");
      await pending;

      expect(await numbers(planId)).toEqual([1, 2, 3, 4, 5, 6]);
    } finally {
      await other.end();
      await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
    }
  });
});

describe("حدّ طول الخطة مفروض في القاعدة", () => {
  it("الإدراج فوق الحدّ يُرفض — لا في النموذج وحده", async () => {
    const max = await db.query<{ n: number }>(`select public.fn_plan_max_days() as n`);
    const limit = max.rows[0]!.n;
    await db.query(
      `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
       select $1, g, 'normal', $2 from generate_series(1, $3) as g`,
      [planId, templateId, limit],
    );
    await expect(
      db.query(`select public.fn_plan_insert_day($1, 1, 'rest')`, [planId]),
    ).rejects.toThrow(/الحدّ الأقصى/);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
  });
});
