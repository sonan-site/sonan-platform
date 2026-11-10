import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * علامتا التكرار في `fn_accounts_list` و`fn_export_accounts` (الهجرة 20261110130000 · الدفعة ٣).
 *
 * «مكرّر محتمل» بالميلاد مع الاسم (مطبَّعاً) أو الجوال، و«جوال مشترك» بميلادٍ آخر — أغلبه إخوة.
 * والنظير يُحسب على كل الحسابات لا على المطابِق للبحث، ومن في السلّة ليس نظيراً. والقاعدة قد تحوي
 * حسابات غير هذه، فالاستعلام يُحصر بكلمةٍ في أسماء من يُسأل عنهم.
 */

let db: Client;
const roleIds: string[] = [];

const MARK = "قائمةالتكرار";
const FIRST = "00000000-0000-4000-8000-000000000f61";
const AGAIN = "00000000-0000-4000-8000-000000000f62";
const SIBLING = "00000000-0000-4000-8000-000000000f63";
const NAMESAKE = "00000000-0000-4000-8000-000000000f64";
/** سجّل ثانيةً بجواله وميلاده واسمٍ آخر لا يطابق البحث — نظيرٌ من خارج المطابِق. */
const OUTSIDE = "00000000-0000-4000-8000-000000000f65";
/** في سلّة المحذوفات بالاسم والميلاد نفسيهما — ليس نظيراً. */
const BINNED = "00000000-0000-4000-8000-000000000f66";
const ADMIN = "00000000-0000-4000-8000-000000000f67";
const PLAIN = "00000000-0000-4000-8000-000000000f68";
const EXPORTER = "00000000-0000-4000-8000-000000000f69";
const USERS = [FIRST, AGAIN, SIBLING, NAMESAKE, OUTSIDE, BINNED, ADMIN, PLAIN, EXPORTER];

type Row = { full_name: string; same_identity: string[]; same_phone: string[]; total: string };

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

async function list(uid: string, words: string[], duplicate: string | null = null): Promise<Row[]> {
  return asUser(uid, async () => {
    const { rows } = await db.query<Row>(
      `select full_name, same_identity, same_phone, total
       from public.fn_accounts_list($1, null, null, null, 'created_at', false, 25, 0, $2)`,
      [words, duplicate],
    );
    return rows;
  });
}

const peerNames = (labels: string[]) => labels.map((l) => l.split(" · ")[0]);

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

  const people: [string, string, string, string | null][] = [
    [FIRST, `عبدالله أحمد ${MARK}`, "+966500000861", "2010-05-01"],
    // الاسم نفسه بعد التطبيع (مسافةٌ وهمزة)، وجوالٌ آخر.
    [AGAIN, `عبد الله احمد ${MARK}`, "+966500000862", "2010-05-01"],
    // أخوه: جوال وليّه نفسه، وميلادٌ آخر.
    [SIBLING, `خالد ${MARK}`, "+966500000861", "2012-01-01"],
    // سَمِيّه: الاسم نفسه وميلادٌ آخر — ليس تكراراً.
    [NAMESAKE, `عبدالله أحمد ${MARK}`, "+966500000864", "2011-03-03"],
    [OUTSIDE, "اسم آخر كلياً", "+966500000861", "2010-05-01"],
    [BINNED, `عبدالله أحمد ${MARK}`, "+966500000866", "2010-05-01"],
    [ADMIN, "مدير قائمة التكرار", "+966500000867", null],
    // يشارك الأوّلَ جوالَه — فلو كشفت الدالة لغير قارئ الحسابات لظهر له نظيره.
    [PLAIN, "مستخدم عادي للتكرار", "+966500000861", null],
    [EXPORTER, "مصدّر قائمة التكرار", "+966500000869", null],
  ];
  for (const [i, [uid, name, phone, birth]] of people.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `accounts-dup-${i}@test.local`,
    ]);
    await db.query(
      `insert into public.profiles (user_id, full_name, phone, birth_date, created_at)
       values ($1, $2, $3, $4, now() - make_interval(days => $5))`,
      [uid, name, phone, birth, 20 - i],
    );
  }
  await db.query(
    `update public.profiles set deleted_at = now(), purge_after = now() + interval '30 days' where user_id = $1`,
    [BINNED],
  );

  await grant(ADMIN, "دور قائمة التكرار", ["users.read"]);
  await grant(EXPORTER, "مصدّر قائمة التكرار", ["users.read", "users.write"]);
});

