import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * الرصد والعدّاد والتسوية — الهجرة ٠٦٥ (`adr/0036` · `0037` · `0041`).
 *
 * الوقت يُحاكى بالنظائر ذات الوقت الصريح (`_at`) — لا تُمنح لأحد، والاختبار
 * يستدعيها مالكاً. خطةٌ من خمسة أيام تبدأ الأحد ١ نوفمبر ٢٠٢٦، والجمعة ليست
 * من أيام البرنامج، ووقت نهاية الرصد الافتراضي ١١ مساءً. وفي كل يومٍ حقلٌ
 * اختياري («تلاوة») لا يحبس الإتمام.
 *
 * ومعه إصلاحات المراجعة (الهجرة ٠٦٦): الاختياري يُكمَل في اليوم المتمّ للتوّ،
 * ويومٌ رُصد إلزاميّه بلا إتمامٍ يُتمّ عند قراءة الحال، ويوم المشارك الأول
 * يومُ التحاقه إن جاء بعد البداية.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let roleId: string;
let hifz: string;
let rabt: string;
let tilawa: string;
let planId: string;
let participantId: string;

const ADMIN = "00000000-0000-4000-8000-000000000651";
const PLAYER = "00000000-0000-4000-8000-000000000652";
const OUTSIDER = "00000000-0000-4000-8000-000000000653";
const LATE = "00000000-0000-4000-8000-000000000654";
const EARLY = "00000000-0000-4000-8000-000000000655";
const NIGHT = "00000000-0000-4000-8000-000000000656";
const USERS = [ADMIN, PLAYER, OUTSIDER, LATE, EARLY, NIGHT];

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

