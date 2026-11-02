import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * التسجيل بابٌ واحد — سدّ الدَّين د-١٣ (الهجرة `20261102120000_register_lockdown`).
 *
 * لا يُدرج المستخدم صفّه في `participants` ولا أجوبته في `admission_answers` مباشرةً؛
 * `fn_register` (بصلاحية المالك) وحدها تُدرج بعد الشروط كلها. وصلاحيات المشرف كما هي.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackA: string;
let trackB: string;
let questionId: string;
let roleId: string;

const OK = "00000000-0000-4000-8000-0000000d0001";
const WOMAN = "00000000-0000-4000-8000-0000000d0002";
const CHILD = "00000000-0000-4000-8000-0000000d0003";
const NO_ID = "00000000-0000-4000-8000-0000000d0004";
const ABROAD = "00000000-0000-4000-8000-0000000d0005";
const ADMIN = "00000000-0000-4000-8000-0000000d0006";
const USERS = [OK, WOMAN, CHILD, NO_ID, ABROAD, ADMIN];

async function as<T extends Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number; error: string | null; code: string | null }> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const result = await db.query<T>(sql, params);
    await db.query("commit");
    return { rows: result.rows, rowCount: result.rowCount ?? 0, error: null, code: null };
  } catch (error) {
    await db.query("rollback");
    const e = error as Error & { code?: string };
    return { rows: [], rowCount: 0, error: e.message, code: e.code ?? null };
  }
}

const register = (uid: string, trackId: string | null = trackA, answer = "أقرّ") =>
  as<{ id: string }>(uid, `select public.fn_register($1, $2, $3::jsonb) as id`, [
    programId,
    trackId,
    JSON.stringify({ [questionId]: answer }),
  ]);

