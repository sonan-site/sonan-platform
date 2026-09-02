import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALL_PERMISSION_CODES, isPermissionCode } from "../../config/permissions";

/**
 * يقابل الكتالوج (مصدر الحقيقة في الكود) بما في القاعدة فعلاً.
 * انحراف الاثنين يُنتج صلاحية ممنوحة بلا أثر، أو رمزاً مستهلَكاً بلا وجود.
 */

let db: Client;

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
});

afterAll(async () => {
  await db?.end();
});

describe("الكتالوج مقابل القاعدة", () => {
  it("كل رمز في القاعدة معرَّف في الكتالوج", async () => {
    const { rows } = await db.query<{ permission_code: string }>(
      `select distinct permission_code from public.role_permissions where deleted_at is null`,
    );
    const unknown = rows.map((r) => r.permission_code).filter((c) => !isPermissionCode(c));
    expect(unknown, "رموز في القاعدة بلا تعريف في الكتالوج").toEqual([]);
  });

  it("دور النظام يحمل الكتالوج كاملاً", async () => {
    const { rows } = await db.query<{ permission_code: string }>(
      `select rp.permission_code
         from public.role_permissions rp
         join public.roles r on r.id = rp.role_id
        where r.is_system = true and rp.deleted_at is null`,
    );
    expect(rows.map((r) => r.permission_code).sort()).toEqual([...ALL_PERMISSION_CODES].sort());
  });

  it("fn_has_permission ترفض بلا مصادقة", async () => {
    const { rows } = await db.query<{ allowed: boolean }>(
      `select public.fn_has_permission('users.read', null) as allowed`,
    );
    expect(rows[0]?.allowed).toBe(false);
  });
});
