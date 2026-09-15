import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ملف المستخدم مع حسابه — الهجرتان ٠٣١ و٠٣٦.
 *
 * الإدراج في `auth.users` هنا هو ما تفعله خدمة المصادقة عند إنشاء الحساب أو
 * الدعوة: صفٌّ ببيانات `raw_user_meta_data`. **والملف يُنشأ مكتملاً أو لا يُنشأ.**
 */

let db: Client;

const IDS = {
  valid: "00000000-0000-4000-8000-0000000008a1",
  bare: "00000000-0000-4000-8000-0000000008a2",
  badPhone: "00000000-0000-4000-8000-0000000008a3",
  partial: "00000000-0000-4000-8000-0000000008a4",
  future: "00000000-0000-4000-8000-0000000008a5",
};
const ALL = Object.values(IDS);

const FULL = {
  first_name: "إبراهيم",
  father_name: "محمد",
  grandfather_name: "",
  family_name: "الحسين",
  gender: "male",
  birth_date: "1990-01-01",
  nationality: "SA",
  phone: "+966512345678",
};

async function createUser(id: string, meta: Record<string, string> | null) {
  await db.query(
    `insert into auth.users (id, email, aud, role, raw_user_meta_data)
     values ($1, $2, 'authenticated', 'authenticated', $3::jsonb)`,
    [id, `new-user-${id.slice(-2)}@test.local`, meta ? JSON.stringify(meta) : null],
  );
}

async function profileOf(id: string) {
  const { rows } = await db.query<{ full_name: string; phone: string; grandfather_name: string | null }>(
    `select full_name, phone, grandfather_name from public.profiles where user_id = $1`,
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
  it("**بيانات كاملة صالحة ← ملفٌ باسمه المركّب**، والجد الفارغ فراغ", async () => {
    await createUser(IDS.valid, FULL);
    expect(await profileOf(IDS.valid)).toEqual({
      full_name: "إبراهيم محمد الحسين",
      phone: "+966512345678",
      grandfather_name: null,
    });
  });

  it("حسابٌ بلا بيانات ← لا ملف ولا خطأ", async () => {
    await createUser(IDS.bare, null);
    expect(await profileOf(IDS.bare)).toBeNull();
  });

  it("**جوالٌ بغير الصيغة الدولية ← لا ملف**", async () => {
    await createUser(IDS.badPhone, { ...FULL, phone: "0512345678" });
    expect(await profileOf(IDS.badPhone)).toBeNull();
  });

  it("**بيانات ناقصة ← لا ملف ناقص** — يُستكمل في صفحته", async () => {
    await createUser(IDS.partial, { ...FULL, nationality: "" });
    expect(await profileOf(IDS.partial)).toBeNull();
  });

  it("تاريخ ميلاد في المستقبل ← لا ملف، ولا يُرفض إنشاء الحساب", async () => {
    await createUser(IDS.future, { ...FULL, birth_date: "2999-01-01" });
    expect(await profileOf(IDS.future)).toBeNull();
  });
});