const clearParticipants = async () => {
  await db.query(`delete from public.audit_log where entity_table = 'participants'
                    and entity_id in (select id from public.participants where program_id = $1)`, [programId]);
  await db.query(
    `delete from public.admission_answers where participant_id in (select id from public.participants where program_id = $1)`,
    [programId],
  );
  await db.query(`delete from public.participants where program_id = $1`, [programId]);
};

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  // [المستخدم، الجنس، العمر، الجوال، رقم الهوية]
  const people: [string, string, number, string, string | null][] = [
    [OK, "male", 20, "+966501120001", "LOCK00001"],
    [WOMAN, "female", 20, "+966501120002", "LOCK00002"],
    [CHILD, "male", 5, "+966501120003", "LOCK00003"],
    [NO_ID, "male", 20, "+966501120004", null],
    [ABROAD, "male", 20, "+971501120005", "LOCK00005"],
    [ADMIN, "male", 30, "+966501120006", "LOCK00006"],
  ];
  for (const [i, [uid, gender, age, phone, nid]] of people.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `lockdown-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, first_name, father_name, grandfather_name, family_name,
                                    gender, birth_date, nationality, phone)
       values ($1, 'مسجِّل الباب', 'مسجِّل', 'أب', 'جد', 'عائلة', $2,
               ((now() at time zone 'Asia/Riyadh')::date - make_interval(years => $3))::date, 'SA', $4)`,
      [uid, gender, age, phone],
    );
    if (nid) {
      await db.query(`insert into public.profile_identities (user_id, national_id) values ($1, $2)`, [uid, nid]);
    }
  }

  sectionId = (
    await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم الباب الواحد') returning id`)
  ).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, min_age, allowed_gender, require_saudi_phone,
                                    require_identity, registration_prefix)
       values ($1, 'برنامج الباب الواحد', 'register-lockdown-test', 7, 'male', true, true, 'SN-LOCK') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  trackA = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name, sort_order) values ($1, 'المسار أ', 0) returning id`,
      [programId],
    )
  ).rows[0]!.id;
  trackB = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name, sort_order) values ($1, 'المسار ب', 1) returning id`,
      [programId],
    )
  ).rows[0]!.id;
  questionId = (
    await db.query<{ id: string }>(
      `insert into public.admission_questions (program_id, question, is_required, kind, sort_order)
       values ($1, 'أقرّ بصحة البيانات', true, 'consent', 0) returning id`,
      [programId],
    )
  ).rows[0]!.id;

  roleId = (await db.query<{ id: string }>(`insert into public.roles (name) values ('مشرف الباب الواحد') returning id`))
    .rows[0]!.id;
  await db.query(
    `insert into public.role_permissions (role_id, permission_code) values ($1, 'participants.write'), ($1, 'participants.read')`,
    [roleId],
  );
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [
    ADMIN,
    roleId,
    programId,
  ]);

  // النشر يحرسه `fn_guard_program_publish` — والاختبار يقيس التسجيل لا الجاهزية.
  await db.query(`set session_replication_role = replica`);
  await db.query(`update public.programs set status = 'published' where id = $1`, [programId]);
  await db.query(`set session_replication_role = origin`);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await clearParticipants();
  await db.query(`delete from public.user_roles where role_id = $1`, [roleId]);
  await db.query(`delete from public.role_permissions where role_id = $1`, [roleId]);
  await db.query(`delete from public.roles where id = $1`, [roleId]);
  await db.query(`delete from public.admission_questions where program_id = $1`, [programId]);
  await db.query(`delete from public.tracks where program_id = $1`, [programId]);
  await db.query(`delete from public.programs where id = $1`, [programId]);
  await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db.query(`delete from public.profile_identities where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.end();
});

describe("التسجيل بابٌ واحد (د-١٣)", () => {
  it("**الإدراج المباشر** لصفّه — بمسار أو بلا مسار — مرفوض", async () => {
    for (const track of [trackA, null]) {
      const out = await as(
        WOMAN,
        `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3)`,
        [WOMAN, programId, track],
      );
      expect(out.error).toMatch(/permission denied/);
    }
  });

  it("**إسناد مسارٍ لنفسه** بتحديث صفّه لا يمرّ، و**جواب قبولٍ مباشر** مرفوض", async () => {
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.participants (user_id, program_id) values ($1, $2) returning id`,
        [OK, programId],
      )
    ).rows[0]!.id;
    try {
      const upd = await as(OK, `update public.participants set track_id = $1 where id = $2`, [trackA, pid]);
      expect(upd.rowCount).toBe(0);
      const { rows } = await db.query<{ track_id: string | null }>(
        `select track_id from public.participants where id = $1`,
        [pid],
      );
      expect(rows[0]!.track_id).toBeNull();

      const ans = await as(
        OK,
        `insert into public.admission_answers (participant_id, question_id, answer) values ($1, $2, 'أقرّ')`,
        [pid, questionId],
      );
      expect(ans.error).toMatch(/permission denied/);
    } finally {
      await clearParticipants();
    }
  });

  it("**مستوفي الشروط** يسجّل عبر fn_register: صفّه وجوابه ورقمه وتدقيقه", async () => {
    const out = await register(OK);
    expect(out.error).toBeNull();
    const id = out.rows[0]!.id;
    const { rows } = await db.query<{ user_id: string; status: string; registration_no: number; answers: number; audits: number }>(
      `select p.user_id, p.status, p.registration_no,
              (select count(*)::int from public.admission_answers a where a.participant_id = p.id) answers,
              (select count(*)::int from public.audit_log l where l.action = 'participant_registered' and l.entity_id = p.id) audits
       from public.participants p where p.id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({ user_id: OK, status: "registered", answers: 1, audits: 1 });
    expect(rows[0]!.registration_no).toBeGreaterThan(0);
    await clearParticipants();
  });

  it("**شرطٌ ناقص** يُرفض بالرسالة المعتادة: الجنس، العمر، الهوية، الجوال", async () => {
    const cases: [string, RegExp][] = [
      [WOMAN, /هذا البرنامج للذكور/],
      [CHILD, /أدنى عمرٍ للتسجيل 7 سنوات/],
      [NO_ID, /أضف رقم هويتك أو إقامتك/],
      [ABROAD, /يُشترط جوالٌ سعودي يبدأ بـ05/],
    ];
    for (const [uid, message] of cases) {
      const out = await register(uid);
      expect(out.error, uid).toMatch(message);
      expect(out.code, uid).toBe("23514");
    }
    // والإقرار والمسار كما كانا.
    expect((await register(OK, trackA, "لا")).error).toMatch(/بغير الصيغة المقبولة/);
    expect((await register(OK, null)).error).toMatch(/اختر مسارك في البرنامج/);
  });

  it("**النافذة مغلقة** أو **الحساب موقوف**: رفضٌ برمز السياسة نفسه (42501) — فرسالة الصفحة كما كانت", async () => {
    await db.query(`update public.programs set registration_closes_at = now() - interval '1 day' where id = $1`, [
      programId,
    ]);
    try {
      const out = await register(OK);
      expect(out.code).toBe("42501");
    } finally {
      await db.query(`update public.programs set registration_closes_at = null where id = $1`, [programId]);
    }

    // الموقوف: تُصفَّر شروط الأهلية مؤقتاً، فلا يسبق مانعُ الجنس (ملفّه محجوب) فحصَ الحساب.
    await db.query(
      `update public.programs set allowed_gender = null, min_age = null, require_saudi_phone = false,
                                  require_identity = false where id = $1`,
      [programId],
    );
    await db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [OK]);
    try {
      expect((await register(OK)).code).toBe("42501");
    } finally {
      await db.query(`update public.profiles set deleted_at = null where user_id = $1`, [OK]);
      await db.query(
        `update public.programs set allowed_gender = 'male', min_age = 7, require_saudi_phone = true,
                                    require_identity = true where id = $1`,
        [programId],
      );
    }
    const { rows } = await db.query(`select 1 from public.participants where program_id = $1`, [programId]);
    expect(rows).toHaveLength(0);
  });

  it("**البرنامج غير المنشور** يُرفض «غير متاح» قبل أي رسالةٍ تكشف إعداده أو أسئلته", async () => {
    await db.query(`set session_replication_role = replica`);
    await db.query(`update public.programs set status = 'draft' where id = $1`, [programId]);
    await db.query(`set session_replication_role = origin`);
    try {
      for (const [uid, track] of [[OK, trackA], [WOMAN, null]] as const) {
        const out = await register(uid, track, "");
        expect(out.error).toMatch(/البرنامج غير متاح/);
        expect(out.error).not.toMatch(/أقرّ بصحة البيانات|للذكور|اختر مسارك/);
        expect(out.code).toBe("23514");
      }
    } finally {
      await db.query(`set session_replication_role = replica`);
      await db.query(`update public.programs set status = 'published' where id = $1`, [programId]);
      await db.query(`set session_replication_role = origin`);
    }
  });

  it("**البرنامج ممتلئ** بلا سباق: «اكتمل العدد في هذا البرنامج» كما كان", async () => {
    await db.query(`update public.programs set capacity = 1 where id = $1`, [programId]);
    try {
      await db.query(`insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3)`, [
        ADMIN,
        programId,
        trackA,
      ]);
      const out = await register(OK);
      expect(out.error).toMatch(/اكتمل العدد في هذا البرنامج/);
      expect(out.code).toBe("23514");
    } finally {
      await clearParticipants();
      await db.query(`update public.programs set capacity = null where id = $1`, [programId]);
    }
  });

  // والنقل بين مسارين يمرّ بقبول طلبه (`fn_decide_track_change`) لا بالتحديث — كما كان،
  // ويثبته `lib/participants/track-change.db-test.ts`.
  it("**المشرف** يُسند مساراً من فراغ بصلاحيته، والتحديث المباشر بين مسارين يبقى ممنوعاً كما كان", async () => {
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.participants (user_id, program_id) values ($1, $2) returning id`,
        [OK, programId],
      )
    ).rows[0]!.id;
    try {
      const assign = await as(ADMIN, `update public.participants set track_id = $1 where id = $2`, [trackA, pid]);
      expect(assign.error).toBeNull();
      expect(assign.rowCount).toBe(1);
      const move = await as(ADMIN, `update public.participants set track_id = $1 where id = $2`, [trackB, pid]);
      expect(move.error).toMatch(/تغيير المسار يمرّ بقبول طلب تغييره/);
    } finally {
      await clearParticipants();
    }
  });
});
