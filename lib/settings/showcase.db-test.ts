import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** شرائح واجهة الدخول — الهجرة ٠٣٨. كل فحص في معاملة تُلغى، فالقيمة الحيّة لا تُمسّ. */

let db: Client;

async function rolledBack<T>(work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    return await work();
  } finally {
    await db.query("rollback");
  }
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

describe("fn_auth_showcase", () => {
  it("الزائر يقرأ الشرائح بالدالة", async () => {
    await rolledBack(async () => {
      await db.query(
        `update public.settings set value = '{"slides":[{"title":"أهلاً","body":""}]}'
          where key = 'auth.showcase' and scope_program_id is null`,
      );
      await db.query("set local role anon");
      const { rows } = await db.query<{ v: { slides: { title: string }[] } }>(
        "select public.fn_auth_showcase() as v",
      );
      expect(rows[0]!.v.slides[0]!.title).toBe("أهلاً");
    });
  });

  it("الزائر لا يقرأ جدول الإعدادات نفسه", async () => {
    await rolledBack(async () => {
      await db.query("set local role anon");
      await expect(db.query("select key from public.settings")).rejects.toThrow();
    });
  });

  it("أكثر من خمس شرائح يُرفض في القاعدة", async () => {
    await rolledBack(async () => {
      const six = JSON.stringify({ slides: Array.from({ length: 6 }, () => ({ title: "ع", body: "" })) });
      await expect(
        db.query(
          `update public.settings set value = $1::jsonb where key = 'auth.showcase' and scope_program_id is null`,
          [six],
        ),
      ).rejects.toThrow(/settings_auth_showcase_shape/);
    });
  });
});