async function id(sql: string, params: unknown[] = []): Promise<string> {
  return (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
}

type State = {
  state: string;
  current_day: number;
  done_days: number;
  completed_today: number;
  stumbled: number;
  carried: boolean;
};

const at = (date: string, time: string) => `${date}T${time}:00+03:00`;

const state = async (ts: string) =>
  (await db.query<{ s: State }>(`select public.fn_journey_state_at($1, $2::timestamptz) s`, [participantId, ts]))
    .rows[0]!.s;
const count = (day: number, field: string, ts: string, delta = 1) =>
  db.query(`select public.fn_count_repetition_at($1, $2, $3, $4, $5::timestamptz)`, [
    participantId,
    day,
    field,
    delta,
    ts,
  ]);
const countTo = async (day: number, field: string, ts: string, times: number) => {
  for (let i = 0; i < times; i++) await count(day, field, ts);
};
const mark = async (day: number, field: string, ts: string) =>
  (
    await db.query<{ s: State }>(`select public.fn_mark_field_at($1, $2, $3, $4::timestamptz) s`, [
      participantId,
      day,
      field,
      ts,
    ])
  ).rows[0]!.s;
const undo = async (day: number, field: string, ts: string) =>
  (
    await db.query<{ s: State }>(`select public.fn_undo_mark_at($1, $2, $3, $4::timestamptz) s`, [
      participantId,
      day,
      field,
      ts,
    ])
  ).rows[0]!.s;
const openNext = async (ts: string) =>
  (await db.query<{ s: State }>(`select public.fn_open_next_day_at($1, $2::timestamptz) s`, [participantId, ts]))
    .rows[0]!.s;
const settle = async (ts: string) =>
  (await db.query<{ n: number }>(`select public.fn_settle_commitment_at($1, $2::timestamptz) n`, [participantId, ts]))
    .rows[0]!.n;
const countTo2 = async (pid: string, day: number, date: string) => {
  for (let i = 0; i < 3; i++) {
    await db.query(`select public.fn_count_repetition_at($1, $2, $3, 1, $4::timestamptz)`, [pid, day, hifz, at(date, "23:29")]);
  }
};
const settle2 = (pid: string, ts: string) =>
  db.query(`select public.fn_settle_commitment_at($1, $2::timestamptz)`, [pid, ts]);
const archive = async () =>
  (
    await db.query<{ d: string; s: string; plan_day: number; completed_days: number[]; comp: boolean }>(
      `select calendar_date::text d, status::text s, plan_day, completed_days, compensated_at is not null comp
       from public.commitment_archive where participant_id = $1 order by calendar_date`,
      [participantId],
    )
  ).rows;

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `tracking-engine-${i}@test.local`],
    );
    await db.query(`insert into public.profiles (user_id, full_name, phone) values ($1, 'حساب الرصد', $2)`, [
      uid,
      `+96650006510${i}`,
    ]);
  }
  sectionId = await id(`insert into public.sections (name) values ('قسم الرصد') returning id`);
  programId = await id(
    `insert into public.programs (section_id, name, slug) values ($1, 'برنامج الرصد', 'tracking-engine-test') returning id`,
    [sectionId],
  );
  roleId = await id(`insert into public.roles (name) values ('دور الرصد') returning id`);
  for (const code of ["programs.read", "programs.write"]) {
    await db.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [roleId, code]);
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, roleId]);

  await asUser(ADMIN, () =>
    db.query(`select public.fn_set_material_sections($1, $2::jsonb)`, [
      programId,
      JSON.stringify([{ name: "الإيمان", count: 10 }]),
    ]),
  );
  trackId = await id(`insert into public.tracks (program_id, name) values ($1, 'الأول') returning id`, [programId]);
  await db.query(`insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 10)`, [
    trackId,
  ]);
  hifz = await id(
    `insert into public.task_fields (program_id, label, kind, is_base) values ($1, 'حفظ', 'ranged', true) returning id`,
    [programId],
  );
  rabt = await id(
    `insert into public.task_fields (program_id, label, kind, is_constrained) values ($1, 'ربط', 'explicit', true) returning id`,
    [programId],
  );
  tilawa = await id(
    `insert into public.task_fields (program_id, label, kind, is_required) values ($1, 'تلاوة', 'counted', false) returning id`,
    [programId],
  );
  planId = (
    await asUser(ADMIN, () => db.query<{ id: string }>(`select public.fn_create_plan($1, null, false) id`, [programId]))
  ).rows[0]!.id;

  // كل يوم: حديثٌ يُكرَّر ثلاثاً، وربطُ حديث الأمس.
  const values: object[] = [];
  for (let d = 1; d <= 5; d++) {
    values.push({ day: d, field_id: hifz, amount: 1, repetition: 3 });
    if (d > 1) values.push({ day: d, field_id: rabt, from: d - 1, to: d - 1 });
    values.push({ day: d, field_id: tilawa, value: 5 });
  }
  await asUser(ADMIN, () =>
    db.query(`select public.fn_save_plan($1, $2::jsonb, 'اختبار')`, [
      planId,
      JSON.stringify({ day_count: 5, values }),
    ]),
  );
  await asUser(ADMIN, () =>
    db.query(`select public.fn_set_engine_setting($1, null, 'start_date', '"2026-11-01"'::jsonb)`, [programId]),
  );
  // الحكم لا يسبق أول حفظٍ للخطة ولا الالتحاق (الهجرة ٠٦٨) — فيُثبَّتان قبل البداية،
  // ولا يتعلّق الاختبار بيوم تشغيله.
  await db.query(`update public.plan_versions set created_at = '2026-10-01T09:00:00+03' where plan_id = $1`, [planId]);

  participantId = await id(
    `insert into public.participants (user_id, program_id, track_id, status, joined_at)
     values ($1, $2, $3, 'registered', '2026-10-01T10:00:00+03') returning id`,
    [PLAYER, programId, trackId],
  );
});

