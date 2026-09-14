import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ملف المستخدم مع حسابه — الهجرة ٠٣١.
 *
 * الإدراج في `auth.users` هنا هو ما تفعله خدمة المصادقة عند إنشاء الحساب أو
 * الدعوة: صفٌّ ببيانات `raw_user_meta_data`.
 */

let db: Client;

const IDS = {
  valid: "00000000-0000-4000-8000-0000000008a1",
  bare: "00000000-0000-4000-8000-0000000008a2",
  badPhone: "00000000-0000-4000-8000-0000000008a3",
  shortName: "00000000-0000-4000-8000-0000000008a4",
};
const ALL = Object.values(IDS);

async function createUser(id: string, meta: Record<string, string> | null) {
  await db.query(
    `insert into auth.users (id, email, aud, role, raw_user_meta_data)
     values ($1, $2, 'authenticated', 'authenticated', $3::jsonb)`,
    [id, `new-user-${id.slice(-2)}@test.local`, meta ? JSON.stringify(meta) : null],
  );
}

async function profileOf(id: string) {
  const { rows } = await db.query<{ full_name: string; phone: string; deleted_at: string | null }>(
    `select full_name, phone, deleted_at from public.profiles where user_id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
});

afterAll(async () => {
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [ALL]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [ALL]);
  await db?.end();
});

describe("ملف المستخدم يُنشأ مع حسابه", () => {
  it("**حسابٌ باسم وجوال صالحين ← ملفٌ حيّ بهما**", async () => {
    await createUser(IDS.valid, { full_name: "  مشارك جديد ", phone: "+966512345678" });
    expect(await profileOf(IDS.valid)).toEqual({
      full_name: "مشارك جديد",
      phone: "+966512345678",
      deleted_at: null,
    });
  });

  it("حسابٌ بلا بيانات ← لا ملف ولا خطأ", async () => {
    await createUser(IDS.bare, null);
    expect(await profileOf(IDS.bare)).toBeNull();
  });

  it("**جوالٌ بغير الصيغة ← لا ملف** — من التفّ على الشاشة لا يحصل على وصول", async () => {
    await createUser(IDS.badPhone, { full_name: "مشارك", phone: "0512345678" });
    expect(await profileOf(IDS.badPhone)).toBeNull();
  });

  it("اسمٌ أقصر من ثلاثة أحرف ← لا ملف", async () => {
    await createUser(IDS.shortName, { full_name: "أب", phone: "+966512345678" });
    expect(await profileOf(IDS.shortName)).toBeNull();
  });
});
