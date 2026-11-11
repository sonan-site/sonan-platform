import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * تعديل الإدارة وسجلّ تعديلات البيانات (الهجرة 20261111100000 · adr/0059).
 *
 * ما يُفحَص جوهراً: **كل تعديلٍ يُسجَّل** — بيد صاحبه أو بيد الإدارة — إلا استكمال صاحبه لفارغ، ورقم
 * الوثيقة لا يدخل السجلّ قيمةً، والمحو يُسقط القيم ويُبقي من عدّل ومتى وأيّ حقل.
 */

let db: Client;
const roleIds: string[] = [];

const OWNER = "00000000-0000-4000-8000-000000000fa1";
const ADMIN = "00000000-0000-4000-8000-000000000fa2";
/** يقرأ الحسابات ولا يعدّلها — يُرفض. */
const READER = "00000000-0000-4000-8000-000000000fa3";
/** بلا صفّ هوية — تُنشئه الإدارة. */
const NO_ID = "00000000-0000-4000-8000-000000000fa4";
/** في السلّة — لا يُعدَّل. */
const BINNED = "00000000-0000-4000-8000-000000000fa5";
const USERS = [OWNER, ADMIN, READER, NO_ID, BINNED];

let sectionId: string;
let programId: string;
let trackId: string;

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

async function grant(uid: string, name: string, codes: string[]) {
  const id = (await db.query<{ id: string }>(`insert into public.roles (name) values ($1) returning id`, [name])).rows[0]!.id;
  roleIds.push(id);
  for (const code of codes) await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [id, code]);
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [uid, id]);
}

type AuditRow = { before: { fields?: Record<string, unknown> }; after: Record<string, unknown> & { fields?: Record<string, unknown> } };

const profileId = async (uid: string) =>
  (await db.query<{ id: string }>(`select id from public.profiles where user_id = $1`, [uid])).rows[0]!.id;

const changes = async (action: string, entity: string) =>
  (
    await db.query<AuditRow>(
      `select before, after from public.audit_log where action = $1 and entity_id = $2 order by created_at`,
      [action, entity],
    )
  ).rows;

const seen = async (uid: string) =>
  (await db.query<{ t: string }>(`select updated_at::text as t from public.profiles where user_id = $1`, [uid])).rows[0]!.t;

async function profileData(uid: string, patch: Record<string, string> = {}) {
  const p = (await db.query(`select *, birth_date::text as birth from public.profiles where user_id = $1`, [uid])).rows[0];
  return {
    first_name: p.first_name,
    father_name: p.father_name,
    grandfather_name: p.grandfather_name,
    family_name: p.family_name,
    gender: p.gender,
    birth_date: p.birth,
    nationality: p.nationality,
    phone: p.phone,
    phone_secondary: p.phone_secondary ?? "",
    ...patch,
  };
}

/** `confirmed` نصّ التنبيه الذي رآه الإداري — كما يحمله زرّ «احفظ رغم ذلك». */
const adminUpdate = async (uid: string, data: Record<string, unknown>, at: string, confirmed: string | null = null) =>
  asUser(ADMIN, () => db.query(`select public.fn_admin_update_profile($1, $2, $3, $4)`, [uid, data, at, confirmed]));