afterAll(async () => {
  if (programId) {
    await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
    for (const table of ["commitment_archive", "field_marks", "field_counts", "day_openings", "day_completions"]) {
      await db.query(
        `delete from public.${table} where participant_id in (select id from public.participants where program_id = $1)`,
        [programId],
      );
    }
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    for (const table of ["plan_versions", "plan_values"]) {
      await db.query(
        `delete from public.${table} where plan_id in (select id from public.plans where program_id = $1)`,
        [programId],
      );
    }
    await db.query(`delete from public.plans where program_id = $1`, [programId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.track_content_ranges where track_id = $1`, [trackId]);
    await db.query(`delete from public.content_units where program_id = $1`, [programId]);
    await db.query(`delete from public.material_sections where program_id = $1`, [programId]);
    await db.query(`delete from public.deadline_history where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
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

describe("يوم الخطة والعدّاد", () => {
  it("قبل تاريخ البداية لم يبدأ", async () => {
    expect((await state(at("2026-10-30", "10:00"))).state).toBe("not_started");
    expect(await state(at("2026-11-01", "10:00"))).toMatchObject({ state: "tasks", current_day: 1 });
  });

  it("لا يُرصد ما له تكرار قبل بلوغ العدد", async () => {
    await expect(mark(1, hifz, at("2026-11-01", "10:01"))).rejects.toThrow(/أكمل التكرار أولاً: ٠ من ٣/);
  });

  it("العدّاد لا يتجاوز العدد المطلوب ولا ينزل تحت الصفر", async () => {
    await countTo(1, hifz, at("2026-11-01", "10:02"), 4);
    const read = async () =>
      (await db.query<{ count: number }>(`select count from public.field_counts where participant_id = $1`, [participantId]))
        .rows[0]!.count;
    expect(await read()).toBe(3);
    await count(1, hifz, at("2026-11-01", "10:02"), -1);
    expect(await read()).toBe(2);
    await count(1, hifz, at("2026-11-01", "10:02"));
  });

  it("إتمام كل إلزاميٍّ يُتمّ اليوم وينقل إلى التالي (BR-PLAN-01)", async () => {
    const s = await mark(1, hifz, at("2026-11-01", "10:03"));
    expect(s).toMatchObject({ state: "done_today", current_day: 2, done_days: 1 });
    const { rows } = await db.query<{ status: string }>(`select status from public.participants where id = $1`, [
      participantId,
    ]);
    expect(rows[0]!.status).toBe("memorizing");
  });

  it("**الاختياري يُكمَل في اليوم المتمّ للتوّ**، والتراجع عنه لا يُلغي الإتمام", async () => {
    expect(await mark(1, tilawa, at("2026-11-01", "10:04"))).toMatchObject({ state: "done_today", done_days: 1 });
    expect(await undo(1, tilawa, at("2026-11-01", "10:04"))).toMatchObject({ state: "done_today", done_days: 1 });
  });

  it("العدّاد يتجمّد بعد الرصد، واليوم التالي لا يُرصد قبل بدئه", async () => {
    await expect(count(1, hifz, at("2026-11-01", "10:04"), -1)).rejects.toThrow(/تراجع عن رصده/);
    await expect(mark(2, hifz, at("2026-11-01", "10:05"))).rejects.toThrow(/ابدأ واجب اليوم التالي/);
  });

  it("بدء اليوم التالي في حدود الحد اليومي", async () => {
    expect(await openNext(at("2026-11-01", "10:06"))).toMatchObject({ state: "tasks", current_day: 2 });
    await countTo(2, hifz, at("2026-11-01", "10:07"), 3);
    await mark(2, hifz, at("2026-11-01", "10:08"));
    const s = await mark(2, rabt, at("2026-11-01", "10:09"));
    expect(s).toMatchObject({ state: "limit", completed_today: 2 });
    await expect(openNext(at("2026-11-01", "10:10"))).rejects.toThrow(/الحد اليومي/);
  });
});

describe("التسوية والأرشيف (BR-PLAN-04)", () => {
  it("كل يومٍ انقضى وقت رصده يُحكم عليه: أتمّ، أو معفى برصيد التقدّم، أو متعثّر", async () => {
    await settle(at("2026-11-04", "01:00"));
    const a = await archive();
    expect(a).toHaveLength(3);
    expect(a[0]).toMatchObject({ s: "completed", completed_days: [1, 2] });
    expect(a[1]!.s).toBe("exempt");
    expect(a[2]).toMatchObject({ s: "stumbled", plan_day: 3 });
  });

  it("التسوية لا تُعيد ما كتبته", async () => {
    expect(await settle(at("2026-11-04", "01:00"))).toBe(0);
  });

  it("الواجب المتعثَّر عليه مرحَّل", async () => {
    expect(await state(at("2026-11-04", "09:00"))).toMatchObject({ carried: true, current_day: 3, stumbled: 1 });
  });

  it("**يومٌ رُصد كل إلزاميّه بلا إتمامٍ يُتمّ عند قراءة الحال** — فلا يعلق المشارك", async () => {
    await countTo(3, hifz, at("2026-11-04", "09:01"), 3);
    await mark(3, hifz, at("2026-11-04", "09:02"));
    await mark(3, rabt, at("2026-11-04", "09:03"));
    // ما يتركه رصدان متزامنان: الإلزامي كله مرصود، والإتمام غائب.
    await db.query(
      `delete from public.day_completions where participant_id = $1 and day_number = 3`,
      [participantId],
    );
    expect(await state(at("2026-11-04", "09:03"))).toMatchObject({ state: "done_today", done_days: 3 });
  });

  it("من عاد إلى موعده يُوسم تعثّره معوَّضاً ولا يُمحى", async () => {
    await openNext(at("2026-11-04", "09:04"));
    await countTo(4, hifz, at("2026-11-04", "09:05"), 3);
    await mark(4, hifz, at("2026-11-04", "09:06"));
    await mark(4, rabt, at("2026-11-04", "09:07"));
    await settle(at("2026-11-04", "23:30"));
    const a = await archive();
    expect(a[3]).toMatchObject({ s: "completed", completed_days: [3, 4] });
    expect(a[2]).toMatchObject({ s: "stumbled", comp: true });
  });

  it("نسبة الإنجاز في لحظةٍ مضت من سجلّ الإتمام بأوقاته", async () => {
    const { rows } = await db.query<{ done_days: number; percent: string; reach_sequence: number }>(
      `select * from public.fn_progress_at($1, $2::timestamptz)`,
      [participantId, at("2026-11-03", "12:00")],
    );
    expect(rows[0]).toMatchObject({ done_days: 2, reach_sequence: 2 });
    expect(Number(rows[0]!.percent)).toBe(20);
  });
});

describe("التراجع", () => {
  it("يُعيد فتح اليوم في يومه قبل وقت نهاية رصده", async () => {
    await countTo(5, hifz, at("2026-11-05", "10:00"), 3);
    await mark(5, hifz, at("2026-11-05", "10:01"));
    expect((await mark(5, rabt, at("2026-11-05", "10:02"))).state).toBe("finished");
    expect(await undo(5, rabt, at("2026-11-05", "10:03"))).toMatchObject({ state: "tasks", current_day: 5 });
  });

  it("ولا تراجع بعد وقت نهاية الرصد، ولا عن يومٍ رُصد في يومٍ سبق", async () => {
    await mark(5, rabt, at("2026-11-05", "22:00"));
    await expect(undo(5, rabt, at("2026-11-05", "23:30"))).rejects.toThrow(/قبل وقت نهاية رصده/);
    await expect(undo(4, rabt, at("2026-11-05", "10:00"))).rejects.toThrow(/في يوم الرصد/);
  });

  it("لا أرشيف للجمعة، وما بعد إتمام الخطة «معفى» — فلا يُحكم عليه إن طالت الخطة بعده", async () => {
    await settle(at("2026-11-08", "23:30"));
    const after = (await archive()).filter((r) => r.d > "2026-11-05");
    expect(after.map((r) => [r.d, r.s])).toEqual([
      ["2026-11-07", "exempt"],
      ["2026-11-08", "exempt"],
    ]);
  });
});

describe("يوم المشارك الأول", () => {
  const firstDay = async (uid: string, joinedAt: string) => {
    const pid = await id(
      `insert into public.participants (user_id, program_id, track_id, status, joined_at)
       values ($1, $2, $3, 'registered', $4) returning id`,
      [uid, programId, trackId, joinedAt],
    );
    const { rows } = await db.query<{ d: string }>(
      `select start_date::text d from public.fn_participant_engine($1)`,
      [pid],
    );
    return { pid, day: rows[0]!.d };
  };

  it("**من التحق بعد البداية يبدأ يومَ التحاقه** — ولا يُحكم عليه بما قبله", async () => {
    const { pid, day } = await firstDay(EARLY, at("2026-11-05", "20:00"));
    expect(day).toBe("2026-11-05");
    await settle2(pid, at("2026-11-06", "01:00"));
    const { rows } = await db.query<{ d: string }>(
      `select calendar_date::text d from public.commitment_archive where participant_id = $1 order by 1`,
      [pid],
    );
    expect(rows.map((r) => r.d)).toEqual(["2026-11-05"]);
  });

  it("**ومن التحق بعد وقت نهاية رصد يومٍ فيومه الأول ما بعده**", async () => {
    expect((await firstDay(LATE, at("2026-11-05", "23:30"))).day).toBe("2026-11-06");
  });
});

describe("نافذة اليوم ولحظة البدء (الهجرة ٠٦٨)", () => {
  it("**ما أُتمّ بعد وقت الرصد يُحسب لليوم التالي** — لا يضيع بين يومين", async () => {
    const pid = await id(
      `insert into public.participants (user_id, program_id, track_id, status, joined_at)
       values ($1, $2, $3, 'registered', '2026-10-01T10:00:00+03') returning id`,
      [NIGHT, programId, trackId],
    );
    const at11 = async (day: number, date: string) => {
      await countTo2(pid, day, date);
      await db.query(`select public.fn_mark_field_at($1, $2, $3, $4::timestamptz)`, [pid, day, hifz, at(date, "23:30")]);
      if (day > 1) {
        await db.query(`select public.fn_mark_field_at($1, $2, $3, $4::timestamptz)`, [pid, day, rabt, at(date, "23:30")]);
      }
    };
    await at11(1, "2026-11-01");
    await at11(2, "2026-11-02");
    await settle2(pid, at("2026-11-03", "23:30"));
    const { rows } = await db.query<{ s: string; completed_days: number[] }>(
      `select status::text s, completed_days from public.commitment_archive where participant_id = $1 order by calendar_date`,
      [pid],
    );
    expect(rows.map((r) => [r.s, r.completed_days])).toEqual([
      ["stumbled", []],
      ["completed", [1]],
      ["completed", [2]],
    ]);
  });

  it("**لحظة البدء يضبطها مشغّلها وحده**", async () => {
    const before = await db.query<{ j: string }>(`select judge_from::text j from public.participants where id = $1`, [
      participantId,
    ]);
    await db.query(`update public.participants set judge_from = '2020-01-01' where id = $1`, [participantId]);
    const after = await db.query<{ j: string }>(`select judge_from::text j from public.participants where id = $1`, [
      participantId,
    ]);
    expect(after.rows[0]!.j).toBe(before.rows[0]!.j);
  });
});

describe("الصلاحيات", () => {
  it("صاحب المشاركة يقرأ حاله، وغيره لا", async () => {
    const own = await asUser(PLAYER, () =>
      db.query<{ s: { state: string } }>(`select public.fn_journey_state($1) s`, [participantId]),
    );
    expect(typeof own.rows[0]!.s.state).toBe("string");
    await expect(
      asUser(OUTSIDER, () => db.query(`select public.fn_journey_state($1)`, [participantId])),
    ).rejects.toThrow(/لا صلاحية/);
    await expect(
      asUser(OUTSIDER, () => db.query(`select public.fn_mark_field($1, 1, $2)`, [participantId, hifz])),
    ).rejects.toThrow(/لا صلاحية/);
  });

  it("النظائر ذات الوقت الصريح لا تُمنح لأحد", async () => {
    await expect(
      asUser(PLAYER, () => db.query(`select public.fn_mark_field_at($1, 1, $2, now())`, [participantId, hifz])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(PLAYER, () => db.query(`select public.fn_settle_commitment_at($1, now())`, [participantId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("العدّاد يزيد واحداً أو ينقص واحداً", async () => {
    await expect(
      asUser(PLAYER, () => db.query(`select public.fn_count_repetition($1, 1, $2, 5)`, [participantId, hifz])),
    ).rejects.toThrow(/واحداً/);
  });
});
