import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `fn_journey_days` و`fn_program_participants` — الهجرة ٠٢٩.
 *
 * وُجدتا لأن الشاشات كانت تقرأ الإنجاز صفوفاً خاماً فتُقطَع عند ألف صفّ.
 * فالاختبار يبني **فوق السقف عمداً**: أربعة واجبات × ثلاثمئة يوم = ١٢٠٠ صفّ،
 * ويتحقّق أن الحساب يرى الأيام كلها.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let planId: string;
let participantId: string;

const OWNER = "00000000-0000-4000-8000-0000000007a1";
const STRANGER = "00000000-0000-4000-8000-0000000007a2";
const SUBMITTED = 300;

async function asUser<T>(uid: string, sql: string, params: unknown[]): Promise<T[]> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const { rows } = await db.query(sql, params);
    return rows as T[];
  } finally {
    await db.query("rollback");
  }
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of [OWNER, STRANGER].entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `journey-days-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, $2, '+966500000000')`,
      [uid, i === 0 ? "صاحب الرحلة" : "غريب"],
    );
  }

  sectionId = (await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم أيام الرحلة') returning id`,
  )).rows[0]!.id;
  programId = (await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج أيام الرحلة', 'journey-days-test') returning id`,
    [sectionId],
  )).rows[0]!.id;
  trackId = (await db.query<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'م') returning id`,
    [programId],
  )).rows[0]!.id;

  const fields = (await db.query<{ id: string }>(
    `insert into public.task_fields (program_id, label, kind, sort_order) values
       ($1, 'أ', 'counted', 0), ($1, 'ب', 'counted', 1), ($1, 'ج', 'counted', 2), ($1, 'د', 'counted', 3)
     returning id`,
    [programId],
  )).rows;
  const templateId = (await db.query<{ id: string }>(
    `insert into public.day_templates (program_id, name) values ($1, 'يوم') returning id`,
    [programId],
  )).rows[0]!.id;
  for (const [i, f] of fields.entries()) {
    await db.query(
      `insert into public.day_template_fields (day_template_id, task_field_id, base_amount, sort_order)
       values ($1, $2, 5, $3)`,
      [templateId, f.id, i],
    );
  }
  planId = (await db.query<{ id: string }>(
    `insert into public.plans (track_id, name) values ($1, 'خطة') returning id`,
    [trackId],
  )).rows[0]!.id;
  await db.query(
    `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
     select $1, g,
            case when g % 7 = 0 then 'rest'::public.day_type else 'normal'::public.day_type end,
            case when g % 7 = 0 then null else $2::uuid end
     from generate_series(1, 366) g`,
    [planId, templateId],
  );

  participantId = (await db.query<{ id: string }>(
    `insert into public.participants (user_id, program_id, track_id, status)
     values ($1, $2, $3, 'memorizing') returning id`,
    [OWNER, programId, trackId],
  )).rows[0]!.id;

  // ٣٠٠ يوم عمل مُرسَلة. اليوم الأخير منها **جزئي**: واجب واحد من أربعة لم يُتَمّ.
  await db.query(
    `insert into public.achievements (participant_id, plan_day_id, task_field_id, is_done, amount)
     select $1, d.id, f.id,
            not (d.k = $3 and f.id = $4::uuid),
            5
     from (
       select id, row_number() over (order by day_number) as k
       from public.plan_days where plan_id = $2 and day_type = 'normal'
     ) d
     cross join (select unnest($5::uuid[]) as id) f
     where d.k <= $3`,
    [participantId, planId, SUBMITTED, fields[0]!.id, fields.map((f) => f.id)],
  );
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.achievements where participant_id = $1`, [participantId]);
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
    await db.query(`delete from public.plans where id = $1`, [planId]);
    await db.query(
      `delete from public.day_template_fields where day_template_id in
         (select id from public.day_templates where program_id = $1)`,
      [programId],
    );
    await db.query(`delete from public.day_templates where program_id = $1`, [programId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [[OWNER, STRANGER]]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [[OWNER, STRANGER]]);
  await db?.end();
});

type DayRow = {
  day_number: number;
  day_type: string;
  has_work: boolean;
  submitted: boolean;
  task_count: number;
  done_count: number;
};

describe("fn_journey_days — فوق سقف الألف صفّ", () => {
  it("**يرى الأيام المُرسَلة كلها** — ١٢٠٠ صفّ إنجاز لا تُقطَع", async () => {
    const days = await asUser<DayRow>(OWNER, `select * from public.fn_journey_days($1)`, [participantId]);
    expect(days).toHaveLength(366);
    expect(days.filter((d) => d.submitted)).toHaveLength(SUBMITTED);

    const current = days.find((d) => d.day_type === "normal" && d.has_work && !d.submitted);
    const normals = days.filter((d) => d.day_type === "normal");
    expect(current?.day_number).toBe(normals[SUBMITTED]!.day_number);
  });

  it("**يفرّق المكتمل عن الجزئي** — من اللقطة لا من شكل اليوم", async () => {
    const days = await asUser<DayRow>(OWNER, `select * from public.fn_journey_days($1)`, [participantId]);
    const normals = days.filter((d) => d.day_type === "normal");
    expect(normals[0]).toMatchObject({ task_count: 4, done_count: 4 });
    expect(normals[SUBMITTED - 1]).toMatchObject({ submitted: true, task_count: 4, done_count: 3 });
    expect(normals[SUBMITTED]).toMatchObject({ submitted: false, task_count: 4, done_count: 0 });
  });

  it("الراحة بلا عمل", async () => {
    const days = await asUser<DayRow>(OWNER, `select * from public.fn_journey_days($1)`, [participantId]);
    expect(days.find((d) => d.day_number === 7)).toMatchObject({ day_type: "rest", has_work: false });
  });

  it("**الغريب لا يرى رحلة غيره** — فراغٌ لا خطأ", async () => {
    const days = await asUser<DayRow>(STRANGER, `select * from public.fn_journey_days($1)`, [participantId]);
    expect(days).toHaveLength(0);
  });
});

describe("fn_program_participants", () => {
  it("**بلا صلاحية القراءة لا يرى أحداً** — ولو كان مشاركاً في البرنامج", async () => {
    const rows = await asUser(OWNER, `select * from public.fn_program_participants($1)`, [programId]);
    expect(rows).toHaveLength(0);
  });

  it("**الاسم والعدّ محسوبان في القاعدة**", async () => {
    // مالك القاعدة بلا هوية لا يملك الصلاحية — فيُمنح دورٌ مؤقّت في معاملة تُرجَع.
    await db.query("begin");
    try {
      const role = (await db.query<{ id: string }>(
        `insert into public.roles (name) values ('قارئ مشاركين مؤقّت') returning id`,
      )).rows[0]!.id;
      await db.query(
        `insert into public.role_permissions (role_id, permission_code) values ($1, 'participants.read')`,
        [role],
      );
      await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [STRANGER, role]);
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: STRANGER, role: "authenticated" }),
      ]);
      const { rows } = await db.query<{
        full_name: string;
        work_days: number;
        submitted_days: number;
        complete_days: number;
        total: string;
      }>(`select * from public.fn_program_participants($1)`, [programId]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        full_name: "صاحب الرحلة",
        work_days: 366 - 52,
        submitted_days: SUBMITTED,
        complete_days: SUBMITTED - 1,
      });
      expect(Number(rows[0]!.total)).toBe(1);
    } finally {
      await db.query("rollback");
    }
  });
});
