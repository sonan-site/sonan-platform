import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * لوحة المتابعة — الهجرة ٠٤٦ · `adr/0033`.
 *
 * ثلاث دوال تُرشّح بالصلاحية **في القاعدة**: من لا يملك الرمز لا يُرجَع له صفّ.
 * وأهمّ ما يُفحَص هنا أن مشاركة صاحبها **لا تختفي بإغلاق برنامجها** — فسياسة
 * قراءة البرامج تُظهر المنشور وحده، وكان الصفّ يسقط كلّه بلا بطاقة ولا رسالة.
 */

let db: Client;
let sectionId: string;
let openProgram: string;
let closedProgram: string;
let readyTrack: string;
let planlessTrack: string;
let archivedTrack: string;
let templateId: string;
let fieldId: string;
let planId: string;
let ownerOpen: string;
let ownerClosed: string;
let otherParticipant: string;
let roleId: string;

const OWNER = "00000000-0000-4000-8000-000000000e11";
const OTHER = "00000000-0000-4000-8000-000000000e12";
const ADMIN = "00000000-0000-4000-8000-000000000e13";
const OUTSIDER = "00000000-0000-4000-8000-000000000e14";
const INVITED = "00000000-0000-4000-8000-000000000e15";
const USERS = [OWNER, OTHER, ADMIN, OUTSIDER, INVITED];

const GRANTS = [
  "programs.read",
  "programs.write",
  "participants.read",
  "participants.write",
  "users.read",
];

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

type Attention = { kind: string; program_id: string | null; amount: number };

async function attentionFor(uid: string): Promise<Attention[]> {
  const { rows } = await asUser(uid, () =>
    db.query<Attention>(`select kind, program_id, amount from public.fn_attention_items()`),
  );
  return rows;
}

