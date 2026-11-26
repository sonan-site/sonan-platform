import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * إشعارات الجهاز (الهجرة 20261126100000 · adr/0064).
 *
 * ما يُفحَص جوهراً: الاشتراك لصاحبه وحده وبعنوان خدمة إشعارٍ وحده، والجهاز الواحد يحمل أكثر من حساب
 * (قرار الراعي)، والحجز لا يُرسل الإشعار مرتين ولا يُرسل لمن لا جهاز له أو لموقوف أو لقديم.
 */

let db: Client;
let other: Client;

const A = "00000000-0000-4000-8000-0000000fb0a1";
const B = "00000000-0000-4000-8000-0000000fb0a2";
/** بلا جهاز. */
const C = "00000000-0000-4000-8000-0000000fb0a3";
/** موقوف. */
const D = "00000000-0000-4000-8000-0000000fb0a4";
const USERS = [A, B, C, D];

const EP = "https://fcm.googleapis.com/fcm/send/test-device-1:APA91b";
const KEY = "B".repeat(87);
const AUTH = "a".repeat(22);

async function asUser<T>(uid: string | null, work: () => Promise<T>, conn: Client = db): Promise<T> {
  await conn.query("begin");
  try {
    await conn.query(uid ? "set local role authenticated" : "set local role anon");
    if (uid) {
      await conn.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    }
    const result = await work();
    await conn.query("commit");
    return result;
  } catch (error) {
    await conn.query("rollback");
    throw error;
  }
}

const subscribe = (uid: string, endpoint = EP, conn: Client = db) =>
  asUser(uid, () => conn.query(`select public.fn_push_subscribe($1, $2, $3, 'ios')`, [endpoint, KEY, AUTH]), conn);

const rowsOf = async (uid: string) =>
  (await db.query<{ endpoint: string }>(`select endpoint from public.push_subscriptions where user_id = $1`, [uid])).rows;

async function notify(uid: string, opts: { age?: string; deleted?: boolean } = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.notifications (recipient_id, kind, payload, status, sent_at, created_at, deleted_at)
     values ($1, 'track_change_decided', '{"decision":"approved"}', 'sent', now(),
             now() - coalesce($2::interval, '0'), case when $3 then now() end)
     returning id`,
    [uid, opts.age ?? null, opts.deleted ?? false],
  );
  return rows[0]!.id;
}

type Claimed = { id: string; recipient_id: string; deliver: boolean };
const claim = async (limit = 200, conn: Client = db) =>
  (await conn.query<Claimed>(`select id, recipient_id, deliver from public.fn_push_claim($1)`, [limit])).rows;

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  other = new Client({ connectionString: url });
  await db.connect();
  await other.connect();

  // ما سبق في الطابور من غير هذا الملف لا يُخلط بحجزه.
  await db.query(`update public.notifications set pushed_at = now() where pushed_at is null`);

  for (const [i, uid] of USERS.entries()) {
    await db.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      uid,
      `push-${i}@test.local`,
    ]);
    await db.query(
      `insert into public.profiles (user_id, full_name, first_name, father_name, grandfather_name, family_name, gender,
                                    birth_date, nationality, phone)
       values ($1, '', 'سالم', 'محمد', 'علي', 'التجربة', 'male', '2014-03-01', 'SA', $2)`,
      [uid, `+96650000077${i}`],
    );
  }
});

afterAll(async () => {
  await db.query(`delete from public.notifications where recipient_id = any($1)`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1)`, [USERS]);
  await db.query(`delete from auth.users where id = any($1)`, [USERS]);
  await other.end();
  await db.end();
});

