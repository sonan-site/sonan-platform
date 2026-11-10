import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `fn_accounts_list` — صفحة «المشاركون في المنصة» بالبحث والتصفية والفرز (الهجرة 20261110100000).
 *
 * القاعدة قد تحوي حسابات غير حسابات الاختبار، فكل استعلامٍ هنا يُحصر بكلمةٍ في أسمائها وحدها.
 * وما يُفحَص جوهراً: أن الدالة **بصلاحية من يطلب** — لا تكشف لأحدٍ ما لا تكشفه الشاشة بدونها،
 * وأن «له برنامج» حكمٌ بالمشاركة لا بظهور اسم البرنامج.
 */

let db: Client;
let sectionId: string;
let programId: string;
let otherProgramId: string;
const roleIds: string[] = [];

const MARK = "قائمةالحسابات";
const IN_PROGRAM = "00000000-0000-4000-8000-000000000f41";
const NO_PROGRAM = "00000000-0000-4000-8000-000000000f42";
const SUSPENDED = "00000000-0000-4000-8000-000000000f43";
const IN_BIN = "00000000-0000-4000-8000-000000000f44";
const ADMIN = "00000000-0000-4000-8000-000000000f45";
const PLAIN = "00000000-0000-4000-8000-000000000f46";
/** يقرأ الحسابات كلها، ومشاركي «برنامج آخر» وحده. */
const SCOPED = "00000000-0000-4000-8000-000000000f47";
const USERS = [IN_PROGRAM, NO_PROGRAM, SUSPENDED, IN_BIN, ADMIN, PLAIN, SCOPED];

type Row = { full_name: string; programs: string[]; has_program: boolean; total: string };

/** دورٌ بصلاحياته، ممنوحٌ لمستخدم — عامّاً أو محصوراً ببرنامج. */
async function grant(uid: string, name: string, codes: string[], scopeProgramId: string | null = null) {
  const id = (await db.query<{ id: string }>(`insert into public.roles (name) values ($1) returning id`, [name])).rows[0]!.id;
  roleIds.push(id);
  for (const code of codes) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [id, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id, scope_program_id) values ($1, $2, $3)`, [
    uid,
    id,
    scopeProgramId,
  ]);
}

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

/** صفحةٌ بصلاحية `uid`، محصورةٌ بحسابات الاختبار بكلمة `MARK`. */
async function list(
  uid: string,
  args: { words?: string[]; phone?: string; program?: string | null; status?: string | null; sort?: string; desc?: boolean; limit?: number; offset?: number } = {},
): Promise<Row[]> {
  return asUser(uid, async () => {
    const { rows } = await db.query<Row>(
      `select full_name, programs, has_program, total from public.fn_accounts_list($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        [MARK, ...(args.words ?? [])],
        args.phone ?? null,
        args.program ?? null,
        args.status ?? null,
        args.sort ?? "created_at",
        args.desc ?? true,
        args.limit ?? 25,
        args.offset ?? 0,
      ],
    );
    return rows;
  });
}

const names = (rows: Row[]) => rows.map((r) => r.full_name);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const people: [string, string, string][] = [
    [IN_PROGRAM, `أحمد بن صالح ${MARK}`, "+966500000741"],
    [NO_PROGRAM, `بدر علي ${MARK}`, "+966500000742"],
    [SUSPENDED, `جابر ${MARK}`, "+966500000743"],
    [IN_BIN, `داود ${MARK}`, "+966500000744"],
    [ADMIN, "مدير قائمة الحسابات", "+966500000745"],
    [PLAIN, "مستخدم عادي للقائمة", "+966500000746"],
    [SCOPED, "منسّق برنامج للقائمة", "+966500000747"],
  ];
  for (const [i, [uid, name, phone]] of people.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `accounts-list-${i}@test.local`],
    );
    // الإنشاء بفوارق زمنية ثابتة — فالترتيب بالتاريخ يُختبر بلا تعادل.
    await db.query(
      `insert into public.profiles (user_id, full_name, phone, created_at)
       values ($1, $2, $3, now() - make_interval(days => $4))`,
      [uid, name, phone, 10 - i],
    );
  }
  await db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [SUSPENDED]);
  await db.query(
    `update public.profiles set deleted_at = now(), purge_after = now() + interval '30 days' where user_id = $1`,
    [IN_BIN],
  );

  sectionId = (
    await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم قائمة الحسابات') returning id`)
  ).rows[0]!.id;
  for (const [slug, name] of [["accounts-list-test", "برنامج القائمة"], ["accounts-list-other", "برنامج آخر"]] as const) {
    const id = (
      await db.query<{ id: string }>(
        `insert into public.programs (section_id, name, slug, capacity) values ($1, $2, $3, 10) returning id`,
        [sectionId, name, slug],
      )
    ).rows[0]!.id;
    if (slug === "accounts-list-test") programId = id;
    else otherProgramId = id;
  }
  await db.query(`insert into public.participants (user_id, program_id) values ($1, $2)`, [IN_PROGRAM, programId]);

  await grant(ADMIN, "دور قائمة الحسابات", ["users.read", "participants.read", "programs.read"]);
  await grant(SCOPED, "قراءة الحسابات للقائمة", ["users.read"]);
  await grant(SCOPED, "مشاركو برنامجٍ للقائمة", ["participants.read"], otherProgramId);
});

