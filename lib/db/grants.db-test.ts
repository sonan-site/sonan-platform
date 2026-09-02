import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * تطابق المنح مع السياسات — الهجرة ٠١٥.
 *
 * **العطب الذي أنشأ هذا الملف:** كل شاشة إدارية كانت معطَّلة عند الجذر، لأن
 * `authenticated` مُنح `TRUNCATE · REFERENCES · TRIGGER` ولم يُمنح
 * `SELECT · INSERT · UPDATE`. السياسات كانت مكتوبة وصحيحة، لكن المنحة دونها
 * لا تُبلَغ. ولم يظهر العطب في أي اختبار لأن اختبارات القاعدة تتصل بـ`postgres`
 * وهو مالك الجداول فلا يمرّ بمنحة ولا بسياسة.
 *
 * القاعدة المفحوصة هنا **بنيوية لا قائمة**: لا أسماء جداول مكتوبة في هذا
 * الملف. الجدول القادم يدخل الفحص وحده، والنسيان يُفشل البناء.
 */

type Grant = { table: string; role: string; privilege: string };
type Policy = { table: string; role: string; command: string };

let db: Client;
let grants: Grant[];
let policies: Policy[];
let tables: string[];

const DML = ["SELECT", "INSERT", "UPDATE"] as const;
const CMD_OF = { SELECT: "SELECT", INSERT: "INSERT", UPDATE: "UPDATE" } as const;

function has(role: string, table: string, privilege: string): boolean {
  return grants.some((g) => g.role === role && g.table === table && g.privilege === privilege);
}

function policyFor(role: string, table: string, command: string): boolean {
  return policies.some((p) => p.role === role && p.table === table && p.command === command);
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const t = await db.query<{ relname: string }>(
    `select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname`,
  );
  tables = t.rows.map((r) => r.relname);

  const g = await db.query<Grant>(
    `select table_name as table, grantee as role, privilege_type as privilege
     from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated', 'service_role')`,
  );
  grants = g.rows;

  const p = await db.query<Policy>(
    `select tablename as table, unnest(roles) as role, cmd as command
     from pg_policies where schemaname = 'public'`,
  );
  policies = p.rows;
});

afterAll(async () => {
  await db?.end();
});

describe("لكل جدول سياساته", () => {
  it("لا جدول في public بلا سياسة واحدة", () => {
    const withPolicy = new Set(policies.map((p) => p.table));
    expect(tables.filter((t) => !withPolicy.has(t))).toEqual([]);
  });

  it("أمن الصفوف مفعَّل على كل جدول", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe("المنحة تطابق السياسة — في الاتجاهين", () => {
  for (const role of ["anon", "authenticated"]) {
    it(`${role}: كل سياسة تحتها منحة`, () => {
      const missing = policies
        .filter((p) => p.role === role && DML.includes(p.command as (typeof DML)[number]))
        .filter((p) => !has(role, p.table, p.command))
        .map((p) => `${p.table}.${p.command}`);
      expect(missing, `سياسة بلا منحة — تُكتب ولا تُبلَغ: ${missing.join(" · ")}`).toEqual([]);
    });

    it(`${role}: كل منحة فوقها سياسة`, () => {
      const orphan = grants
        .filter((g) => g.role === role && DML.includes(g.privilege as (typeof DML)[number]))
        .filter((g) => !policyFor(role, g.table, CMD_OF[g.privilege as (typeof DML)[number]]))
        .map((g) => `${g.table}.${g.privilege}`);
      expect(orphan, `منحة بلا سياسة — دَينٌ صامت: ${orphan.join(" · ")}`).toEqual([]);
    });
  }
});

describe("ما لا يُمنَح لأحد", () => {
  it("**لا TRUNCATE لأي دور تطبيقي** — لا تخضع لأمن الصفوف فتُفرغ الجدول كله", () => {
    const bad = grants
      .filter((g) => g.privilege === "TRUNCATE")
      .map((g) => `${g.role}:${g.table}`);
    expect(bad).toEqual([]);
  });

  it("لا DELETE لأي دور تطبيقي — الحذف ليّن في كل مكان", () => {
    const bad = grants.filter((g) => g.privilege === "DELETE").map((g) => `${g.role}:${g.table}`);
    expect(bad).toEqual([]);
  });

  it("لا REFERENCES ولا TRIGGER — لا حاجة لهما ويوسّعان السطح", () => {
    const bad = grants
      .filter((g) => g.privilege === "REFERENCES" || g.privilege === "TRIGGER")
      .map((g) => `${g.role}:${g.table}.${g.privilege}`);
    expect(bad).toEqual([]);
  });

  it("**`service_role` بلا منحة جدول واحدة** — مفتاحه لا يقرأ بيانات عبر REST", () => {
    const any = grants.filter((g) => g.role === "service_role").map((g) => `${g.table}.${g.privilege}`);
    expect(any).toEqual([]);
  });
});

describe("`anon` لا يكتب شيئاً", () => {
  it("لا منحة إدراج ولا تحديث لزائر", () => {
    const writes = grants
      .filter((g) => g.role === "anon" && (g.privilege === "INSERT" || g.privilege === "UPDATE"))
      .map((g) => `${g.table}.${g.privilege}`);
    expect(writes).toEqual([]);
  });

  it("لا سياسة كتابة لزائر أيضاً — المنحة والسياسة متّفقتان", () => {
    const writes = policies
      .filter((p) => p.role === "anon" && p.command !== "SELECT")
      .map((p) => `${p.table}.${p.command}`);
    expect(writes).toEqual([]);
  });
});
