import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * سؤال القبول «اختيار واحد من قائمة» (الهجرتان `20261103090000`/`20261103090100`).
 *
 * الخيارات مع السؤال بترتيبها، و`fn_register` لا يقبل إلا واحداً منها بنصّه، وتُقفل بعد
 * أول إجابة إلا الإضافة في آخرها، ويُعدّ من اختار كل خيار لمن يقرأ المشاركين.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let listQ: string;
let roleId: string;

const OPTIONS = ["قناة الجمعية في الواتساب", "قروب واتساب", "منصة X", "أخرى"];
const A = "00000000-0000-4000-8000-0000000e0001";
const B = "00000000-0000-4000-8000-0000000e0002";
const READER = "00000000-0000-4000-8000-0000000e0003";
const USERS = [A, B, READER];

async function as<T extends Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null; code: string | null }> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const { rows } = await db.query<T>(sql, params);
    await db.query("commit");
    return { rows, error: null, code: null };
  } catch (error) {
    await db.query("rollback");
    const e = error as Error & { code?: string };
    return { rows: [], error: e.message, code: e.code ?? null };
  }
}

const register = (uid: string, answers: Record<string, string>) =>
  as<{ id: string }>(uid, `select public.fn_register($1, $2, $3::jsonb) as id`, [
    programId,
    trackId,
    JSON.stringify(answers),
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

const setOptions = (options: string[] | null, kind = "list") =>
  db.query(`update public.admission_questions set kind = $1::public.admission_kind, options = $2 where id = $3`, [
    kind,
    options,
    listQ,
  ]);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `admission-list-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, gender, birth_date, nationality, phone)
       values ($1, 'مجيب القائمة', 'male', '1990-01-01', 'SA', '+96650113000' || $2)`,
      [uid, i],
    );
  }
  sectionId = (
    await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم سؤال القائمة') returning id`)
  ).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug) values ($1, 'برنامج سؤال القائمة', 'admission-list-test')
       returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  trackId = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name, sort_order) values ($1, 'مسار', 0) returning id`,
      [programId],
    )
  ).rows[0]!.id;
  listQ = (
    await db.query<{ id: string }>(
      `insert into public.admission_questions (program_id, question, is_required, kind, options, sort_order)
       values ($1, 'كيف عرفت عن المسابقة؟', true, 'list', $2, 0) returning id`,
      [programId, OPTIONS],
    )
  ).rows[0]!.id;

  roleId = (await db.query<{ id: string }>(`insert into public.roles (name) values ('قارئ القائمة') returning id`))
    .rows[0]!.id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'participants.read')`, [
    roleId,
  ]);
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [
    READER,
    roleId,
    programId,
  ]);

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
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.end();
});

describe("سؤال القائمة", () => {
  it("**قيد الخيارات**: للقائمة وحدها، ٢ فأكثر، مشذَّبة، بلا تكرار", async () => {
    await expect(setOptions(null)).rejects.toThrow(/chk_admission_questions_options/);
    await expect(setOptions(["وحيد"])).rejects.toThrow(/chk_admission_questions_options/);
    await expect(setOptions(["أ", "أ"])).rejects.toThrow(/chk_admission_questions_options/);
    await expect(setOptions([" أ", "ب"])).rejects.toThrow(/chk_admission_questions_options/);
    await expect(setOptions(["أ", "ب"], "text")).rejects.toThrow(/chk_admission_questions_options/);
    await setOptions(OPTIONS);
  });

  it("**بلا جواب** يُرفض برسالة الأسئلة الإلزامية، و**بخيارٍ من خارجها** بغير الصيغة", async () => {
    expect((await register(A, {})).error).toMatch(/أجب عن الأسئلة الإلزامية: كيف عرفت عن المسابقة؟/);
    expect((await register(A, { [listQ]: "تويتر" })).error).toMatch(/بغير الصيغة المقبولة: كيف عرفت/);
  });

  it("**بخيارٍ منها** يمرّ، ويُحفظ نصّ الخيار في admission_answers", async () => {
    const out = await register(A, { [listQ]: "منصة X" });
    expect(out.error).toBeNull();
    const { rows } = await db.query<{ answer: string }>(
      `select answer from public.admission_answers where participant_id = $1 and question_id = $2`,
      [out.rows[0]!.id, listQ],
    );
    expect(rows[0]!.answer).toBe("منصة X");
  });

  it("**القفل بعد أول إجابة**: لا تغيير ولا ترتيب ولا نوع — والإضافة في الآخر ونصّ السؤال مسموحان", async () => {
    await expect(setOptions(["قناة الجمعية", ...OPTIONS.slice(1)])).rejects.toThrow(/للسؤال إجابات/);
    await expect(setOptions([...OPTIONS].reverse())).rejects.toThrow(/للسؤال إجابات/);
    await expect(db.query(`update public.admission_questions set kind = 'text', options = null where id = $1`, [listQ]))
      .rejects.toThrow(/للسؤال إجابات/);
    await setOptions([...OPTIONS, "صندوق عائلي"]);
    await db.query(`update public.admission_questions set question = 'كيف عرفت عن المسابقة؟' , sort_order = 0 where id = $1`, [
      listQ,
    ]);
    await setOptions(OPTIONS.concat("صندوق عائلي"));
  });

  it("**الأنواع الأخرى** يبقى تغييرها بعد الإجابة كما كان — القفل لأسئلة القائمة وحدها", async () => {
    const other = (
      await db.query<{ id: string }>(
        `insert into public.admission_questions (program_id, question, is_required, kind, sort_order)
         values ($1, 'سؤالٌ مكتوب', false, 'text', 1) returning id`,
        [programId],
      )
    ).rows[0]!.id;
    try {
      await db.query(
        `insert into public.admission_answers (participant_id, question_id, answer)
         select id, $1, 'جواب' from public.participants where program_id = $2 and deleted_at is null limit 1`,
        [other, programId],
      );
      await db.query(`update public.admission_questions set kind = 'choice' where id = $1`, [other]);
    } finally {
      await db.query(`delete from public.admission_answers where question_id = $1`, [other]);
      await db.query(`delete from public.admission_questions where id = $1`, [other]);
    }
  });

  it("**العدّ**: لكل خيارٍ بترتيبه، ويستثني المحذوف، ولا يصله بلا صلاحية", async () => {
    const b = await register(B, { [listQ]: "منصة X" });
    expect(b.error).toBeNull();
    await db.query(`update public.participants set deleted_at = now() where id = $1`, [b.rows[0]!.id]);

    const { rows, error } = await as<{ option: string; ordinal: number; answered: number }>(
      READER,
      `select option, ordinal, answered from public.fn_admission_option_counts($1)`,
      [programId],
    );
    expect(error).toBeNull();
    expect(rows.map((r) => r.option)).toEqual([...OPTIONS, "صندوق عائلي"]);
    expect(rows.find((r) => r.option === "منصة X")!.answered).toBe(1);
    expect(rows.filter((r) => r.option !== "منصة X").every((r) => r.answered === 0)).toBe(true);

    const denied = await as(A, `select * from public.fn_admission_option_counts($1)`, [programId]);
    expect(denied.code).toBe("42501");
  });
});