const fitMessage = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (e: { code?: string; message: string }) => (e.code === "SNFIT" ? e.message : Promise.reject(e)),
  );

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `account-edit-${i}@test.local`,
    ]);
    await db.query(
      `insert into public.profiles (user_id, full_name, first_name, father_name, grandfather_name, family_name, gender,
                                    birth_date, nationality, phone)
       values ($1, '', 'سالم', 'محمد', 'علي', 'التجربة', 'male', '2014-03-01', 'SA', $2)`,
      [uid, `+96650000089${i}`],
    );
  }
  await db.query(`update public.profiles set deleted_at = now(), purge_after = now() + interval '30 days' where user_id = $1`, [BINNED]);
  await db.query(`insert into public.profile_identities (user_id, national_id) values ($1, 'ZZEDIT0001')`, [OWNER]);

  // مسارٌ من ١٠ إلى ١٢ في برنامجٍ للذكور — دخله صاحبه بعمر ١١ (الميلاد ٢٠١٤-٠٣، والتسجيل ٢٠٢٥-٠٦).
  // والحدّ يُضبط بعد الإدراج: حارس الإدراج يقيس العمر اليوم، فلا يفشل الاختبار بمرور السنين.
  sectionId = (await db.query<{ id: string }>(`insert into public.sections (name) values ('قسم التعديل') returning id`)).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, allowed_gender) values ($1, 'برنامج التعديل', 'zz-account-edit', 'male') returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  trackId = (
    await db.query<{ id: string }>(`insert into public.tracks (program_id, name) values ($1, 'مسار التعديل') returning id`, [programId])
  ).rows[0]!.id;
  await db.query(
    `insert into public.participants (user_id, program_id, track_id, joined_at) values ($1, $2, $3, '2025-06-01T09:00:00+03:00')`,
    [OWNER, programId, trackId],
  );
  await db.query(`update public.tracks set min_age = 10, max_age = 12 where id = $1`, [trackId]);

  await grant(ADMIN, "معدّل الحسابات", ["users.read", "users.write", "identities.read", "identities.write", "audit.read"]);
  await grant(READER, "قارئ حسابات", ["users.read"]);
});

