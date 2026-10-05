import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * قبول تغيير المسار — الهجرة ٠٣٩ · `adr/0027`.
 *
 * **القرار:** مادة المسار الجديد من يومها الأول، وسجلّه في السابق باقٍ ظاهر.
 * والقرار كله في `fn_decide_track_change`، ولا طريق مباشر حولها.
 *
 * التركيبة: مادة ستّون وحدة. المسار «أ» مقطعه [١..٣٠]، و«ب» [٣١..٦٠]، و«ج» سعته
 * واحد ومشغول، و«د» مؤرشَف. **خطةٌ افتراضية واحدة** يرثها «أ» و«ب»: عشرة أيام
 * بحقل حفظ تراكمي (٢) — فالمنتقل بينهما يبقى على الخطة نفسها بمسارٍ آخر
 * (الهجرة ٠٦٦). المشارك أتمّ ثلاثة أيام في «أ» أمس ثم يُنقل.
 *
 * كل فعلٍ بهوية صاحبه وبدور `authenticated` — فالحرّاس والسياسات تعمل كما تعمل
 * على طلبٍ حقيقي، لا كما تعمل لمالك القاعدة.
 */

let db: Client;
let sectionId: string;
let otherSectionId: string;
let programId: string;
let otherProgramId: string;
let roleId: string;
let fieldHifz: string;
let planId: string;
const track: Record<"A" | "B" | "C" | "D", string> = { A: "", B: "", C: "", D: "" };

const PLAYER = "00000000-0000-4000-8000-000000000c01";
const ADMIN = "00000000-0000-4000-8000-000000000c02";
const STRANGER = "00000000-0000-4000-8000-000000000c03";
const OTHER = "00000000-0000-4000-8000-000000000c04";
const ENDED = "00000000-0000-4000-8000-000000000c05";
const GONE = "00000000-0000-4000-8000-000000000c06";
const ORPHAN = "00000000-0000-4000-8000-000000000c07";
const USERS = [PLAYER, ADMIN, STRANGER, OTHER, ENDED, GONE, ORPHAN];

const participant: Record<"PLAYER" | "ENDED" | "GONE" | "ORPHAN", string> = {
  PLAYER: "",
  ENDED: "",
  GONE: "",
  ORPHAN: "",
};

/** معاملة بهوية مستخدم ودور `authenticated`. تُثبَّت إن نجحت، وتُلغى إن فشلت. */
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

async function decide(uid: string, requestId: string, decision: string, program = programId) {
  return asUser(uid, () =>
    db.query(`select public.fn_decide_track_change($1, $2, $3)`, [requestId, program, decision]),
  );
}

