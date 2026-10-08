import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { now } from "@/lib/format";

/**
 * أهلية البرنامج ورقم التسجيل وصرامة أجوبة القبول (`adr/0047`، الهجرة ٠٧٤).
 *
 * الموانع من `fn_registration_blockers` وحدها، و`fn_register` يرفض بأولها.
 * والرقم متسلسلٌ في البرنامج لا يكتبه المسجِّل ولا يتكرّر.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let choiceQ: string;
let consentQ: string;

// ذكرٌ بالغ بجوال سعودي وهوية كاملة — المؤهَّل.
const ADULT = "00000000-0000-4000-8000-000000000f81";
// ذكرٌ في الخامسة — دون الحدّ.
const CHILD = "00000000-0000-4000-8000-000000000f82";
// أنثى بالغة.
const WOMAN = "00000000-0000-4000-8000-000000000f83";
// ذكرٌ بالغ بجوالٍ إماراتي وبلا هوية.
const ABROAD = "00000000-0000-4000-8000-000000000f84";
// ذكرٌ في الثانية عشرة بهوية بلا جوال وليّ أمر، ثم به.
const MINOR = "00000000-0000-4000-8000-000000000f85";
const USERS = [ADULT, CHILD, WOMAN, ABROAD, MINOR];

const yearsAgo = (n: number) => `${now().getUTCFullYear() - n}-01-01`;

async function as<T extends Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; error: string | null }> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const { rows } = await db.query<T>(sql, params);
    await db.query("commit");
    return { rows, error: null };
  } catch (error) {
    await db.query("rollback");
    return { rows: [], error: (error as Error).message };
  }
}

const blockers = async (uid: string) =>
  (await as<{ b: string[] }>(uid, `select public.fn_registration_blockers($1) as b`, [programId])).rows[0]!.b;

const register = (uid: string, answers: Record<string, string>) =>
  as<{ id: string }>(uid, `select public.fn_register($1, $2, $3::jsonb) as id`, [
    programId,
    trackId,
    JSON.stringify(answers),
  ]);

const goodAnswers = () => ({ [choiceQ]: "لا", [consentQ]: "أقرّ" });

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const people: [string, string, string, string, string | null][] = [
    [ADULT, "male", yearsAgo(30), "+966501110001", "1100000001"],
    [CHILD, "male", yearsAgo(5), "+966501110002", "1100000002"],
    [WOMAN, "female", yearsAgo(30), "+966501110003", "1100000003"],
    [ABROAD, "male", yearsAgo(30), "+971501110004", null],
    [MINOR, "male", yearsAgo(12), "+966501110005", "1100000005"],
  ];
  for (const [i, [uid, gender, birth, phone, nid]] of people.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `elig-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, first_name, father_name, grandfather_name, family_name,
                                    gender, birth_date, nationality, phone)
       values ($1, 'مسجِّل الأهلية', 'مسجِّل', 'أب', 'جد', 'عائلة', $2, $3, 'SA', $4)`,
      [uid, gender, birth, phone],
    );
    if (nid) {
      await db.query(`insert into public.profile_identities (user_id, national_id) values ($1, $2)`, [uid, nid]);
    }
  }

  sectionId = (
    await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم الأهلية') returning id`)
  ).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, min_age, allowed_gender, require_saudi_phone,
                                    require_identity, registration_prefix)
       values ($1, 'برنامج الأهلية', 'eligibility-test', 7, 'male', true, true, 'SN-TEST') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  trackId = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name, sort_order) values ($1, 'مسار الأهلية', 0) returning id`,
      [programId],
    )
  ).rows[0]!.id;
  choiceQ = (
    await db.query<{ id: string }>(
      `insert into public.admission_questions (program_id, question, is_required, kind, sort_order)
       values ($1, 'حلقات التسميع؟', true, 'choice', 0) returning id`,
      [programId],
    )
  ).rows[0]!.id;
  consentQ = (
    await db.query<{ id: string }>(
      `insert into public.admission_questions (program_id, question, is_required, kind, sort_order)
       values ($1, 'أقرّ بصحة البيانات', true, 'consent', 1) returning id`,
      [programId],
    )
  ).rows[0]!.id;

  // النشر يحرسه `fn_guard_program_publish` — والاختبار يقيس التسجيل لا الجاهزية.
  await db.query(`set session_replication_role = replica`);
  await db.query(`update public.programs set status = 'published' where id = $1`, [programId]);
  await db.query(`set session_replication_role = origin`);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(
    `delete from public.admission_answers where participant_id in (select id from public.participants where program_id = $1)`,
    [programId],
  );
  await db.query(`delete from public.participants where program_id = $1`, [programId]);
  await db.query(`delete from public.admission_questions where program_id = $1`, [programId]);
  await db.query(`delete from public.tracks where program_id = $1`, [programId]);
  await db.query(`delete from public.programs where id = $1`, [programId]);
  await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db.query(`delete from public.profile_identities where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.end();
});

describe("موانع التسجيل", () => {
  it("**المؤهَّل بلا مانع**", async () => {
    expect(await blockers(ADULT)).toEqual([]);
  });

  it("**العمر والجنس والجوال والهوية — كلٌّ برسالته**", async () => {
    expect((await blockers(CHILD)).join(" ")).toMatch(/أدنى عمرٍ للتسجيل 7 سنوات/);
    expect((await blockers(WOMAN)).join(" ")).toMatch(/للذكور/);
    const abroad = (await blockers(ABROAD)).join(" ");
    expect(abroad).toMatch(/جوالٌ سعودي/);
    expect(abroad).toMatch(/رقم هويتك/);
  });

  it("**دون 18 بلا جوال وليّ أمر يُمنع، وبه يُقبل**", async () => {
    expect((await blockers(MINOR)).join(" ")).toMatch(/جوال وليّ أمرك/);
    await db.query(`update public.profile_identities set guardian_phone = '+966509990005' where user_id = $1`, [MINOR]);
    expect(await blockers(MINOR)).toEqual([]);
  });

  it("**fn_register يرفض بالمانع** — لا يُكتفى بعرضه", async () => {
    const { error } = await register(WOMAN, goodAnswers());
    expect(error).toMatch(/للذكور/);
  });
});

describe("صرامة أجوبة القبول", () => {
  it("**«نعم/لا» لا يقبل غيرهما، والإقرار لا يمرّ إلا مُقرّاً**", async () => {
    expect((await register(ADULT, { [choiceQ]: "ربما", [consentQ]: "أقرّ" })).error).toMatch(/بغير الصيغة/);
    expect((await register(ADULT, { [choiceQ]: "نعم", [consentQ]: "نعم" })).error).toMatch(/بغير الصيغة/);
  });
});

describe("رقم التسجيل", () => {
  it("**متسلسلٌ في البرنامج من 1**", async () => {
    const first = await register(ADULT, goodAnswers());
    expect(first.error).toBeNull();
    const second = await register(MINOR, goodAnswers());
    expect(second.error).toBeNull();

    const { rows } = await db.query<{ registration_no: number }>(
      `select registration_no from public.participants where program_id = $1 order by registration_no`,
      [programId],
    );
    expect(rows.map((r) => r.registration_no)).toEqual([1, 2]);
  });

  it("**لا يكتبه المسجِّل بنفسه** — رقمٌ مرسَل يُستبدل", async () => {
    await db.query(`delete from public.participants where user_id = $1 and program_id = $2`, [MINOR, programId]);
    const { error } = await as(
      MINOR,
      `insert into public.participants (user_id, program_id, track_id, registration_no) values ($1, $2, $3, 999)`,
      [MINOR, programId, trackId],
    );
    expect(error).toBeNull();
    const { rows } = await db.query<{ registration_no: number }>(
      `select registration_no from public.participants where user_id = $1 and program_id = $2`,
      [MINOR, programId],
    );
    // الأعلى بين الصفوف كلها + 1 — والمحذوف بالحذف الفعلي في الاختبار خرج من العدّ.
    expect(rows[0]!.registration_no).not.toBe(999);
  });
});