afterAll(async () => {
  if (roleIds.length) {
    await db.query(`delete from public.user_roles where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.roles where id = any($1::uuid[])`, [roleIds]);
  }
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("مكرّر محتمل", () => {
  it("**الاسم مطبَّعاً مع الميلاد** — «عبد الله احمد» تطابق «عبدالله أحمد»، والسَّمِيّ بميلادٍ آخر ليس تكراراً", async () => {
    const rows = await list(ADMIN, [MARK]);
    const again = rows.find((r) => r.full_name === `عبد الله احمد ${MARK}`)!;
    expect(peerNames(again.same_identity)).toContain(`عبدالله أحمد ${MARK}`);
    const namesake = rows.find((r) => r.full_name === `عبدالله أحمد ${MARK}` && r.same_identity.length === 0);
    expect(namesake).toBeDefined();
  });

  it("**والجوال مع الميلاد** — ونظيرٌ لا يطابق البحث يظهر", async () => {
    const first = (await list(ADMIN, [MARK])).find(
      (r) => r.full_name === `عبدالله أحمد ${MARK}` && r.same_identity.length > 0,
    )!;
    expect(peerNames(first.same_identity)).toEqual(expect.arrayContaining([`عبد الله احمد ${MARK}`, "اسم آخر كلياً"]));
  });

  it("**ومن في سلّة المحذوفات ليس نظيراً ولا موسوماً** — فالحسم بالحذف يُزيل العلامة من الطرفين", async () => {
    const rows = await list(ADMIN, [MARK]);
    expect(rows.flatMap((r) => r.same_identity).some((l) => l.includes("…0866"))).toBe(false);
    expect(rows.filter((r) => r.same_identity.length > 0)).toHaveLength(2);
  });

  it("والنظير موصوفٌ بآخر جواله ويوم إنشائه", async () => {
    const again = (await list(ADMIN, [MARK])).find((r) => r.full_name === `عبد الله احمد ${MARK}`)!;
    expect(again.same_identity.find((l) => l.startsWith(`عبدالله أحمد ${MARK}`))).toMatch(/ · …0861 · \d{4}-\d{2}-\d{2}$/);
  });
});

describe("جوال مشترك", () => {
  it("**بميلادٍ آخر، منفصلٌ عن التكرار** — الأخ بجوال وليّه ليس مكرّراً", async () => {
    const sibling = (await list(ADMIN, [MARK])).find((r) => r.full_name === `خالد ${MARK}`)!;
    expect(sibling.same_identity).toEqual([]);
    expect(peerNames(sibling.same_phone)).toEqual(expect.arrayContaining([`عبدالله أحمد ${MARK}`, "اسم آخر كلياً"]));
  });
});

describe("التصفية والصلاحية والتصدير", () => {
  it("**التصفية بكلٍّ منهما** بعددها", async () => {
    const identity = await list(ADMIN, [MARK], "identity");
    expect(identity.map((r) => r.full_name).sort()).toEqual([`عبد الله احمد ${MARK}`, `عبدالله أحمد ${MARK}`].sort());
    expect(Number(identity[0]!.total)).toBe(2);
    expect((await list(ADMIN, [MARK], "phone")).map((r) => r.full_name)).toContain(`خالد ${MARK}`);
  });

  it("**من لا يقرأ الحسابات لا يرى نظراءه** — صفّه وحده بلا علامة", async () => {
    const rows = await list(PLAIN, []);
    expect(rows.every((r) => r.same_identity.length === 0 && r.same_phone.length === 0)).toBe(true);
  });

  it("**والتصدير بتصفية التكرار**، وعلامتاه منطقيتان، والتدقيق يذكرها", async () => {
    const data = await asUser(EXPORTER, async () => {
      const { rows } = await db.query<{ d: { full_name: string; same_identity: boolean; same_phone: boolean }[] }>(
        `select public.fn_export_accounts($1, null, null, null, 'created_at', false, 'identity') as d`,
        [[MARK]],
      );
      return rows[0]!.d;
    });
    expect(data).toHaveLength(2);
    expect(data.every((r) => r.same_identity)).toBe(true);
    const { rows } = await db.query<{ after: { duplicate: string } }>(
      `select after from public.audit_log where actor_id = $1 and action = 'accounts_exported' order by created_at desc limit 1`,
      [EXPORTER],
    );
    expect(rows[0]!.after.duplicate).toBe("identity");
  });
});