/** طلبٌ معلَّق يُدرَج بمالك القاعدة — لحالاتٍ تمنع السياسة إنشاءها عمداً. */
async function pendingRequest(participantId: string, from: string, to: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.track_change_requests
       (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage)
     values ($1, $2, $3, 'up', 'سبب الاختبار', 40) returning id`,
    [participantId, from, to],
  );
  return rows[0]!.id;
}

async function stateOf(participantId: string) {
  const { rows } = await db.query<{ track_id: string | null; baseline: string | null }>(
    `select track_id, baseline_percentage as baseline from public.participants where id = $1`,
    [participantId],
  );
  return rows[0]!;
}

async function statusOfRequest(requestId: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>(
    `select status from public.track_change_requests where id = $1`,
    [requestId],
  );
  return rows[0]!.status;
}

/**
 * القبول يكتب لحظة البدء (`judge_from`)، ويومه الأول في المسار الجديد يومُ القبول —
 * إلا بعد وقت نهاية الرصد فما بعده (الهجرتان ٠٦٦ و٠٦٨). تُرجَع يوماً لئلا يتعلّق
 * الاختبار بساعة تشغيله — ومشغّلها لا يقبل كتابةً مباشرة، فتُكتب بتعطيله للمعاملة.
 */
async function backdate(requestId: string): Promise<void> {
  await db.query(
    `update public.track_change_requests set decided_at = decided_at - interval '1 day' where id = $1`,
    [requestId],
  );
  await db.query("begin");
  await db.query("set local session_replication_role = 'replica'");
  await db.query(`update public.participants set judge_from = judge_from - interval '1 day' where id = $1`, [
    participant.PLAYER,
  ]);
  await db.query("commit");
}

type Task = { day_number: number; ord_from: number | null; ord_to: number | null };

async function firstTask(uid: string, participantId: string): Promise<Task | undefined> {
  return asUser(uid, async () => {
    const { rows } = await db.query<Task>(
      `select day_number, ord_from, ord_to from public.fn_day_tasks($1)`,
      [participantId],
    );
    return rows[0];
  });
}

async function mark(uid: string, participantId: string, day: number): Promise<{ done_days: number }> {
  return asUser(uid, async () => {
    const { rows } = await db.query<{ s: { done_days: number } }>(
      `select public.fn_mark_field($1, $2, $3) as s`,
      [participantId, day, fieldHifz],
    );
    return rows[0]!.s;
  });
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  sectionId = (await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار تغيير المسار') returning id`,
  )).rows[0]!.id;
  programId = (await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج النقل', 'track-change-test') returning id`,
    [sectionId],
  )).rows[0]!.id;
  otherSectionId = (await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار تغيير المسار الآخر') returning id`,
  )).rows[0]!.id;
  otherProgramId = (await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج آخر', 'track-change-other') returning id`,
    [otherSectionId],
  )).rows[0]!.id;

  const tracks = await db.query<{ id: string; name: string }>(
    `insert into public.tracks (program_id, name, capacity, sort_order) values
       ($1, 'أ', null, 0), ($1, 'ب', null, 1), ($1, 'ج', 1, 2), ($1, 'د', null, 3)
     returning id, name`,
    [programId],
  );
  track.A = tracks.rows.find((t) => t.name === "أ")!.id;
  track.B = tracks.rows.find((t) => t.name === "ب")!.id;
  track.C = tracks.rows.find((t) => t.name === "ج")!.id;
  track.D = tracks.rows.find((t) => t.name === "د")!.id;

  await db.query(
    `insert into public.content_units (program_id, sequence, label)
     select $1, g, 'وحدة ' || g from generate_series(1, 60) as g`,
    [programId],
  );
  await db.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
     values ($1, 1, 30, 0), ($2, 31, 60, 0)`,
    [track.A, track.B],
  );

  fieldHifz = (await db.query<{ id: string }>(
    `insert into public.task_fields (program_id, label, kind, sort_order, is_base)
     values ($1, 'حفظ', 'ranged', 0, true) returning id`,
    [programId],
  )).rows[0]!.id;
  // الخطة قائمةٌ قبل الالتحاق: الحكم لا يسبق أول حفظٍ لها (الهجرة ٠٦٨).
  planId = (await db.query<{ id: string }>(
    `insert into public.plans (program_id, name, day_count, created_at)
     values ($1, 'الخطة الافتراضية', 10, now() - interval '3 days') returning id`,
    [programId],
  )).rows[0]!.id;
  await db.query(
    `insert into public.plan_values (plan_id, day_number, task_field_id, amount)
     select $1, g, $2, 2 from generate_series(1, 10) as g`,
    [planId, fieldHifz],
  );

  // «د» مؤرشَف بعد بنائه.
  await db.query(`update public.tracks set deleted_at = now() where id = $1`, [track.D]);

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `track-change-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'مستخدم النقل', $2)`,
      [uid, `+96650000010${i}`],
    );
  }

  const parts = await db.query<{ id: string; user_id: string }>(
    `insert into public.participants (user_id, program_id, track_id, status) values
       ($1, $6, $7,  'registered'),
       ($2, $6, $8,  'registered'),
       ($3, $6, $9,  'not_qualified'),
       ($4, $6, $7,  'registered'),
       ($5, $6, null, 'registered')
     returning id, user_id`,
    [PLAYER, OTHER, ENDED, GONE, ORPHAN, programId, track.A, track.C, track.B],
  );
  participant.PLAYER = parts.rows.find((p) => p.user_id === PLAYER)!.id;
  participant.ENDED = parts.rows.find((p) => p.user_id === ENDED)!.id;
  participant.GONE = parts.rows.find((p) => p.user_id === GONE)!.id;
  participant.ORPHAN = parts.rows.find((p) => p.user_id === ORPHAN)!.id;
  await db.query(`update public.participants set deleted_at = now() where id = $1`, [participant.GONE]);

  roleId = (await db.query<{ id: string }>(
    `insert into public.roles (name) values ('دور اختبار النقل') returning id`,
  )).rows[0]!.id;
  await db.query(
    `insert into public.role_permissions (role_id, permission_code) values
       ($1, 'participants.read'), ($1, 'participants.write'), ($1, 'programs.read'), ($1, 'programs.write')`,
    [roleId],
  );
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);

  // ثلاثة أيام في «أ» أُتمّت أمس — قبل النقل.
  await db.query(
    `insert into public.field_marks (participant_id, plan_id, track_id, day_number, task_field_id, marked_at)
     select $1, $2, $3, g, $4, now() - interval '1 day' from generate_series(1, 3) g`,
    [participant.PLAYER, planId, track.A, fieldHifz],
  );
  await db.query(
    `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
     select $1, $2, $3, g, now() - interval '1 day' from generate_series(1, 3) g`,
    [participant.PLAYER, planId, track.A],
  );
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  if (programId) {
    for (const table of ["commitment_archive", "field_marks", "field_counts", "day_openings", "day_completions"]) {
      await db.query(
        `delete from public.${table} where participant_id in (select id from public.participants where program_id = $1)`,
        [programId],
      );
    }
    await db.query(
      `delete from public.track_change_requests where participant_id in (select id from public.participants where program_id = $1)`,
      [programId],
    );
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    await db.query(`delete from public.plan_values where plan_id = $1`, [planId]);
    await db.query(`delete from public.plans where id = $1`, [planId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.track_content_ranges where track_id = any($1::uuid[])`, [
      Object.values(track),
    ]);
    await db.query(`delete from public.content_units where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = any($1::uuid[])`, [[programId, otherProgramId]]);
    await db.query(`delete from public.sections where id = any($1::uuid[])`, [[sectionId, otherSectionId]]);
  }
  if (roleId) {
    await db.query(`delete from public.user_roles where role_id = $1`, [roleId]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [roleId]);
    await db.query(`delete from public.roles where id = $1`, [roleId]);
  }
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("لا طريق حول الطلب", () => {
  it("**تغيير المسار مباشرة يُرفض** ولو ممّن يملك الكتابة", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(`update public.participants set track_id = $1 where id = $2`, [track.B, participant.PLAYER]),
      ),
    ).rejects.toThrow(/يمرّ بقبول طلب تغييره/);
    expect((await stateOf(participant.PLAYER)).track_id).toBe(track.A);
  });

  it("وتقدير المستوى مباشرة يُرفض", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(`update public.participants set baseline_percentage = 90 where id = $1`, [participant.PLAYER]),
      ),
    ).rejects.toThrow(/يمرّ بقبول طلب تغييره/);
  });

  it("**وإسناد مسارٍ لمن لا مسار له يبقى متاحاً** — ليس تغييراً", async () => {
    await asUser(ADMIN, () =>
      db.query(`update public.participants set track_id = $1 where id = $2`, [track.B, participant.ORPHAN]),
    );
    expect((await stateOf(participant.ORPHAN)).track_id).toBe(track.B);
  });

  it("طلبٌ يُدرَج «مقبولاً» من أوّله يُرفض", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(
          `insert into public.track_change_requests
             (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage, status)
           values ($1, $2, $3, 'up', 'سبب', 40, 'approved')`,
          [participant.PLAYER, track.A, track.B],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("وطلبٌ من غير مسار المشارك الحالي يُرفض", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(
          `insert into public.track_change_requests
             (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage)
           values ($1, $2, $3, 'up', 'سبب', 40)`,
          [participant.PLAYER, track.B, track.A],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("**طلب معلَّق واحد لكل مشارك**، والطلب لا يُحدَّث مباشرة", async () => {
    const id = await asUser(ADMIN, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.track_change_requests
           (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage)
         values ($1, $2, $3, 'up', 'سبب', 40) returning id`,
        [participant.PLAYER, track.A, track.C],
      );
      return rows[0]!.id;
    });

    await expect(
      asUser(ADMIN, () =>
        db.query(
          `insert into public.track_change_requests
             (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage)
           values ($1, $2, $3, 'up', 'سبب', 40)`,
          [participant.PLAYER, track.A, track.B],
        ),
      ),
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      asUser(ADMIN, () =>
        db.query(`update public.track_change_requests set status = 'approved' where id = $1`, [id]),
      ),
    ).rejects.toThrow(/permission denied/);
    expect(await statusOfRequest(id)).toBe("pending");
  });
});

describe("الرفض بلا أثر", () => {
  let fullRequest: string;

  beforeAll(async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.track_change_requests where participant_id = $1 and status = 'pending'`,
      [participant.PLAYER],
    );
    fullRequest = rows[0]!.id; // أ ← ج (مكتمل العدد)
  });

  it("من لا صلاحية له لا يعرف أن الطلب موجود", async () => {
    await expect(decide(STRANGER, fullRequest, "approved")).rejects.toThrow(/الطلب غير موجود/);
  });

  it("وبرنامجٌ آخر في الطلب كذلك", async () => {
    await expect(decide(ADMIN, fullRequest, "approved", otherProgramId)).rejects.toThrow(/الطلب غير موجود/);
  });

  it("والقرار «معلَّق» ليس قراراً", async () => {
    await expect(decide(ADMIN, fullRequest, "pending")).rejects.toThrow(/قرار غير صالح/);
  });

  it("**المسار المكتمل العدد لا يُنقل إليه** — والمشارك والطلب كما هما", async () => {
    await expect(decide(ADMIN, fullRequest, "approved")).rejects.toThrow(/اكتمل العدد في هذا المسار/);
    expect((await stateOf(participant.PLAYER)).track_id).toBe(track.A);
    expect(await statusOfRequest(fullRequest)).toBe("pending");
  });

  it("**الرفض يعمل**، والمبتوت لا يُبتّ ثانية", async () => {
    await decide(ADMIN, fullRequest, "rejected");
    expect(await statusOfRequest(fullRequest)).toBe("rejected");
    await expect(decide(ADMIN, fullRequest, "approved")).rejects.toThrow(/مبتوت فيه سلفاً/);

    const audit = await db.query(
      `select 1 from public.audit_log where entity_id = $1 and action = 'track_change_rejected'`,
      [fullRequest],
    );
    expect(audit.rowCount).toBe(1);
  });

  it("المسار المؤرشَف لا يُنقل إليه", async () => {
    const id = await pendingRequest(participant.PLAYER, track.A, track.D);
    await expect(decide(ADMIN, id, "approved")).rejects.toThrow(/المسار المطلوب غير متاح/);
    await decide(ADMIN, id, "rejected");
  });

  it("**الطلب المتقادم يُرفض** — تغيّر مساره بعد الطلب", async () => {
    const id = await pendingRequest(participant.ORPHAN, track.A, track.B); // مساره اليوم «ب» لا «أ»
    await expect(decide(ADMIN, id, "approved")).rejects.toThrow(/تغيّر مسار المشارك بعد الطلب/);
    await decide(ADMIN, id, "rejected");
  });

  it("ومن انتهت رحلته لا يُنقل", async () => {
    const id = await pendingRequest(participant.ENDED, track.B, track.A);
    await expect(decide(ADMIN, id, "approved")).rejects.toThrow(/انتهت رحلة المشارك/);
    await decide(ADMIN, id, "rejected");
  });

  it("ومن خرج من البرنامج لا يُنقل", async () => {
    const id = await pendingRequest(participant.GONE, track.A, track.B);
    await expect(decide(ADMIN, id, "approved")).rejects.toThrow(/لم يعد في البرنامج/);
    await decide(ADMIN, id, "rejected");
  });
});

describe("القبول — المادة من أولها والسجلّ باقٍ", () => {
  let request: string;

  beforeAll(async () => {
    request = await pendingRequest(participant.PLAYER, track.A, track.B);
  });

  it("**ينقل المشارك ويبتّ الطلب ويكتب التدقيق** في فعلٍ واحد", async () => {
    await decide(ADMIN, request, "approved");

    const state = await stateOf(participant.PLAYER);
    expect(state.track_id).toBe(track.B);
    expect(Number(state.baseline)).toBe(40);

    const { rows } = await db.query<{ status: string; decided_by: string }>(
      `select status, decided_by from public.track_change_requests where id = $1`,
      [request],
    );
    expect(rows[0]).toMatchObject({ status: "approved", decided_by: ADMIN });

    const audit = await db.query<{ after: { track_id: string; record_days: number } }>(
      `select after from public.audit_log where entity_id = $1 and action = 'track_change_approved'`,
      [request],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]!.after).toMatchObject({ track_id: track.B, record_days: 3 });
  });

  it("**يومه الأول في «ب» من الرتبة ١ وبوحدات «ب»** — لا يُحمَل تقدّمه في «أ»", async () => {
    await backdate(request);
    expect(await firstTask(PLAYER, participant.PLAYER)).toMatchObject({ day_number: 1, ord_from: 1, ord_to: 2 });
    const { rows } = await db.query<{ unit: number }>(`select public.fn_track_unit_at($1, 1) as unit`, [track.B]);
    expect(rows[0]!.unit).toBe(31);
  });

  it("**ويُتمّ يومه الأول في «ب» على الخطة نفسها** — وإتمامه الأول في «أ» لا يصطدم به", async () => {
    expect((await mark(PLAYER, participant.PLAYER, 1)).done_days).toBe(1);
    // ويوم «أ» الرابع لا يُرصد: مساره «ب».
    await expect(mark(PLAYER, participant.PLAYER, 4)).rejects.toThrow();
  });

  it("**الإدارة ترى الحالي ومعه ما سبق**", async () => {
    const { rows } = await asUser(ADMIN, () =>
      db.query<{ id: string; done_days: number; day_count: number; prior_done_days: number }>(
        `select * from public.fn_program_participants($1)`,
        [programId],
      ),
    );
    expect(rows.find((r) => r.id === participant.PLAYER)).toMatchObject({
      day_count: 10,
      done_days: 1,
      prior_done_days: 3,
    });
  });

  it("**والمشارك يرى سجلّه في المسارين**، والغريب لا يرى شيئاً", async () => {
    const mine = await asUser(PLAYER, () =>
      db.query<{ track_id: string; is_current: boolean; done_days: number }>(
        `select track_id, is_current, done_days from public.fn_participant_record($1)`,
        [participant.PLAYER],
      ),
    );
    expect(mine.rows).toEqual([
      { track_id: track.A, is_current: false, done_days: 3 },
      { track_id: track.B, is_current: true, done_days: 1 },
    ]);

    const stranger = await asUser(STRANGER, () =>
      db.query(`select * from public.fn_participant_record($1)`, [participant.PLAYER]),
    );
    expect(stranger.rowCount).toBe(0);
  });
});

describe("السجلّ محروس بعد النقل", () => {
  it("**مقاطع «أ» تبقى مجمّدة** ولو غادره كل من أنجز فيه", async () => {
    await expect(
      asUser(ADMIN, () =>
        db.query(`update public.track_content_ranges set to_sequence = 29 where track_id = $1`, [track.A]),
      ),
    ).rejects.toThrow(/مقاطعه لا تُعدَّل/);
  });

  it("والخطة التي أُتمّت أيامها لا تُحذف ولا تُنقل", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`update public.plans set deleted_at = now() where id = $1`, [planId])),
    ).rejects.toThrow(/فلا تُحذف/);
    await expect(
      asUser(ADMIN, () => db.query(`update public.plans set track_id = $1 where id = $2`, [track.C, planId])),
    ).rejects.toThrow(/لا تنتقل الخطة/);
  });

  it("**و«أ» لا يُؤرشَف** — برسالة السجلّ لا برسالة المشاركين", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_archive_track($1)`, [track.A])),
    ).rejects.toThrow(/للمسار سجلّ رصد محفوظ/);
  });
});

describe("العودة إلى مسارٍ سابق تُكمل", () => {
  it("**أ ← ب ← أ: يعود إلى يومه الرابع ورتبته السابعة** لا إلى أول «أ»", async () => {
    const back = await pendingRequest(participant.PLAYER, track.B, track.A);
    await decide(ADMIN, back, "approved");
    await backdate(back);
    expect((await stateOf(participant.PLAYER)).track_id).toBe(track.A);

    // ثلاثة أيام × وحدتان = الرتب ١..٦، فالتالية ٧.
    expect(await firstTask(PLAYER, participant.PLAYER)).toMatchObject({ day_number: 4, ord_from: 7, ord_to: 8 });
    // ويحمل أيامه الثلاثة إلى موعده: لا يبدو متقدّماً بها.
    const { rows } = await db.query<{ base_done: number }>(
      `select base_done from public.fn_participant_engine($1)`,
      [participant.PLAYER],
    );
    expect(rows[0]!.base_done).toBe(3);
    expect((await mark(PLAYER, participant.PLAYER, 4)).done_days).toBe(4);
  });
});