afterAll(async () => {
  if (roleIds.length) {
    await db.query(`delete from public.user_roles where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [roleIds]);
    await db.query(`delete from public.roles where id = any($1::uuid[])`, [roleIds]);
  }
  await db.query(`delete from public.notifications where recipient_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[]) or entity_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.participants where user_id = any($1::uuid[])`, [USERS]);
  if (trackId) await db.query(`delete from public.tracks where id = $1`, [trackId]);
  if (programId) await db.query(`delete from public.programs where id = $1`, [programId]);
  if (sectionId) await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db.query(`delete from public.profile_identities where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("سجلّ تعديلات البيانات", () => {
  it("**صاحبه يملأ فارغاً ⇐ لا سطر** — الاستكمال ليس تعديلاً", async () => {
    await asUser(OWNER, () => db.query(`update public.profiles set phone_secondary = '+966500000999' where user_id = $1`, [OWNER]));
    expect(await changes("profile_changed", await profileId(OWNER))).toHaveLength(0);
  });

  it("**وصاحبه يغيّر قيمةً ⇐ سطرٌ بقديمها وجديدها**، وتعديلاته المتتالية سطرٌ واحد", async () => {
    await asUser(OWNER, () => db.query(`update public.profiles set first_name = 'سالمأ' where user_id = $1`, [OWNER]));
    await asUser(OWNER, () => db.query(`update public.profiles set first_name = 'سالمب', phone_secondary = '+966500000998' where user_id = $1`, [OWNER]));
    const rows = await changes("profile_changed", await profileId(OWNER));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.before.fields).toEqual({ first_name: "سالم", phone_secondary: "+966500000999" });
    expect(rows[0]!.after).toMatchObject({
      fields: { first_name: "سالمب", phone_secondary: "+966500000998" },
      by_admin: false,
    });
  });

  it("**ومسح قيمةٍ ثم ملؤها بغيرها يُسجَّلان** — فلا يُتجاوز السجلّ بالمسح", async () => {
    await asUser(OWNER, () => db.query(`update public.profiles set phone_secondary = null where user_id = $1`, [OWNER]));
    await asUser(OWNER, () => db.query(`update public.profiles set phone_secondary = '+966500000997' where user_id = $1`, [OWNER]));
    const last = (await changes("profile_changed", await profileId(OWNER))).at(-1)!;
    expect(last.after.fields).toMatchObject({ phone_secondary: "+966500000997" });
  });

  it("**والإيقاف وتحديث الشروط لا يكتبان سطراً** — المشغّل على الحقول وحدها", async () => {
    const before = (await changes("profile_changed", await profileId(OWNER))).length;
    await asUser(ADMIN, () => db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [OWNER]));
    await asUser(ADMIN, () => db.query(`update public.profiles set deleted_at = null where user_id = $1`, [OWNER]));
    await asUser(OWNER, () => db.query(`update public.profiles set terms_version = terms_version where user_id = $1`, [OWNER]));
    expect(await changes("profile_changed", await profileId(OWNER))).toHaveLength(before);
  });
});

describe("تعديل الإدارة (`fn_admin_update_profile`)", () => {
  it("**قارئ الحسابات بلا التعديل يُرفض**", async () => {
    const data = await profileData(OWNER, { family_name: "غيره" });
    const at = await seen(OWNER);
    await expect(
      asUser(READER, () => db.query(`select public.fn_admin_update_profile($1, $2, $3)`, [OWNER, data, at])),
    ).rejects.toThrow(/لا صلاحية لتعديل بيانات الحسابات/);
  });

  it("**وحسابٌ في السلّة لا يُعدَّل**", async () => {
    await expect(adminUpdate(BINNED, await profileData(BINNED), await seen(BINNED))).rejects.toThrow(/سلّة المحذوفات/);
  });

  it("**وما تغيّر منذ فُتحت الصفحة يُرفض** — فلا يمحو حفظُ الإداري تعديلَ صاحبه", async () => {
    await expect(adminUpdate(OWNER, await profileData(OWNER), "2020-01-01 00:00:00+00")).rejects.toThrow(/أعد فتحها/);
  });

  it("**ميلادٌ يُخرجه عن سنّ مساره يوم تسجيله ⇐ تنبيهٌ حتى يؤكّد بنصّه**، ثم يُحفظ ويُوسَم", async () => {
    const data = await profileData(OWNER, { birth_date: "2010-01-01" });
    const warning = await fitMessage(adminUpdate(OWNER, data, await seen(OWNER)));
    expect(warning).toMatch(/مسار «مسار التعديل» من 10 إلى 12/);
    // تأكيدُ تنبيهٍ آخر لا يكفي — التأكيد لما رُئي.
    await expect(adminUpdate(OWNER, data, await seen(OWNER), "تنبيهٌ آخر")).rejects.toMatchObject({ code: "SNFIT" });
    await adminUpdate(OWNER, data, await seen(OWNER), warning);
    const rows = await changes("profile_changed", await profileId(OWNER));
    expect(rows.at(-1)!.after).toMatchObject({
      fields: { birth_date: "2010-01-01" },
      by_admin: true,
      out_of_track: true,
      out_of_gender: false,
    });
  });

  it("**والعمر يُقاس يوم التسجيل لا اليوم** — ميلادٌ يناسبه يومها لا يُنبَّه عليه", async () => {
    // ٢٠١٣-٠٧-٠١ ⇐ ١١ سنة يوم ١ يونيو ٢٠٢٥ (داخل ١٠–١٢)، وإن تجاوز ١٢ اليوم.
    const data = await profileData(OWNER, { birth_date: "2013-07-01" });
    await adminUpdate(OWNER, data, await seen(OWNER));
    // وحسابٌ خارجٌ قبل التعديل لا يُنبَّه عليه ثانيةً: لا يُحدثه هذا التعديل.
    await adminUpdate(OWNER, await profileData(OWNER, { family_name: "التجربتين" }), await seen(OWNER));
    expect((await changes("profile_changed", await profileId(OWNER))).at(-1)!.after).toMatchObject({ out_of_track: false });
  });

  it("**وتغيير الجنس في برنامجٍ للذكور ⇐ تنبيه**", async () => {
    const data = await profileData(OWNER, { gender: "female" });
    await expect(adminUpdate(OWNER, data, await seen(OWNER))).rejects.toThrow(/للذكور وحدهم/);
  });

  it("**ويُشعَر صاحبه بأسماء الحقول بلا قيمها**، وتظهر في «تنبيهاتي»", async () => {
    const { rows } = await db.query<{ payload: { names: string[] } }>(
      `select payload from public.notifications where recipient_id = $1 and kind = 'profile_corrected'`,
      [OWNER],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.payload.names).toContain("birth_date");
    expect(JSON.stringify(rows)).not.toContain("2010");
    const mine = await asUser(OWNER, async () =>
      (await db.query<{ body: string }>(`select body from public.fn_my_notifications() where kind = 'profile_corrected'`)).rows,
    );
    expect(mine[0]!.body).toContain("birth_date");
  });

  it("**وفحص الأهلية لحامل التعديل وحده** — لا يسأل مشاركٌ عن غيره", async () => {
    await expect(
      asUser(OWNER, () => db.query(`select * from public.fn_account_fit_issues($1, null, null)`, [ADMIN])),
    ).rejects.toThrow(/لا صلاحية لفحص أهلية الحسابات/);
  });
});

describe("الهوية", () => {
  it("**الإدارة تُنشئ هويةً لحسابٍ بلا صفّ** — ويُسجَّل بلا الرقم", async () => {
    await asUser(ADMIN, () =>
      db.query(`insert into public.profile_identities (user_id, national_id, guardian_phone) values ($1, 'ZZEDIT0002', '+966500000997')`, [NO_ID]),
    );
    const rows = await changes("identity_changed", NO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.after).toMatchObject({ by_admin: true, fields: { guardian_phone: "+966500000997" } });
    expect(rows[0]!.after["names"]).toEqual(expect.arrayContaining(["national_id", "guardian_phone"]));
    expect(JSON.stringify(rows)).not.toContain("ZZEDIT");
  });

  it("**ومن لا يملك تعديل الهويات لا يُنشئها لغيره**", async () => {
    await expect(
      asUser(READER, () => db.query(`insert into public.profile_identities (user_id, national_id) values ($1, 'ZZEDIT0003')`, [BINNED])),
    ).rejects.toThrow();
  });

  it("**والإدارة تغيّر الرقم المثبَّت** — سطرٌ بلا الرقم القديم ولا الجديد", async () => {
    await asUser(ADMIN, () => db.query(`update public.profile_identities set national_id = 'ZZEDIT0009' where user_id = $1`, [OWNER]));
    const rows = await changes("identity_changed", OWNER);
    expect(rows.at(-1)!.after["names"]).toContain("national_id");
    expect(JSON.stringify(rows)).not.toContain("ZZEDIT");
  });
});

describe("المحو", () => {
  it("**يُسقط القيم ويُبقي الأسماء والعلامات**، ورقعتا «صوتك» باقيتان", async () => {
    const def = (
      await db.query<{ d: string }>(`select pg_get_functiondef('public.fn_purge_account(uuid)'::regprocedure) as d`)
    ).rows[0]!.d;
    expect(def).toContain("storage_purge_queue");
    expect(def).toContain("replied_by_label");
    expect(def).toContain("identity_changed");

    // المحو الكامل يمسّ مشاركاته وبرامجه — يُحاكى سطره هنا بالتعليمة نفسها على سطور هذا الاختبار.
    const pid = await profileId(OWNER);
    await db.query(
      `update public.audit_log set before = before - 'fields', after = after - 'fields'
       where (action = 'profile_changed' and entity_id = $1) or (action = 'identity_changed' and entity_id = $2)`,
      [pid, OWNER],
    );
    const rows = await changes("profile_changed", pid);
    expect(rows.every((r) => r.before.fields === undefined && r.after.fields === undefined)).toBe(true);
    expect(rows.at(-1)!.after["names"]).toBeDefined();
    expect(rows.at(-1)!.after["by_admin"]).toBe(true);
  });
});
