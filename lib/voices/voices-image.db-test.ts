import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * مرفق «صوتك» (adr/0054 د١–د٤ · خطة المرفق): سياسات الرفع والقراءة على `storage.objects` بالحاوية ·
 * التسجيل ضمانٌ مرّةً واحدة · المسار المشوَّه رفضٌ لا خطأ · المحو يدوّن الملفات في الطابور.
 *
 * الإدراج في `storage.objects` هنا SQL بهوية الطالب — يمرّ بالسياسة كما يمرّ رفع واجهة التخزين.
 * والحذف ممنوعٌ هناك، فكل شيء في معاملةٍ يُتراجع عنها.
 */

let db: Client;
const STUDENT = "00000000-0000-4000-8000-000000000c61";
const OTHER = "00000000-0000-4000-8000-000000000c62";
const SCOPED = "00000000-0000-4000-8000-000000000c63";
const OUTSIDE = "00000000-0000-4000-8000-000000000c64";
const USERS = [STUDENT, OTHER, SCOPED, OUTSIDE];
const FILE = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg";
const FILE2 = "2c8e7ace-acfe-4c3e-8c6e-bc9eacce5cfe.jpg";

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
// إدراجٌ مباشر لا `fn_submit_voice`: حدّها اليومي (٥) أضيق من رسائل الاختبار — والإرسال مختبَرٌ في voices.db-test.
const submit = async (uid: string) =>
  (await one(`insert into public.voices (user_id, program_id, kind, title, body) values ($1, $2, 'technical', 'عطل في الرصد', 'لا يظهر زر الإتمام بعد الرصد') returning id`, [uid, uid === STUDENT ? programA : null])).id as string;
const upload = (uid: string, name: string, size = 120_000) =>
  as(uid, `insert into storage.objects (bucket_id, name, owner_id, metadata) values ('voices', $1, $2, $3::jsonb)`, [
    name,
    uid,
    JSON.stringify({ size, mimetype: "image/jpeg" }),
  ]);
const readable = async (uid: string, name: string) =>
  (await as<{ n: number }>(uid, `select count(*)::int n from storage.objects where bucket_id = 'voices' and name = $1`, [name])).rows[0]?.n === 1;
const attach = (uid: string, id: string, path: string) => as(uid, `select public.fn_attach_voice_image($1, $2)`, [id, path]);