describe("الاشتراك", () => {
  it("صاحبه يفعّل جهازه، ويرى أجهزته وحده", async () => {
    await subscribe(A);
    expect(await rowsOf(A)).toEqual([{ endpoint: EP }]);
    const seenByB = await asUser(B, () => db.query(`select 1 from public.push_subscriptions where user_id = $1`, [A]));
    expect(seenByB.rowCount).toBe(0);
  });

  it("عنوانٌ خارج خدمات الإشعار يُرفض (م٢)", async () => {
    await expect(subscribe(A, "https://example.com/push")).rejects.toThrow(/عنوان الجهاز غير مقبول/);
    await expect(subscribe(A, "https://fcm.googleapis.com@evil.example/x")).rejects.toThrow(/عنوان الجهاز غير مقبول/);
  });

  it("لا كتابة من العميل مباشرة، ولا تفعيل للزائر", async () => {
    await expect(
      asUser(A, () =>
        db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device) values ($1, $2, $3, $4, 'ios')`, [
          A,
          `${EP}-direct`,
          KEY,
          AUTH,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(null, () => db.query(`select public.fn_push_subscribe($1, $2, $3, 'ios')`, [EP, KEY, AUTH]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("الموقوف لا يفعّل", async () => {
    await subscribe(D, `${EP}-d`);
    await db.query(`update public.profiles set deleted_at = now(), purge_after = now() + interval '30 days' where user_id = $1`, [D]);
    await expect(subscribe(D, `${EP}-d`)).rejects.toThrow(/غير مصرَّح/);
  });

  it("الجهاز الواحد يحمل أكثر من حساب، والإيقاف لصاحبه وحده (قرار الراعي)", async () => {
    await subscribe(B);
    expect(await rowsOf(B)).toEqual([{ endpoint: EP }]);
    expect((await rowsOf(A)).length).toBe(1);

    const mine = (uid: string) => asUser(uid, () => db.query<{ v: boolean }>(`select public.fn_push_is_mine($1) as v`, [EP]));
    expect((await mine(A)).rows[0]!.v).toBe(true);

    const left = await asUser(A, () => db.query<{ n: number }>(`select public.fn_push_unsubscribe($1) as n`, [EP]));
    expect(left.rows[0]!.n).toBe(1);
    expect(await rowsOf(A)).toEqual([]);
    expect((await mine(A)).rows[0]!.v).toBe(false);
    expect((await mine(B)).rows[0]!.v).toBe(true);
  });

  it("سقف عشرة أجهزة للحساب — يُحذف الأقدم", async () => {
    for (let i = 0; i < 12; i++) await subscribe(C, `${EP}-cap-${i}`);
    expect((await rowsOf(C)).length).toBe(10);
    await asUser(C, () => db.query(`select public.fn_push_unsubscribe_all($1)`, [`${EP}-cap-11`]));
    expect(await rowsOf(C)).toEqual([{ endpoint: `${EP}-cap-11` }]);
    await asUser(C, () => db.query(`select public.fn_push_unsubscribe_all()`));
    expect(await rowsOf(C)).toEqual([]);
  });
});

describe("الحجز", () => {
  it("للخادم وحده — لا يحجزه مستخدم فيُعطّل الطابور", async () => {
    await expect(asUser(A, () => db.query(`select public.fn_push_claim(10)`))).rejects.toThrow(/permission denied/);
    await expect(asUser(A, () => db.query(`select public.fn_push_kick()`))).rejects.toThrow(/permission denied/);
  });

  it("يُرسل لمن له جهاز، ويحجز ولا يُرسل للموقوف ولمن لا جهاز له وللقديم، ولا يمسّ المحذوف", async () => {
    await subscribe(A);
    const toB = await notify(B);
    const toC = await notify(C);
    const toD = await notify(D);
    const old = await notify(B, { age: "2 days" });
    const gone = await notify(B, { deleted: true });

    const got = await claim();
    const by = new Map(got.map((r) => [r.id, r.deliver]));
    expect(by.get(toB)).toBe(true);
    expect(by.get(toC)).toBe(false);
    expect(by.get(toD)).toBe(false);
    expect(by.get(old)).toBe(false);
    expect(by.has(gone)).toBe(false);

    // ما حُجز لا يُحجز ثانية.
    expect((await claim()).filter((r) => [toB, toC, toD, old].includes(r.id))).toEqual([]);
  });

  it("طلبان متزامنان لا يحجزان الإشعار نفسه (م٥)", async () => {
    const first = await notify(B);
    const second = await notify(B);
    await db.query("begin");
    try {
      const mine = await claim(1);
      const theirs = await claim(10, other);
      const ids = new Set(mine.map((r) => r.id));
      expect(mine.length).toBe(1);
      expect(theirs.some((r) => ids.has(r.id))).toBe(false);
      expect([...ids, ...theirs.map((r) => r.id)].filter((id) => [first, second].includes(id)).sort()).toEqual([first, second].sort());
    } finally {
      await db.query("commit");
    }
  });

  it("المشغّل لا يُفشل الإدراج ولو لم يُعدّ المُرسِل", async () => {
    await expect(notify(A)).resolves.toBeTruthy();
  });

  it("تعديل البيانات المتلاحق يعيد الإشعار إلى الطابور كما يعيده إلى الجرس (م٦)", async () => {
    const profile = (await db.query<{ id: string }>(`select id from public.profiles where user_id = $1`, [A])).rows[0]!.id;
    // تعديلان من غير صاحبه (B) خلال عشر دقائق: الثاني يدمج في الأول ويعيد إشعاره.
    const edit = (before: string, after: string) =>
      db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: B, role: "authenticated" })]).then(() =>
        db.query(`select public.fn_audit_field_change('profile_changed', 'profiles', $1, $2, $3, $4, '{}', '{}')`, [
          profile,
          A,
          { phone: before },
          { phone: after },
        ]),
      );
    const note = async () =>
      (
        await db.query<{ pushed_at: string | null; read_at: string | null }>(
          `select pushed_at, read_at from public.notifications where recipient_id = $1 and kind = 'profile_corrected'`,
          [A],
        )
      ).rows;
    try {
      await edit("1", "2");
      expect((await note()).length).toBe(1);
      await claim();
      await db.query(`update public.notifications set status = 'read', read_at = now() where recipient_id = $1 and kind = 'profile_corrected'`, [A]);
      expect((await note())[0]!.pushed_at).not.toBeNull();

      await edit("2", "3");
      const [after] = await note();
      expect(after!.pushed_at).toBeNull();
      expect(after!.read_at).toBeNull();
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
      await db.query(`delete from public.audit_log where entity_id = $1 and action = 'profile_changed'`, [profile]);
    }
  });
});