afterAll(async () => {
  // الأدوار قبل البرامج: الدور المحصور ببرنامجٍ يشير إليه (`fk_user_roles_scope_program`).
  if (roleIds.length) {
    await db.query(`delete from public.user_roles where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.roles where id = any($1::uuid[])`, [roleIds]);
  }
  if (programId) await db.query(`delete from public.participants where program_id = any($1::uuid[])`, [[programId, otherProgramId]]);
  await db.query(`delete from public.programs where section_id = $1`, [sectionId]);
  if (sectionId) await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("الصلاحية", () => {
  it("**بصلاحية من يطلب:** من لا يقرأ الحسابات لا يرى حسابات غيره", async () => {
    expect(await list(PLAIN)).toEqual([]);
  });

  it("وحامل قراءة الحسابات يرى الأربعة بعددهم", async () => {
    const rows = await list(ADMIN);
    expect(rows).toHaveLength(4);
    expect(Number(rows[0]!.total)).toBe(4);
  });

  it("**ومن يقرأ مشاركي برنامجٍ آخر لا يرى مشاركة غيره** — فالصفحة تُخفي عنه «بلا برنامج»", async () => {
    const rows = await list(SCOPED, { words: ["أحمد"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ has_program: false, programs: [] });
  });
});

describe("البحث", () => {
  it("**كلمات الاسم تُطابَق كلٌّ وحدها** — «أحمد صالح» تجد «أحمد بن صالح»", async () => {
    expect(names(await list(ADMIN, { words: ["أحمد", "صالح"] }))).toEqual([`أحمد بن صالح ${MARK}`]);
  });

  it("و`%` في البحث حرفٌ لا حرف مطابقة", async () => {
    expect(await list(ADMIN, { words: ["%"] })).toEqual([]);
  });

  it("والجوال بجزئه", async () => {
    expect(names(await list(ADMIN, { phone: "500000742" }))).toEqual([`بدر علي ${MARK}`]);
  });
});

describe("التصفية", () => {
  it("**بلا برنامج**", async () => {
    expect(names(await list(ADMIN, { program: "none", status: "active" }))).toEqual([`بدر علي ${MARK}`]);
  });

  it("وببرنامجٍ بعينه، وببرنامجٍ لا مشارك فيه", async () => {
    const rows = await list(ADMIN, { program: programId });
    expect(names(rows)).toEqual([`أحمد بن صالح ${MARK}`]);
    expect(rows[0]).toMatchObject({ programs: ["برنامج القائمة"], has_program: true });
    // المعرّف بحروفٍ كبيرة كالصغيرة.
    expect(names(await list(ADMIN, { program: programId.toUpperCase() }))).toEqual([`أحمد بن صالح ${MARK}`]);
    expect(await list(ADMIN, { program: otherProgramId })).toEqual([]);
  });

  it("و`any` لعدّ من في برنامجٍ على الأقل، وقيمةٌ مجهولة لا تُرجع شيئاً", async () => {
    expect(names(await list(ADMIN, { program: "any" }))).toEqual([`أحمد بن صالح ${MARK}`]);
    expect(await list(ADMIN, { program: "x'; drop" })).toEqual([]);
  });

  it("**بالحالة:** نشط · موقوف · في السلّة — والموقوف غير المحذوف", async () => {
    expect(names(await list(ADMIN, { status: "active", sort: "full_name", desc: false }))).toEqual([
      `أحمد بن صالح ${MARK}`,
      `بدر علي ${MARK}`,
    ]);
    expect(names(await list(ADMIN, { status: "suspended" }))).toEqual([`جابر ${MARK}`]);
    expect(names(await list(ADMIN, { status: "bin" }))).toEqual([`داود ${MARK}`]);
  });
});

describe("الفرز والصفحات", () => {
  it("**الافتراضي: الأحدث أولاً**، والاسم تصاعدياً وتنازلياً", async () => {
    expect(names(await list(ADMIN))[0]).toBe(`داود ${MARK}`);
    expect(names(await list(ADMIN, { sort: "full_name", desc: false }))[0]).toBe(`أحمد بن صالح ${MARK}`);
    expect(names(await list(ADMIN, { sort: "full_name", desc: true }))[0]).toBe(`داود ${MARK}`);
  });

  it("**العدد الكلّي يبقى مع كل صفحة**", async () => {
    const second = await list(ADMIN, { sort: "full_name", desc: false, limit: 2, offset: 2 });
    expect(names(second)).toEqual([`جابر ${MARK}`, `داود ${MARK}`]);
    expect(Number(second[0]!.total)).toBe(4);
  });
});