function pick(rows: Attention[], kind: string, programId?: string): Attention | undefined {
  return rows.find((r) => r.kind === kind && (!programId || r.program_id === programId));
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `dashboard-${i}@test.local`],
    );
    // المدعوّ بلا ملف بقصد: هذه حالة «حساب بلا ملفّ مكتمل».
    if (uid !== INVITED) {
      await db.query(
        `insert into public.profiles (user_id, full_name, phone) values ($1, 'مشارك اللوحة', $2)`,
        [uid, `+96650000040${i}`],
      );
    }
  }

  sectionId = (
    await db.query<{ id: string }>(
      `insert into public.sections (name) values ('قسم اختبار اللوحة') returning id`,
    )
  ).rows[0]!.id;

  // برنامجٌ يُنشَر بمسارٍ واحدٍ جاهز، وسعته مقعدان — فيكتمل بمشاركَين.
  openProgram = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, capacity)
       values ($1, 'برنامج اللوحة', 'dashboard-test', 2) returning id`,
      [sectionId],
    )
  ).rows[0]!.id;

  readyTrack = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'المسار الجاهز') returning id`,
      [openProgram],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.content_units (program_id, sequence, label)
     select $1, g, 'وحدة ' || g from generate_series(1, 10) as g`,
    [openProgram],
  );
  await db.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
     values ($1, 1, 10, 0)`,
    [readyTrack],
  );
  fieldId = (
    await db.query<{ id: string }>(
      `insert into public.task_fields (program_id, label, kind, sort_order)
       values ($1, 'حفظ', 'ranged', 0) returning id`,
      [openProgram],
    )
  ).rows[0]!.id;
  templateId = (
    await db.query<{ id: string }>(
      `insert into public.day_templates (program_id, name) values ($1, 'يوم') returning id`,
      [openProgram],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.day_template_fields (day_template_id, task_field_id, base_amount, sort_order)
     values ($1, $2, 2, 0)`,
    [templateId, fieldId],
  );
  planId = (
    await db.query<{ id: string }>(
      `insert into public.plans (track_id, name) values ($1, 'خطة اللوحة') returning id`,
      [readyTrack],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
     select $1, g, 'normal', $2 from generate_series(1, 5) as g`,
    [planId, templateId],
  );
  await db.query(
    `insert into public.page_blocks (program_id, block_type, sort_order, content)
     values ($1, 'header', 0, '{"title":"برنامج اللوحة"}'::jsonb)`,
    [openProgram],
  );
  await db.query(`update public.programs set status = 'published' where id = $1`, [openProgram]);

  // **بعد** النشر: مسارٌ بلا خطة — وحارس النشر يفحص عند الانتقال وحده فلا يراه.
  planlessTrack = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'مسار بلا خطة') returning id`,
      [openProgram],
    )
  ).rows[0]!.id;

  archivedTrack = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'مسار مؤرشف') returning id`,
      [openProgram],
    )
  ).rows[0]!.id;

  ownerOpen = (
    await db.query<{ id: string }>(
      `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3) returning id`,
      [OWNER, openProgram, readyTrack],
    )
  ).rows[0]!.id;
  otherParticipant = (
    await db.query<{ id: string }>(
      `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3) returning id`,
      [OTHER, openProgram, archivedTrack],
    )
  ).rows[0]!.id;
  // الأرشفة مباشرةً — `fn_archive_track` تمنعها، والكتابة المباشرة تلتفّ عليها.
  await db.query(`update public.tracks set deleted_at = now() where id = $1`, [archivedTrack]);

  // برنامجٌ مغلق ومشاركُه ما زال يتبع الخطة.
  closedProgram = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, status, contact)
       values ($1, 'برنامج مغلق', 'dashboard-closed-test', 'closed', 'sonan@test.local') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  ownerClosed = (
    await db.query<{ id: string }>(
      `insert into public.participants (user_id, program_id) values ($1, $2) returning id`,
      [OWNER, closedProgram],
    )
  ).rows[0]!.id;

  await db.query(
    `insert into public.track_change_requests
       (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage)
     values ($1, $2, $3, 'up', 'تجربة اللوحة', 40)`,
    [ownerOpen, readyTrack, planlessTrack],
  );

  roleId = (
    await db.query<{ id: string }>(
      `insert into public.roles (name) values ('دور اختبار اللوحة') returning id`,
    )
  ).rows[0]!.id;
  for (const code of GRANTS) {
    await db.query(
      `insert into public.role_permissions (role_id, permission_code) values ($1, $2)`,
      [roleId, code],
    );
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    ADMIN,
    roleId,
  ]);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  if (openProgram) {
    await db.query(
      `delete from public.track_change_requests where participant_id = any($1::uuid[])`,
      [[ownerOpen, ownerClosed, otherParticipant].filter(Boolean)],
    );
    await db.query(`delete from public.achievements where participant_id = any($1::uuid[])`, [
      [ownerOpen, ownerClosed, otherParticipant].filter(Boolean),
    ]);
    await db.query(`delete from public.participants where program_id = any($1::uuid[])`, [
      [openProgram, closedProgram].filter(Boolean),
    ]);
    await db.query(`delete from public.page_blocks where program_id = $1`, [openProgram]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
    await db.query(`delete from public.plans where id = $1`, [planId]);
    await db.query(`delete from public.day_template_fields where day_template_id = $1`, [
      templateId,
    ]);
    await db.query(`delete from public.day_templates where id = $1`, [templateId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [openProgram]);
    await db.query(`delete from public.track_content_ranges where track_id = $1`, [readyTrack]);
    await db.query(`delete from public.content_units where program_id = $1`, [openProgram]);
    await db.query(`delete from public.tracks where program_id = $1`, [openProgram]);
    await db.query(`delete from public.programs where id = any($1::uuid[])`, [
      [openProgram, closedProgram].filter(Boolean),
    ]);
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

describe("ما يحتاج انتباه الإدارة", () => {
  it("**ومن لا صلاحية له لا يرى شيئاً** — الترشيح في القاعدة لا في الشاشة", async () => {
    expect(await attentionFor(OUTSIDER)).toHaveLength(0);
  });

  it("**مشاركٌ حيٌّ على مسارٍ مؤرشف يظهر**", async () => {
    const item = pick(await attentionFor(ADMIN), "orphan_track", openProgram);
    expect(item?.amount).toBe(1);
  });

  it("**ومسارٌ أُضيف بعد النشر بلا خطة** — وحارس النشر لا يراه", async () => {
    const item = pick(await attentionFor(ADMIN), "track_without_plan", openProgram);
    expect(item?.amount).toBe(1);
  });

  it("وطلب النقل المعلّق يُعَدّ مرّة واحدة", async () => {
    const item = pick(await attentionFor(ADMIN), "track_change", openProgram);
    expect(item?.amount).toBe(1);
  });

  it("وبرنامجٌ مغلقٌ ومشاركُه يتبع الخطة", async () => {
    const item = pick(await attentionFor(ADMIN), "closed_with_followers", closedProgram);
    expect(item?.amount).toBe(1);
  });

  it("**ومنشورٌ بلا جهة تواصل** — والمغلق الذي ضبطها لا يظهر", async () => {
    const rows = await attentionFor(ADMIN);
    expect(pick(rows, "no_contact", openProgram)).toBeDefined();
    expect(pick(rows, "no_contact", closedProgram)).toBeUndefined();
  });

  it("واكتمال المقعد يظهر بسعته", async () => {
    const item = pick(await attentionFor(ADMIN), "full", openProgram);
    expect(item?.amount).toBe(2);
  });

  it("وحسابٌ بلا ملف يُعَدّ، ولا يراه من لا يقرأ المستخدمين", async () => {
    expect(pick(await attentionFor(ADMIN), "profile_missing")?.amount).toBeGreaterThan(0);
    expect(pick(await attentionFor(OWNER), "profile_missing")).toBeUndefined();
  });
});

describe("واجبات صاحب الحساب", () => {
  it("**لا يرى أحدٌ واجبات غيره**", async () => {
    const { rows } = await asUser(OTHER, () =>
      db.query<{ participant_id: string }>(`select participant_id from public.fn_my_duties()`),
    );
    expect(rows.map((r) => r.participant_id)).not.toContain(ownerOpen);
  });

  it("**والمشاركة لا تختفي بإغلاق برنامجها** — والاسم يصل صاحبه", async () => {
    const { rows } = await asUser(OWNER, () =>
      db.query<{ participant_id: string; program_name: string; program_status: string }>(
        `select participant_id, program_name, program_status from public.fn_my_duties()`,
      ),
    );
    const closed = rows.find((r) => r.participant_id === ownerClosed);
    expect(closed?.program_name).toBe("برنامج مغلق");
    expect(closed?.program_status).toBe("closed");
  });

  it("**واليوم الجاري أول يوم عملٍ لم يُرسَل**، ومعه اقتراح النقل", async () => {
    const { rows } = await asUser(OWNER, () =>
      db.query<{
        participant_id: string;
        work_days: number;
        current_day: number | null;
        proposed_track: string | null;
      }>(
        `select participant_id, work_days, current_day, proposed_track from public.fn_my_duties()`,
      ),
    );
    const open = rows.find((r) => r.participant_id === ownerOpen);
    expect(open?.work_days).toBe(5);
    expect(open?.current_day).toBe(1);
    expect(open?.proposed_track).toBe("مسار بلا خطة");
  });

  it("ومن لا مسار له لا أيام عمل له، فلا يوم جارٍ", async () => {
    const { rows } = await asUser(OWNER, () =>
      db.query<{ participant_id: string; work_days: number; current_day: number | null }>(
        `select participant_id, work_days, current_day from public.fn_my_duties()`,
      ),
    );
    const closed = rows.find((r) => r.participant_id === ownerClosed);
    expect(closed?.work_days).toBe(0);
    expect(closed?.current_day).toBeNull();
  });

  it("**والإرسال يُقدّم اليوم الجاري** ويُسجَّل آخر إرسال", async () => {
    const dayOne = (
      await db.query<{ id: string }>(
        `select id from public.plan_days where plan_id = $1 and day_number = 1`,
        [planId],
      )
    ).rows[0]!.id;
    await db.query(
      `insert into public.achievements (participant_id, plan_day_id, task_field_id, is_done)
       values ($1, $2, $3, true)`,
      [ownerOpen, dayOne, fieldId],
    );

    const { rows } = await asUser(OWNER, () =>
      db.query<{
        participant_id: string;
        current_day: number | null;
        submitted_days: number;
        complete_days: number;
        last_submitted_at: string | null;
      }>(
        `select participant_id, current_day, submitted_days, complete_days, last_submitted_at
           from public.fn_my_duties()`,
      ),
    );
    const open = rows.find((r) => r.participant_id === ownerOpen);
    expect(open?.current_day).toBe(2);
    expect(open?.submitted_days).toBe(1);
    expect(open?.complete_days).toBe(1);
    expect(open?.last_submitted_at).not.toBeNull();
  });
});

describe("أعداد مداخل الأقسام", () => {
  it("**من يقرأ البرامج يعدّها، ومن لا يقرأها يأخذ صفراً**", async () => {
    const admin = await asUser(ADMIN, () =>
      db.query<{ programs: number; published: number; participants: number; role_holders: number }>(
        `select * from public.fn_dashboard_counts()`,
      ),
    );
    expect(admin.rows[0]!.programs).toBeGreaterThanOrEqual(2);
    expect(admin.rows[0]!.published).toBeGreaterThanOrEqual(1);
    expect(admin.rows[0]!.participants).toBeGreaterThanOrEqual(3);
    expect(admin.rows[0]!.role_holders).toBeGreaterThanOrEqual(1);

    const outsider = await asUser(OUTSIDER, () =>
      db.query<{
        programs: number;
        published: number;
        participants: number;
        role_holders: number;
      }>(`select * from public.fn_dashboard_counts()`),
    );
    expect(outsider.rows[0]).toEqual({
      programs: 0,
      published: 0,
      participants: 0,
      role_holders: 0,
    });
  });
});
