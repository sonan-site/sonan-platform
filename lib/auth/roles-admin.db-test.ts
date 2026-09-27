import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * إنشاء الأدوار ومنح صلاحياتها — سياسات الهجرة ٠٢٦ كما تراها الشاشة الجديدة
 * (`adr/0031`). كان `roles.write` رمزاً محروساً بلا شاشة، فلم يُختبَر قطّ.
 *
 * الحكم كله في القاعدة: من يملك `roles.write` يُنشئ، **ولا يمنح دوراً صلاحيةً
 * لا يملكها هو**، ولا يمسّ دوراً نظامياً.
 */

let db: Client;
let systemRoleId: string;
let adminRoleId: string;
let customRoleId: string;

const ADMIN = "00000000-0000-4000-8000-0000000000e1";
const WEAK = "00000000-0000-4000-8000-0000000000e2";
const USERS = [ADMIN, WEAK];

async function asUser<T>(uid: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `roles-admin-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'عضو الفريق', $2)`,
      [uid, `+96650000020${i}`],
    );
  }

  systemRoleId = (await db.query<{ id: string }>(
    `select id from public.roles where is_system = true and deleted_at is null limit 1`,
  )).rows[0]!.id;

  // إداريٌّ يملك إدارة الأدوار وصلاحيتين غيرهما، وضعيفٌ بلا شيء.
  adminRoleId = (await db.query<{ id: string }>(
    `insert into public.roles (name) values ('دور اختبار إدارة الأدوار') returning id`,
  )).rows[0]!.id;
  await db.query(
    `insert into public.role_permissions (role_id, permission_code) values
       ($1, 'roles.write'), ($1, 'roles.read'), ($1, 'programs.read')`,
    [adminRoleId],
  );
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, adminRoleId]);
});

afterAll(async () => {
  if (customRoleId) {
    await db.query(`delete from public.role_permissions where role_id = $1`, [customRoleId]);
    await db.query(`delete from public.roles where id = $1`, [customRoleId]);
  }
  await db.query(`delete from public.role_permissions where role_id = $1`, [adminRoleId]);
  await db.query(`delete from public.user_roles where role_id = $1`, [adminRoleId]);
  await db.query(`delete from public.roles where id = $1`, [adminRoleId]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("إنشاء الأدوار", () => {
  it("**من يملك roles.write يُنشئ دوراً**", async () => {
    customRoleId = await asUser(ADMIN, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.roles (name) values ('منسّق برنامج') returning id`,
      );
      return rows[0]!.id;
    });
    expect(customRoleId).toBeTruthy();
  });

  it("ومن لا يملكها يُرفض", async () => {
    await expect(
      asUser(WEAK, () => db.query(`insert into public.roles (name) values ('دور متطفّل')`)),
    ).rejects.toThrow(/row-level security/);
  });

  it("**ولا يُنشأ دور نظامي من الشاشة**", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(`insert into public.roles (name, is_system) values ('دور نظامي مزعوم', true)`),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("منح الصلاحيات", () => {
  it("**يمنح ما يملكه**", async () => {
    await asUser(ADMIN, () =>
      db.query(
        `insert into public.role_permissions (role_id, permission_code) values ($1, 'programs.read')`,
        [customRoleId],
      ),
    );
    const { rowCount } = await db.query(
      `select 1 from public.role_permissions where role_id = $1 and permission_code = 'programs.read' and deleted_at is null`,
      [customRoleId],
    );
    expect(rowCount).toBe(1);
  });

  it("**ولا يمنح ما لا يملكه** — لا تمرير صلاحية أوسع من صلاحيتك", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(
          `insert into public.role_permissions (role_id, permission_code) values ($1, 'audit.read')`,
          [customRoleId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("والرفع حذفٌ ليّن يمرّ بالسياسة نفسها", async () => {
    await asUser(ADMIN, () =>
      db.query(
        `update public.role_permissions set deleted_at = now()
          where role_id = $1 and permission_code = 'programs.read'`,
        [customRoleId],
      ),
    );
    const { rowCount } = await db.query(
      `select 1 from public.role_permissions where role_id = $1 and permission_code = 'programs.read' and deleted_at is null`,
      [customRoleId],
    );
    expect(rowCount).toBe(0);
  });

  it("**والدور النظامي لا تُمسّ صلاحياته ولا اسمه**", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(
          `insert into public.role_permissions (role_id, permission_code) values ($1, 'programs.read')`,
          [systemRoleId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    const { rowCount } = await asUser(ADMIN, () =>
      db.query(`update public.roles set name = 'اسم آخر' where id = $1`, [systemRoleId]),
    );
    expect(rowCount).toBe(0);
  });
});
