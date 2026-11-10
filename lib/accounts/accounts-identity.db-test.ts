import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * البحث برقم الوثيقة — `fn_account_by_identity` و`p_user_id` (الهجرة 20261110140000 · الدفعة ٤).
 *
 * ما يُفحَص جوهراً أن البحث **لا يكشف ما يُخفيه القناع**: لحامل `identities.read` وحده، وتطابقٌ تامّ
 * لا جزء، ويُرجع الحساب لا الرقم، وكل بحثٍ يُسجَّل بلا الرقم.
 */

let db: Client;
const roleIds: string[] = [];

const DOC = "ZZTEST4821";
const TARGET = "00000000-0000-4000-8000-000000000f71";
const HOLDER = "00000000-0000-4000-8000-000000000f72";
const READER = "00000000-0000-4000-8000-000000000f73";
/** يحمل الهويات بلا قراءة الحسابات — يُرفض أيضاً. */
const ID_ONLY = "00000000-0000-4000-8000-000000000f74";
/** هويته محذوفة — لا يُوجد بها. */
const GONE = "00000000-0000-4000-8000-000000000f75";
const EXPORTER = "00000000-0000-4000-8000-000000000f76";
const GONE_DOC = "ZZTEST4822";
const USERS = [TARGET, HOLDER, READER, ID_ONLY, GONE, EXPORTER];

async function asUser<T>(uid: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

const search = (uid: string, id: string) =>
  asUser(uid, async () => (await db.query<{ u: string | null }>(`select public.fn_account_by_identity($1) as u`, [id])).rows[0]!.u);

async function grant(uid: string, name: string, codes: string[]) {
  const id = (await db.query<{ id: string }>(`insert into public.roles (name) values ($1) returning id`, [name])).rows[0]!.id;
  roleIds.push(id);
  for (const code of codes) await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [id, code]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [uid, id]);
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `accounts-identity-${i}@test.local`,
    ]);
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, $2, $3)`, [
      uid,
      `حساب الوثيقة ${i}`,
      `+96650000087${i}`,
    ]);
  }
  await db.query(`insert into public.profile_identities (user_id, national_id) values ($1, $2)`, [TARGET, DOC]);
  await db.query(`insert into public.profile_identities (user_id, national_id, deleted_at) values ($1, $2, now())`, [
    GONE,
    GONE_DOC,
  ]);

  await grant(HOLDER, "باحثٌ بالوثيقة", ["users.read", "identities.read"]);
  await grant(READER, "قارئ حسابات بلا هويات", ["users.read"]);
  await grant(ID_ONLY, "هويات بلا حسابات", ["identities.read"]);
  await grant(EXPORTER, "مصدّرٌ بالوثيقة", ["users.read", "users.write"]);
});

afterAll(async () => {
  if (roleIds.length) {
    await db.query(`delete from public.user_roles where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.roles where id = any($1::uuid[])`, [roleIds]);
  }
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profile_identities where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("البحث برقم الوثيقة", () => {
  it("**قارئ الحسابات بلا الهويات يُرفض** — يرى الرقم مقنّعاً، فلا يجرّب الأرقام", async () => {
    await expect(search(READER, DOC)).rejects.toThrow(/لا صلاحية للبحث برقم الوثيقة/);
  });

  it("وحامل الهويات بلا قراءة الحسابات يُرفض أيضاً", async () => {
    await expect(search(ID_ONLY, DOC)).rejects.toThrow(/لا صلاحية للبحث برقم الوثيقة/);
  });

  it("والهوية المحذوفة لا يُوجد بها", async () => {
    expect(await search(HOLDER, GONE_DOC)).toBeNull();
  });

  it("**وحامل الهويات يجد الحساب بالتطابق التامّ** — ومطبَّعاً (صغيرة، مسافات، شَرطة)", async () => {
    expect(await search(HOLDER, DOC)).toBe(TARGET);
    expect(await search(HOLDER, "zztest 48-21")).toBe(TARGET);
  });

  it("**ولا يجد بجزءٍ من الرقم**، وما لا يصلح رقماً لا يُبحث به", async () => {
    expect(await search(HOLDER, "ZZTEST482")).toBeNull();
    expect(await search(HOLDER, "ab")).toBeNull();
  });

  it("**وكل بحثٍ يُسجَّل بلا الرقم، والحساب الموجود فيه** — وما لا يصلح رقماً لا يُسجَّل", async () => {
    const last = async () =>
      (
        await db.query<{ entity_id: string | null; after: { found: boolean } }>(
          `select entity_id, after from public.audit_log where actor_id = $1 and action = 'identity_searched'
           order by created_at desc limit 1`,
          [HOLDER],
        )
      ).rows[0];
    await search(HOLDER, DOC);
    expect(await last()).toMatchObject({ entity_id: TARGET, after: { found: true } });
    await search(HOLDER, "ZZTEST999");
    const missed = await last();
    expect(missed).toMatchObject({ entity_id: null, after: { found: false } });
    expect(JSON.stringify(missed)).not.toContain("ZZTEST");
    const before = await last();
    await search(HOLDER, "ab");
    expect(await last()).toEqual(before);
  });

  it("**والقائمة تعرض الحساب الموجود وحده** بـ`p_user_id`", async () => {
    const rows = await asUser(HOLDER, async () =>
      (
        await db.query<{ full_name: string; total: string }>(
          `select full_name, total from public.fn_accounts_list(p_user_id => $1)`,
          [TARGET],
        )
      ).rows,
    );
    expect(rows.map((r) => r.full_name)).toEqual(["حساب الوثيقة 0"]);
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it("**والتصدير بالحساب نفسه** يذكر في سجلّه أنه من رقم وثيقة — بلا الرقم", async () => {
    const data = await asUser(EXPORTER, async () =>
      (await db.query<{ d: { full_name: string }[] }>(`select public.fn_export_accounts(p_user_id => $1) as d`, [TARGET])).rows[0]!.d,
    );
    expect(data.map((r) => r.full_name)).toEqual(["حساب الوثيقة 0"]);
    const { rows } = await db.query<{ after: { by_document: boolean; count: number } }>(
      `select after from public.audit_log where actor_id = $1 and action = 'accounts_exported' order by created_at desc limit 1`,
      [EXPORTER],
    );
    expect(rows[0]!.after).toMatchObject({ by_document: true, count: 1 });
  });
});
