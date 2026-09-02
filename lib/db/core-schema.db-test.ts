import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * اختبارات النواة — تُنفَّذ داخل القاعدة لا فوقها.
 *
 * لا تفحص هذه الاختبارات منطق ميزة، بل **الثوابت البنيوية** التي يفرضها
 * platform.md ولا تكشفها أي واجهة: حماية الصفوف، وغياب سياسات الحذف،
 * وأعمدة النواة، وامتيازات الدوال. كسر أي منها ثغرة صامتة لا خطأ ظاهر.
 */

const CORE_TABLES = [
  "profiles",
  "roles",
  "role_permissions",
  "user_roles",
  "audit_log",
  "settings",
  "attachments",
  "notifications",
  "notification_kinds",
] as const;

const CORE_COLUMNS = ["id", "created_at", "updated_at", "deleted_at"] as const;

const SECURITY_DEFINER_FUNCTIONS = [
  "fn_has_permission",
  "fn_can_grant_role",
  "fn_write_audit",
  "fn_bootstrap_admin",
] as const;

const url = process.env.SUPABASE_DB_URL;
let db: Client;

beforeAll(async () => {
  if (!url) {
    throw new Error(
      "SUPABASE_DB_URL غير مضبوط.\n" +
        "اختبارات القاعدة تحتاج اتصالاً مباشراً — لا تُتخطّى ولا تُدَّعى.\n" +
        "انسخ .env.example إلى .env واملأ سلسلة الاتصال.",
    );
  }
  db = new Client({ connectionString: url });
  await db.connect();
});

afterAll(async () => {
  await db?.end();
});

describe("حماية الصفوف — منع افتراضي", () => {
  it("RLS مفعَّل على كل جدول في public بلا استثناء", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `select c.relname as tablename
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relrowsecurity = false`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("لا سياسة DELETE على أي جدول — الحذف soft عبر deleted_at", async () => {
    const { rows } = await db.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname
         from pg_policies
        where schemaname = 'public'
          and cmd in ('DELETE', 'ALL')`,
    );
    expect(rows).toEqual([]);
  });

  it("كل جدول نواة يحمل سياسة قراءة واحدة على الأقل", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `select tablename from pg_policies
        where schemaname = 'public' and cmd = 'SELECT'
        group by tablename`,
    );
    const withRead = new Set(rows.map((r) => r.tablename));
    const missing = CORE_TABLES.filter((t) => !withRead.has(t));
    expect(missing).toEqual([]);
  });
});

describe("أعمدة النواة", () => {
  it.each(CORE_TABLES)("%s يحمل الأعمدة الأربعة", async (table) => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1`,
      [table],
    );
    const present = new Set(rows.map((r) => r.column_name));
    const missing = CORE_COLUMNS.filter((c) => !present.has(c));
    expect(missing).toEqual([]);
  });

  it.each(CORE_TABLES)("%s يحمل مشغّل updated_at", async (table) => {
    const { rows } = await db.query(
      `select 1 from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
        where c.relname = $1 and t.tgname = $2 and not t.tgisinternal`,
      [table, `trg_${table}_updated_at`],
    );
    expect(rows).toHaveLength(1);
  });
});

describe("الدوال مرتفعة الامتياز", () => {
  it.each(SECURITY_DEFINER_FUNCTIONS)("%s مسار بحثها مثبَّت", async (fn) => {
    const { rows } = await db.query<{ proconfig: string[] | null }>(
      `select p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    expect(rows).toHaveLength(1);
    // Postgres يسلسله `search_path=""`. المطلوب تثبيته **وأن يكون فارغاً** —
    // مسار مثبَّت على قيمة متساهلة (مثل public) أضعف من لا شيء لأنه يوهم بالحماية.
    const pinned = (rows[0]?.proconfig ?? []).find((c) => c.startsWith("search_path="));
    expect(pinned, "مسار البحث غير مثبَّت").toBeDefined();
    expect(pinned!.replace(/"/g, "")).toBe("search_path=");
  });

  it.each(SECURITY_DEFINER_FUNCTIONS)("%s لا ينفّذها anon", async (fn) => {
    const { rows } = await db.query<{ granted: boolean }>(
      `select has_function_privilege('anon', p.oid, 'EXECUTE') as granted
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    expect(rows[0]?.granted).toBe(false);
  });

  it("fn_bootstrap_admin مغلقة تماماً — لا ينفّذها حتى authenticated", async () => {
    const { rows } = await db.query<{ granted: boolean }>(
      `select has_function_privilege('authenticated', p.oid, 'EXECUTE') as granted
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'fn_bootstrap_admin'`,
    );
    expect(rows[0]?.granted).toBe(false);
  });
});

describe("البذرة", () => {
  it("دور نظام واحد لا أكثر", async () => {
    const { rows } = await db.query<{ count: string }>(
      `select count(*)::text as count from public.roles
        where is_system = true and deleted_at is null`,
    );
    expect(rows[0]?.count).toBe("1");
  });

  // فحص محتوى صلاحيات دور النظام يعيش في lib/permissions/catalog.db-test.ts،
  // ويقابل **الكتالوج الحيّ** لا قائمة مثبَّتة. قائمة مثبَّتة هنا انحرفت فعلاً
  // بمجرد إضافة أقسام جديدة — ومكرَّرٌ ينحرف أسوأ من غير موجود.

  it("دور النظام لا يُوقَف", async () => {
    await expect(
      db.query(
        `update public.roles set deleted_at = now() where is_system = true`,
      ),
    ).rejects.toThrow(/دور النظام لا يُوقَف/);
  });
});

describe("بذر المدير الأول", () => {
  it("ترفض معرّفاً بلا حساب مصادقة", async () => {
    await expect(
      db.query(
        `select public.fn_bootstrap_admin('00000000-0000-0000-0000-000000000000'::uuid)`,
      ),
    ).rejects.toThrow(/لا مستخدم بهذا المعرّف/);
  });
});
