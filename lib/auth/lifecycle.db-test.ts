import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * اختبارات دورة حياة المستخدم — **في القاعدة**.
 *
 * تُنفَّذ باتصال مباشر، فالمستدعي بلا `auth.uid()`. وهذا **بالضبط** ما نريد
 * فحصه: أن الدوال ترفض المجهول بدل أن تتساهل معه.
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

describe("الصلاحيات الحيّة", () => {
  it("fn_my_permissions لا تُرجع شيئاً لغير المصادَق عليه", async () => {
    const { rows } = await db.query("select * from public.fn_my_permissions()");
    expect(rows).toEqual([]);
  });

  it("fn_is_active ترفض المجهول", async () => {
    const { rows } = await db.query<{ active: boolean }>("select public.fn_is_active() as active");
    expect(rows[0]?.active).toBe(false);
  });
});

describe("حدّ المعدل", () => {
  const bucket = "test:lifecycle";

  beforeEach(async () => {
    await db.query("delete from public.rate_limit_events where bucket like 'test:%'");
    await db.query("delete from public.audit_log where action like 'rate_limit%'");
  });

  it("يسمح حتى الحدّ ثم يمنع", async () => {
    const max = 3;
    const results: boolean[] = [];
    for (let i = 0; i < max + 1; i += 1) {
      const { rows } = await db.query<{ ok: boolean }>(
        "select public.fn_hit_rate_limit($1, $2, $3) as ok",
        [bucket, max, 900],
      );
      results.push(rows[0]!.ok);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it("التجاوز يُسجَّل في سجل التدقيق — الإغراق أثرٌ مقروء لا صمت", async () => {
    for (let i = 0; i < 2; i += 1) {
      await db.query("select public.fn_hit_rate_limit($1, 1, 900)", [bucket]);
    }
    const { rows } = await db.query<{ count: string }>(
      "select count(*)::text as count from public.audit_log where action = 'rate_limit_exceeded'",
    );
    expect(Number(rows[0]!.count)).toBeGreaterThan(0);
  });

  it("الحدود تُقرأ من الإعدادات لا من الكود", async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      "select public.fn_rate_limit($1, 'auth.login') as ok",
      [bucket],
    );
    expect(rows[0]?.ok).toBe(true);
  });

  it("إعداد ناقص = منع لا تساهل، ويُسجَّل", async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      "select public.fn_rate_limit($1, 'auth.nonexistent') as ok",
      [bucket],
    );
    expect(rows[0]?.ok).toBe(false);

    const { rows: audit } = await db.query<{ count: string }>(
      "select count(*)::text as count from public.audit_log where action = 'rate_limit_misconfigured'",
    );
    expect(Number(audit[0]!.count)).toBeGreaterThan(0);
  });
});

describe("إعدادات دورة الحياة مبذورة بقيم افتراضية", () => {
  /**
   * الفحص **بنيوي لا بقائمة مثبَّتة**: القائمة تنحرف مع كل إعداد جديد،
   * فينكسر الاختبار على إضافة صحيحة. والقاعدة المفحوصة ليست «هذه الستة موجودة»
   * بل «كل إعداد قابل للتخصيص يُبنى بقيمة افتراضية» — وهذا ما يُفحَص هنا.
   */
  it("لا إعداد مصادقة بلا قيمة", async () => {
    const { rows } = await db.query<{ key: string }>(
      `select key from public.settings
        where key like 'auth.%' and deleted_at is null
          and (value is null or value::text in ('null', '""'))`,
    );
    expect(rows.map((r) => r.key)).toEqual([]);
  });

  it("كل حدّ معدل له نافذته — حدٌّ بلا نافذة إعداد ناقص", async () => {
    const { rows } = await db.query<{ prefix: string }>(
      `select replace(key, '.max_attempts', '') as prefix
         from public.settings
        where key like 'auth.%.max_attempts' and deleted_at is null
          and not exists (
            select 1 from public.settings w
            where w.key = replace(settings.key, '.max_attempts', '.window_seconds')
              and w.deleted_at is null
          )`,
    );
    expect(rows.map((r) => r.prefix)).toEqual([]);
  });

  it("كل حدّ معدل رقم موجب", async () => {
    const { rows } = await db.query<{ key: string }>(
      `select key from public.settings
        where key like 'auth.%' and deleted_at is null
          and (value #>> '{}') ~ '^[0-9]+$' = false`,
    );
    expect(rows.map((r) => r.key)).toEqual([]);
  });
});

describe("BR-ROLE-01 — لا رفع للنفس", () => {
  it("fn_can_grant_role ترفض المجهول", async () => {
    const { rows: role } = await db.query<{ id: string }>(
      "select id from public.roles where is_system = true limit 1",
    );
    const { rows } = await db.query<{ allowed: boolean }>(
      "select public.fn_can_grant_role($1, $2, null) as allowed",
      [role[0]!.id, "00000000-0000-0000-0000-000000000000"],
    );
    expect(rows[0]?.allowed).toBe(false);
  });
});