let programA: string;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  await db.query("begin");
  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [uid, `voices-img-${i}@test.local`]);
    await db.query(`insert into public.profiles (user_id, full_name) values ($1, $2)`, [uid, `حساب ${i}`]);
  }
  const section = (await one(`insert into public.sections (name) values ('قسم مرفق صوتك') returning id`)).id;
  programA = (await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج أ', 'voices-img-a') returning id`, [section])).id;
  const programB = (await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج ب', 'voices-img-b') returning id`, [section])).id;
  const trackA = (await one(`insert into public.tracks (program_id, name) values ($1, 'المسار أ') returning id`, [programA])).id;
  await db.query(`insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing')`, [STUDENT, programA, trackA]);

  const role = (await one(`insert into public.roles (name) values ('معالج مرفق صوتك') returning id`)).id;
  await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'voices.manage')`, [role]);
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [SCOPED, role, programA]);
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [OUTSIDE, role, programB]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("الحاوية", () => {
  it("**خاصة · 5 ميغابايت · JPEG وحده**", async () => {
    const b = await one(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'voices'`);
    expect(b).toEqual({ public: false, file_size_limit: "5242880", allowed_mime_types: ["image/jpeg"] });
  });

  it("**لا تعديل ولا حذف على الملفات، وكل سياسةٍ تذكر حاويتها**", async () => {
    const { rows } = await db.query<{ policyname: string; cmd: string; expr: string }>(
      `select policyname, cmd, coalesce(qual, '') || coalesce(with_check, '') expr
       from pg_policies where schemaname = 'storage' and tablename = 'objects'`,
    );
    expect(rows.filter((r) => ["UPDATE", "DELETE", "ALL"].includes(r.cmd))).toEqual([]);
    for (const r of rows) expect(r.expr, r.policyname).toMatch(/bucket_id = '[a-z-]+'/);
  });

  it("**دوالّ المساعدة غير مكشوفة لواجهة REST، وما يصله المستخدم منها قائمةٌ مغلقة**", async () => {
    const { rows } = await db.query<{ name: string; anon: boolean; auth: boolean }>(
      `select p.proname name, has_function_privilege('anon', p.oid, 'EXECUTE') anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' order by 1`,
    );
    expect(rows.filter((r) => r.anon)).toEqual([]);
    expect(rows.filter((r) => r.auth).map((r) => r.name)).toEqual(["voice_image_readable", "voice_path", "voice_staff_scope", "voice_upload_ok"]);
  });

  it("**الحساب الموقوف لا يرفع ولا يسجّل**", async () => {
    const id = await submit(STUDENT);
    const path = `${STUDENT}/${id}/${FILE}`;
    await db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [STUDENT]);
    expect((await upload(STUDENT, path)).error).toMatch(/row-level security/);
    await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('voices', $1, '{"size": 1}')`, [path]);
    expect((await attach(STUDENT, id, path)).error).toMatch(/سجّل الدخول/);
    await db.query(`update public.profiles set deleted_at = null where user_id = $1`, [STUDENT]);
  });
});

describe("الرفع", () => {
  it("**صاحب الرسالة يرفع إلى مجلدها**", async () => {
    const id = await submit(STUDENT);
    expect((await upload(STUDENT, `${STUDENT}/${id}/${FILE}`)).error).toBeNull();
  });

  it("**مجلدُ غيره ورسالةُ غيره مرفوضان**", async () => {
    const id = await submit(STUDENT);
    expect((await upload(OTHER, `${STUDENT}/${id}/${FILE}`)).error).toMatch(/row-level security/);
    expect((await upload(OTHER, `${OTHER}/${id}/${FILE}`)).error).toMatch(/row-level security/);
  });

  it("**ملفٌّ ثانٍ في المجلد مرفوض**", async () => {
    const id = await submit(STUDENT);
    expect((await upload(STUDENT, `${STUDENT}/${id}/${FILE}`)).error).toBeNull();
    expect((await upload(STUDENT, `${STUDENT}/${id}/${FILE2}`)).error).toMatch(/row-level security/);
  });

  it("**رسالةٌ قديمة أو مؤرشفة أو لها صورة مرفوضة**", async () => {
    const old = await submit(STUDENT);
    await db.query(`update public.voices set created_at = now() - interval '31 minutes' where id = $1`, [old]);
    expect((await upload(STUDENT, `${STUDENT}/${old}/${FILE}`)).error).toMatch(/row-level security/);

    const archived = await submit(STUDENT);
    await db.query(`update public.voices set deleted_at = now() where id = $1`, [archived]);
    expect((await upload(STUDENT, `${STUDENT}/${archived}/${FILE}`)).error).toMatch(/row-level security/);
  });

  it("**مسارٌ مشوَّه أو امتدادٌ آخر يُرفض بلا خطأ تحويل**", async () => {
    const id = await submit(STUDENT);
    for (const name of [`${STUDENT}/${id}/${FILE.replace(".jpg", ".png")}`, `${STUDENT}/${id}/x.jpg`, `${STUDENT}/not-a-uuid/${FILE}`, `${STUDENT}/${id}/../${FILE}`, ""]) {
      // الرفض وحده هو المطلوب: بعض نسخ التخزين تفحص المسار في مشغّلٍ قبل السياسة (مراجعة البناء ٧).
      expect((await upload(STUDENT, name)).error, name).not.toBeNull();
    }
  });
});

describe("التسجيل والقراءة", () => {
  it("**بلا ملفٍ مرفوض · ثم مرّةً واحدة · وإعادته بالمسار نفسه تمرّ · والحجم من التخزين**", async () => {
    const id = await submit(STUDENT);
    const path = `${STUDENT}/${id}/${FILE}`;
    expect((await attach(STUDENT, id, path)).error).toMatch(/لم تصل الصورة/);

    await upload(STUDENT, path, 345_678);
    expect((await attach(OTHER, id, path)).error).toMatch(/غير موجودة/);
    expect((await attach(STUDENT, id, `${OTHER}/${id}/${FILE}`)).error).toMatch(/غير صالح/);
    expect((await attach(STUDENT, id, path)).error).toBeNull();
    expect((await attach(STUDENT, id, path)).error).toBeNull();
    expect((await attach(STUDENT, id, `${STUDENT}/${id}/${FILE2}`)).error).toMatch(/صورةٌ مرفقة/);
    expect(await one(`select image_path, image_bytes from public.voices where id = $1`, [id])).toEqual({ image_path: path, image_bytes: "345678" });

    // وبعد التسجيل لا رفع آخر.
    expect((await upload(STUDENT, `${STUDENT}/${id}/${FILE2}`)).error).toMatch(/row-level security/);
  });

  it("**صاحبها يقرأ · المعالِج في نطاقه يقرأ المسجَّلة وحدها · وخارجه لا**", async () => {
    const id = await submit(STUDENT);
    const path = `${STUDENT}/${id}/${FILE}`;
    await upload(STUDENT, path);
    expect(await readable(STUDENT, path)).toBe(true);
    expect(await readable(SCOPED, path)).toBe(false);

    await attach(STUDENT, id, path);
    expect(await readable(SCOPED, path)).toBe(true);
    expect(await readable(OUTSIDE, path)).toBe(false);
    expect(await readable(OTHER, path)).toBe(false);

    // المؤرشفة: تخرج من نطاق المعالِج، ويبقى صاحبها يراها.
    await db.query(`update public.voices set deleted_at = now() where id = $1`, [id]);
    expect(await readable(SCOPED, path)).toBe(false);
    expect(await readable(STUDENT, path)).toBe(true);
  });

  it("**القراءتان تُرجعان المسار**", async () => {
    const id = await submit(STUDENT);
    const path = `${STUDENT}/${id}/${FILE}`;
    await upload(STUDENT, path);
    await attach(STUDENT, id, path);
    expect((await as<{ image_path: string }>(STUDENT, `select image_path from public.fn_my_voices() where id = $1`, [id])).rows[0]?.image_path).toBe(path);
    expect((await as<{ image_path: string }>(SCOPED, `select image_path from public.fn_voice_detail($1)`, [id])).rows[0]?.image_path).toBe(path);
    expect((await as(OUTSIDE, `select * from public.fn_voice_detail($1)`, [id])).rows).toHaveLength(0);
  });

  it("**الطابور بلا وصول مباشر، ودالّتاه لحامل `users.write` وحده**", async () => {
    expect((await as(STUDENT, `select * from public.storage_purge_queue`)).rows).toEqual([]);
    expect((await as(STUDENT, `select * from public.fn_storage_purge_pending()`)).error).toMatch(/صلاحية/);
    expect((await as(STUDENT, `select public.fn_storage_purge_done('voices', array['x'])`)).error).toMatch(/صلاحية/);
  });
});

describe("المحو", () => {
  it("**محوُ طالبٍ له ملفاتٌ ينجح، ويدوّنها كلها — المسجَّل واليتيم**", async () => {
    const id = await submit(STUDENT);
    const registered = `${STUDENT}/${id}/${FILE}`;
    await upload(STUDENT, registered);
    await attach(STUDENT, id, registered);
    // يتيمٌ (رفعٌ لم يُسجَّل) — كما يقع في سباق رفعين (ف١٠).
    const orphan = `${STUDENT}/${await submit(STUDENT)}/${FILE2}`;
    await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('voices', $1, '{"size": 1}')`, [orphan]);
    const foreign = `${OTHER}/${await submit(OTHER)}/${FILE}`;
    await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('voices', $1, '{"size": 1}')`, [foreign]);

    await db.query(`update public.profiles set deleted_at = now(), purge_after = now() - interval '1 day' where user_id = $1`, [STUDENT]);
    // نداء المجدوِل بلا هوية: `as` يُطلق نقطة الحفظ فتبقى هوية آخر مستخدمٍ في المعاملة، والمحو يفحص
    // الصلاحية بالهوية (الهجرة 20261111110000) — فتُمسح كما لا تكون عند المجدوِل.
    await db.query(`select set_config('request.jwt.claims', '', true)`);
    await db.query(`select public.fn_purge_account($1)`, [STUDENT]);

    const { rows } = await db.query<{ path: string }>(`select path from public.storage_purge_queue where bucket = 'voices' order by path`);
    // وما رفعه في الاختبارات السابقة معها — كلّه من مجلده، ولا شيء من مجلد غيره.
    const paths = rows.map((r) => r.path);
    expect(paths).toEqual(expect.arrayContaining([orphan, registered]));
    expect(paths.every((p) => p.startsWith(`${STUDENT}/`))).toBe(true);
    expect(paths).not.toContain(foreign);
    expect((await one(`select count(*)::int n from public.voices where user_id = $1`, [STUDENT])).n).toBe(0);
  });
});
