import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/database.types";
import { VOICE_BUCKET, voiceImagePath } from "./image";

/**
 * مرفق «صوتك» على **خدمة التخزين الحقيقية** (خطة المرفق د · مراجعتا الخطة والبناء): رفعٌ بهوية الطالب ·
 * رفض الثانية والاستبدال والنوع والحجم · رابطٌ موقّع لصاحبه وللمعالِج في نطاقه لا لغيرهما · رفعان
 * متزامنان والتسجيل مرّةً واحدة · محوٌ يدوّن الملفات ثم يحذفها عميل الخدمة فعلاً.
 *
 * فحصُ السياسات بـSQL (`voices-image.db-test`) لا يُثبت مسار واجهة التخزين نفسها — وهذا يُثبته.
 * **يجري في CI وحده:** محلياً `.env` يشير إلى المشروع الحيّ، فيُتخطّى ما لم يكن العنوان محلياً.
 * والإعداد بـSQL مباشر (البرنامج والدور والمحو) — وكل ما أُنشئ يُحذف بعده.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
const isLocal = host === "127.0.0.1" || host === "localhost";

type Db = SupabaseClient<Database>;
const PASSWORD = "Voices-Storage-Test-1448";
const jpeg = (bytes: number) => {
  const b = new Uint8Array(bytes);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return new Blob([b], { type: "image/jpeg" });
};

let admin: Db;
let pg: Client;
const created: string[] = [];
const ids: { section?: string; program?: string; programB?: string; role?: string } = {};

/** حسابٌ داخلٌ بملفٍّ شخصي — المشغّل لا ينشئه إلا من اسمٍ وجوالٍ صالحين (الهجرة ٠٣١). */
async function signedInUser(tag: string): Promise<{ id: string; db: Db }> {
  const email = `voices-storage-${tag}-${crypto.randomUUID()}@test.local`;
  const phone = `+9665${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: "حساب",
      father_name: "اختبار",
      family_name: tag,
      gender: "male",
      birth_date: "2010-01-01",
      nationality: "SA",
      phone,
    },
  });
  if (error || !data.user) throw error ?? new Error("createUser");
  created.push(data.user.id);
  const db = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false } });
  const signIn = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, db };
}

async function newVoice(db: Db): Promise<string> {
  const { data, error } = await db.rpc("fn_submit_voice", { p_kind: "technical", p_title: "عطل في الرصد", p_body: "لا يظهر زر الإتمام بعد الرصد" });
  if (error || !data) throw error ?? new Error("submit");
  return data;
}

const listFolder = async (folder: string) => (await admin.storage.from(VOICE_BUCKET).list(folder)).data ?? [];

describe.skipIf(!isLocal)("مرفق «صوتك» على خدمة التخزين", () => {
  let studentId = "";
  let student: Db;
  let other: Db;
  let scoped: Db;
  let outside: Db;

  beforeAll(async () => {
    admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    const s = await signedInUser("student");
    studentId = s.id;
    student = s.db;
    other = (await signedInUser("other")).db;
    const sc = await signedInUser("scoped");
    scoped = sc.db;
    const out = await signedInUser("outside");
    outside = out.db;

    // الطالب مشاركٌ في برنامج أ فتُنسب رسائله إليه، ومعالِجٌ محصورٌ في أ وآخر في ب.
    const one = async (sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows[0];
    ids.section = (await one(`insert into public.sections (name) values ('قسم تكامل صوتك') returning id`)).id;
    ids.program = (await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج تكامل أ', $2) returning id`, [ids.section, `vs-a-${crypto.randomUUID()}`])).id;
    ids.programB = (await one(`insert into public.programs (section_id, name, slug) values ($1, 'برنامج تكامل ب', $2) returning id`, [ids.section, `vs-b-${crypto.randomUUID()}`])).id;
    const track = (await one(`insert into public.tracks (program_id, name) values ($1, 'المسار') returning id`, [ids.program])).id;
    await pg.query(`insert into public.participants (user_id, program_id, track_id, status) values ($1, $2, $3, 'memorizing')`, [studentId, ids.program, track]);
    ids.role = (await one(`insert into public.roles (name) values ($1) returning id`, [`معالج تكامل ${crypto.randomUUID()}`])).id;
    await pg.query(`insert into public.role_permissions (role_id, permission_code) values ($1, 'voices.manage')`, [ids.role]);
    await pg.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3), ($4, $2, $5)`, [sc.id, ids.role, ids.program, out.id, ids.programB]);
  });

  afterAll(async () => {
    if (!isLocal) return;
    for (const id of created) {
      for (const folder of await listFolder(id)) {
        const paths = (await listFolder(`${id}/${folder.name}`)).map((f) => `${id}/${folder.name}/${f.name}`);
        if (paths.length) await admin.storage.from(VOICE_BUCKET).remove(paths);
      }
    }
    await pg.query(`delete from public.participants where user_id = any($1) or program_id = any($2)`, [created, [ids.program, ids.programB]]);
    await pg.query(`delete from public.user_roles where user_id = any($1)`, [created]);
    for (const id of created) await admin.auth.admin.deleteUser(id);
    await pg.query(`delete from public.role_permissions where role_id = $1`, [ids.role]);
    await pg.query(`delete from public.roles where id = $1`, [ids.role]);
    await pg.query(`delete from public.tracks where program_id = $1`, [ids.program]);
    await pg.query(`delete from public.programs where section_id = $1`, [ids.section]);
    await pg.query(`delete from public.sections where id = $1`, [ids.section]);
    await pg.query(`delete from public.storage_purge_queue where path like any($1)`, [created.map((id) => `${id}/%`)]);
    await pg.end();
  });

  it("**الرفع ثم التسجيل ثم الرابط الموقّع — والاستبدال والثانية مرفوضان، ولا حذف من الطالب**", async () => {
    const id = await newVoice(student);
    const path = voiceImagePath(studentId, id, crypto.randomUUID());
    const bucket = student.storage.from(VOICE_BUCKET);

    expect((await bucket.upload(path, jpeg(2048), { contentType: "image/jpeg", upsert: false })).error).toBeNull();
    expect((await bucket.upload(path, jpeg(2048), { contentType: "image/jpeg", upsert: true })).error).not.toBeNull();
    const second = voiceImagePath(studentId, id, crypto.randomUUID());
    expect((await bucket.upload(second, jpeg(2048), { contentType: "image/jpeg" })).error).not.toBeNull();

    expect((await student.rpc("fn_attach_voice_image", { p_voice_id: id, p_path: path })).error).toBeNull();
    const mine = (await student.rpc("fn_my_voices")).data?.find((v) => v.id === id);
    expect(mine?.image_path).toBe(path);

    const signed = await bucket.createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const res = await fetch(signed.data!.signedUrl);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(2048);

    expect((await bucket.remove([path])).data ?? []).toHaveLength(0);
    expect(await listFolder(`${studentId}/${id}`)).toHaveLength(1);
  });

  it("**الرابط للمعالِج في نطاقه وحده — لا لمعالِج برنامجٍ آخر ولا لطالبٍ غيره**", async () => {
    const id = await newVoice(student);
    const path = voiceImagePath(studentId, id, crypto.randomUUID());
    await student.storage.from(VOICE_BUCKET).upload(path, jpeg(1024), { contentType: "image/jpeg" });
    // قبل التسجيل لا يراها المعالِج: الصورة المسجَّلة وحدها.
    expect((await scoped.storage.from(VOICE_BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
    await student.rpc("fn_attach_voice_image", { p_voice_id: id, p_path: path });

    expect((await scoped.storage.from(VOICE_BUCKET).createSignedUrl(path, 60)).error).toBeNull();
    expect((await outside.storage.from(VOICE_BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await other.storage.from(VOICE_BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
  });

  it("**النوع غير JPEG والحجم فوق ٥ ميغابايت مرفوضان من التخزين نفسه**", async () => {
    const bucket = student.storage.from(VOICE_BUCKET);
    const a = await newVoice(student);
    const png = await bucket.upload(voiceImagePath(studentId, a, crypto.randomUUID()), new Blob([new Uint8Array(64)], { type: "image/png" }), {
      contentType: "image/png",
    });
    expect(png.error).not.toBeNull();
    const b = await newVoice(other);
    const otherId = (await other.auth.getUser()).data.user!.id;
    const big = await other.storage.from(VOICE_BUCKET).upload(voiceImagePath(otherId, b, crypto.randomUUID()), jpeg(5 * 1024 * 1024 + 1), {
      contentType: "image/jpeg",
    });
    expect(big.error).not.toBeNull();
  });

  it("**رفعان متزامنان: قد يمرّان، والتسجيل يقبل واحداً — والزائد يتيمٌ في مجلده (ف١٠)**", async () => {
    const id = await newVoice(other);
    const otherId = (await other.auth.getUser()).data.user!.id;
    const paths = [voiceImagePath(otherId, id, crypto.randomUUID()), voiceImagePath(otherId, id, crypto.randomUUID())];
    const results = await Promise.all(paths.map((p) => other.storage.from(VOICE_BUCKET).upload(p, jpeg(256 * 1024), { contentType: "image/jpeg" })));
    const ok = paths.filter((_, i) => !results[i]!.error);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(await listFolder(`${otherId}/${id}`)).toHaveLength(ok.length);

    const attached = await Promise.all(ok.map((p) => other.rpc("fn_attach_voice_image", { p_voice_id: id, p_path: p })));
    expect(attached.filter((r) => !r.error)).toHaveLength(1);
  });

  it("**المحو يدوّن ملفات الطالب، وعميل الخدمة يحذفها فعلاً**", async () => {
    const id = await newVoice(student);
    const path = voiceImagePath(studentId, id, crypto.randomUUID());
    await student.storage.from(VOICE_BUCKET).upload(path, jpeg(512), { contentType: "image/jpeg" });
    const before = (await listFolder(studentId)).length;
    expect(before).toBeGreaterThan(0);

    await pg.query(`delete from public.participants where user_id = $1`, [studentId]);
    await pg.query(`update public.profiles set deleted_at = now(), purge_after = now() - interval '1 day' where user_id = $1`, [studentId]);
    await pg.query(`select public.fn_purge_account($1)`, [studentId]);

    // ما يفعله drainStoragePurge: يقرأ الطابور، يحذف بالمسارات الكاملة، ثم يعلّمها محذوفة.
    const queued = (await pg.query<{ path: string }>(`select path from public.storage_purge_queue where bucket = 'voices' and deleted_at is null and path like $1`, [`${studentId}/%`])).rows.map((r) => r.path);
    expect(queued).toContain(path);
    const removed = await admin.storage.from(VOICE_BUCKET).remove(queued);
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(queued.length);
    await pg.query(`update public.storage_purge_queue set deleted_at = now() where bucket = 'voices' and path = any($1)`, [queued]);

    for (const folder of await listFolder(studentId)) expect(await listFolder(`${studentId}/${folder.name}`)).toHaveLength(0);
  });
});
