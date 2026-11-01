import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * «صوتك» (adr/0054 · خطة ١ نوفمبر): الإرسال واشتقاق المشاركة والسياق والحدّ اليومي · رسائلي بلا اسم
 * الرادّ · الصندوق بنطاق الصلاحية · الرد والحال والأرشفة والتدقيق · لا وصول مباشر · المحو.
 */

let db: Client;
const STUDENT = "00000000-0000-4000-8000-000000000b51";
const OTHER = "00000000-0000-4000-8000-000000000b52";
const SCOPED = "00000000-0000-4000-8000-000000000b53";
const GLOBAL = "00000000-0000-4000-8000-000000000b54";
const NOBODY = "00000000-0000-4000-8000-000000000b55";
const USERS = [STUDENT, OTHER, SCOPED, GLOBAL, NOBODY];

let programA: string;
let programB: string;
let partA: string;

async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error: string | null }> {
  await db.query("savepoint s");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const { rows } = await db.query(sql, params);
    await db.query("reset role");
    await db.query("release savepoint s");
    return { rows: rows as T[], error: null };
  } catch (error) {
    await db.query("rollback to savepoint s");
    await db.query("reset role");
    return { rows: [], error: (error as Error).message };
  }
}

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const submit = (uid: string, kind = "technical", title = "عطل في الرصد", body = "لا يظهر زر الإتمام بعد الرصد", ctx: unknown = {}) =>
  as<{ id: string }>(uid, `select public.fn_submit_voice($1, $2, $3, $4::jsonb) id`, [kind, title, body, JSON.stringify(ctx)]);

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  await db.query("begin");
  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [uid, `voices-${i}@test.local`]);
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, $2)`, [uid, `حساب ${i}`]);
  }
  const section = (await one(`insert into public.sections (name) values ('قسم صوتك') returning id`)).id;
  programA = (await one(`insert into public.programs (section_id, name, slug, registration_prefix) values ($1, 'برنامج أ', 'voices-a', 'VA') returning id`, [section])).id;
  programB = (await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج ب', 'voices-b') returning id`, [section])).id;
  const trackA = (await one(`insert into public.tracks (program_id, name) values ($1, 'المسار أ') returning id`, [programA])).id;
  const trackB = (await one(`insert into public.tracks (program_id, name) values ($1, 'المسار ب') returning id`, [programB])).id;
  partA = (await one(`insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing') returning id`, [STUDENT, programA, trackA])).id;
  await db.query(`insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing')`, [OTHER, programB, trackB]);

  const role = (await one(`insert into public.roles (name) values ('معالج صوتك') returning id`)).id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'voices.manage')`, [role]);
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [SCOPED, role, programA]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [GLOBAL, role]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("الإرسال", () => {
  it("**المشاركة تُشتقّ في القاعدة، والسياق يُقصّ**", async () => {
    const r = await submit(STUDENT, "technical", "عطل في الرصد", "لا يظهر زر الإتمام بعد الرصد", {
      path: "/journey/x?token=secret#frag",
      ua: "Mozilla",
      viewport: "390x844",
      evil: "<script>",
    });
    expect(r.error).toBeNull();
    const v = await one(`select participant_id, program_id, context from public.voices where id = $1`, [r.rows[0]!.id]);
    expect(v.participant_id).toBe(partA);
    expect(v.program_id).toBe(programA);
    expect(v.context).toEqual({ path: "/journey/x", ua: "Mozilla", viewport: "390x844" });
  });

  it("**مشاركةٌ ليست له تُتجاهَل** — فتعود إلى مشاركته هو", async () => {
    const foreign = (await one(`select id from public.participants where user_id = $1`, [OTHER])).id;
    const r = await as<{ id: string }>(STUDENT, `select public.fn_submit_voice('note', 'ملاحظة', 'تفاصيل الملاحظة هنا', '{}'::jsonb, $1) id`, [foreign]);
    expect(r.error).toBeNull();
    expect((await one(`select participant_id from public.voices where id = $1`, [r.rows[0]!.id])).participant_id).toBe(partA);
  });

  it("**من لا مشاركة له يرسل** — بلا برنامج", async () => {
    const r = await submit(NOBODY, "inquiry", "سؤال عام", "كيف أسجّل في البرنامج القادم؟");
    expect(r.error).toBeNull();
    expect((await one(`select program_id from public.voices where id = $1`, [r.rows[0]!.id])).program_id).toBeNull();
  });

  it("**النوع والطول يُفحصان**", async () => {
    expect((await submit(STUDENT, "spam")).error).toMatch(/اختر نوع الرسالة/);
    expect((await submit(STUDENT, "note", "ق", "قصير جداً هنا جداً")).error).toMatch(/chk_voices_title/);
  });

  it("**خمس رسائل في اليوم** — والسادسة تُرفض", async () => {
    for (let i = 0; i < 4; i++) expect((await submit(OTHER, "note", `ملاحظة ${i}`, "تفاصيل الملاحظة هنا")).error).toBeNull();
    expect((await submit(OTHER, "note", "ملاحظة 5", "تفاصيل الملاحظة هنا")).error).toBeNull();
    expect((await submit(OTHER, "note", "ملاحظة 6", "تفاصيل الملاحظة هنا")).error).toMatch(/حدّ الرسائل اليوم/);
  });

  it("**لا وصول مباشر للجدول** — قراءةً ولا كتابة", async () => {
    const direct = await as(STUDENT, `select * from public.voices`);
    expect(direct.error).toBeNull();
    expect(direct.rows).toHaveLength(0);
    expect((await as(GLOBAL, `update public.voices set status = 'closed'`)).error).toMatch(/permission denied/);
  });
});

describe("الصندوق بالنطاق", () => {
  it("**المحصور يرى برنامجه وحده، والعام يرى الكل ومعه ما بلا برنامج، وغيرهما لا شيء**", async () => {
    const scoped = await as<{ program_id: string | null }>(SCOPED, `select program_id from public.fn_inbox_list()`);
    expect(scoped.rows.length).toBeGreaterThan(0);
    expect(scoped.rows.every((r) => r.program_id === programA)).toBe(true);
    const global = await as<{ program_id: string | null }>(GLOBAL, `select program_id from public.fn_inbox_list()`);
    expect(new Set(global.rows.map((r) => r.program_id))).toEqual(new Set([programA, programB, null]));
    expect((await as(STUDENT, `select * from public.fn_inbox_list()`)).rows).toHaveLength(0);
  });

  it("**المحصور يرى هوية المرسِل** وإن لم يملك قراءة المشاركين", async () => {
    const id = (await as<{ id: string }>(SCOPED, `select id from public.fn_inbox_list()`)).rows[0]!.id;
    const d = await as<{ sender_name: string; registration_no: string | null; track_name: string }>(SCOPED, `select * from public.fn_voice_detail($1)`, [id]);
    expect(d.rows[0]).toMatchObject({ sender_name: "حساب 0", track_name: "المسار أ" });
    const otherId = (await one(`select id from public.voices where program_id = $1 limit 1`, [programB])).id;
    const outside = await as(SCOPED, `select * from public.fn_voice_detail($1)`, [otherId]);
    expect(outside.error).toBeNull();
    expect(outside.rows).toHaveLength(0);
  });
});

describe("المعالجة", () => {
  it("**الرد: قيد المعالجة، والطالب يراه باسم الفريق لا باسم الرادّ، وغير مقروء**", async () => {
    const id = (await one(`select id from public.voices where user_id = $1 order by created_at limit 1`, [STUDENT])).id;
    expect((await as(SCOPED, `select public.fn_reply_voice($1, 'نعالجها الآن، شكراً لك', false)`, [id])).error).toBeNull();
    const mine = await as<{ status: string; reply: string; reply_unseen: boolean; team: string }>(STUDENT, `select * from public.fn_my_voices() where id = $1`, [id]);
    expect(mine.rows[0]).toMatchObject({ status: "in_progress", reply: "نعالجها الآن، شكراً لك", reply_unseen: true, team: "فريق برنامج أ" });
    expect(Object.keys(mine.rows[0]!)).not.toContain("replied_by_label");
    expect((await as<{ n: number }>(STUDENT, `select public.fn_my_voices_unseen() n`)).rows[0]!.n).toBe(1);
    await as(STUDENT, `select public.fn_mark_voices_seen()`);
    expect((await as<{ n: number }>(STUDENT, `select public.fn_my_voices_unseen() n`)).rows[0]!.n).toBe(0);
    // التعديل بلا إغلاقٍ يُبقي الحال، ويعيده غير مقروء.
    await as(SCOPED, `select public.fn_reply_voice($1, 'نعالجها الآن، شكراً جزيلاً', false)`, [id]);
    expect((await one(`select status from public.voices where id = $1`, [id])).status).toBe("in_progress");
    await as(STUDENT, `select public.fn_mark_voices_seen()`);
    await as(SCOPED, `select public.fn_reply_voice($1, 'حُلّت المشكلة، جرّب الآن', true)`, [id]);
    expect((await as<{ n: number }>(STUDENT, `select public.fn_my_voices_unseen() n`)).rows[0]!.n).toBe(1);
    expect((await one(`select status, replied_by_label from public.voices where id = $1`, [id]))).toMatchObject({ status: "closed", replied_by_label: "حساب 2" });
  });

  it("**إعادة الفتح والأرشفة — مدقّقة، وخارج النطاق كأنها غير موجودة**", async () => {
    const id = (await one(`select id from public.voices where user_id = $1 and status = 'closed' limit 1`, [STUDENT])).id;
    expect((await as(SCOPED, `select public.fn_set_voice_status($1, 'in_progress')`, [id])).error).toBeNull();
    const other = (await one(`select id from public.voices where program_id = $1 limit 1`, [programB])).id;
    expect((await as(SCOPED, `select public.fn_reply_voice($1, 'رد', false)`, [other])).error).toMatch(/الرسالة غير موجودة/);
    expect((await as(SCOPED, `select public.fn_archive_voice($1)`, [id])).error).toBeNull();
    // تخرج من الصندوق، وتبقى عند صاحبها «مغلقة» (قرار الراعي).
    expect((await as(SCOPED, `select * from public.fn_inbox_list() where id = $1`, [id])).rows).toHaveLength(0);
    expect((await as<{ status: string }>(STUDENT, `select status from public.fn_my_voices() where id = $1`, [id])).rows[0]?.status).toBe("closed");
    const audit = await one(
      `select count(*) filter (where action = 'voice_replied')::int replied, count(*) filter (where action = 'voice_status_changed')::int status,
              count(*) filter (where action = 'voice_archived')::int archived from public.audit_log where entity_id = $1`,
      [id],
    );
    expect(audit).toEqual({ replied: 3, status: 1, archived: 1 });
    // التعديل مدقَّقٌ بنصّيه.
    const edited = await one(
      `select count(*)::int n from public.audit_log where entity_id = $1 and action = 'voice_replied'
         and before->>'reply' = $2 and after->>'reply' = $3`,
      [id, "نعالجها الآن، شكراً جزيلاً", "حُلّت المشكلة، جرّب الآن"],
    );
    expect(edited.n).toBe(1);
  });

  it("**«ما يحتاج انتباهك»:** الجديدة بنطاقها", async () => {
    const r = await as<{ kind: string; program_id: string | null; amount: number }>(GLOBAL, `select * from public.fn_attention_items() where kind = 'voice_new'`);
    expect(r.rows.some((x) => x.program_id === programB)).toBe(true);
    const scoped = await as<{ program_id: string | null }>(SCOPED, `select * from public.fn_attention_items() where kind = 'voice_new'`);
    expect(scoped.rows.every((x) => x.program_id === programA)).toBe(true);
  });

  it("**محو المرسِل يمحو رسائله**", async () => {
    await db.query(`delete from public.participants where user_id = $1`, [NOBODY]);
    await db.query(`delete from public.profiles where user_id = $1`, [NOBODY]);
    await db.query(`delete from auth.users where id = $1`, [NOBODY]);
    expect((await one(`select count(*)::int n from public.voices where user_id = $1`, [NOBODY])).n).toBe(0);
  });
});
