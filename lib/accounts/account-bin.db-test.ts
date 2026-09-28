import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * سلّة المحذوفات والمحو النهائي — الهجرتان ٠٤٨ و٠٤٩ · `adr/0034`.
 *
 * **أول اختبارٍ في المنصة لا رجعة فيه.** ولأن `pnpm test:db` يعمل على القاعدة
 * الحيّة، فالدالة تأخذ معرّفاً واحداً لا تمسح بالجملة، ويتحقّق الاختبار قبل
 * المحو أن الحساب من حساباته هو.
 *
 * وما يُفحَص جوهراً: أن المحو **يُبقي ما وعد به الراعي** — أيام الإنجاز بلا
 * صاحبها، والسجلّ بأفعاله واسمُه مطموس.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let templateId: string;
let fieldId: string;
let planId: string;
let questionId: string;
let targetParticipant: string;
let otherParticipant: string;
let roleId: string;
let requestId: string;

const TARGET = "00000000-0000-4000-8000-000000000e31";
const OTHER = "00000000-0000-4000-8000-000000000e32";
const ADMIN = "00000000-0000-4000-8000-000000000e33";
const PLAIN = "00000000-0000-4000-8000-000000000e34";
const USERS = [TARGET, OTHER, ADMIN, PLAIN];

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

async function profileOf(uid: string): Promise<{ deleted: boolean; purge: boolean } | null> {
  const { rows } = await db.query<{ deleted_at: string | null; purge_after: string | null }>(
    `select deleted_at, purge_after from public.profiles where user_id = $1`,
    [uid],
  );
  const row = rows[0];
  return row ? { deleted: row.deleted_at !== null, purge: row.purge_after !== null } : null;
}

async function liveParticipants(): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*) as n from public.participants where program_id = $1 and deleted_at is null`,
    [programId],
  );
  return Number(rows[0]!.n);
}

/** تقديم الموعد إلى الماضي — كمرور المدّة، بلا انتظار ثلاثين يوماً. */
async function ageOutOfBin(uid: string): Promise<void> {
  await db.query(
    `update public.profiles set purge_after = now() - interval '1 day' where user_id = $1`,
    [uid],
  );
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `bin-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, $2, $3)`,
      [uid, `حساب السلّة ${i}`, `+96650000060${i}`],
    );
  }

  sectionId = (
    await db.query<{ id: string }>(
      `insert into public.sections (name) values ('قسم سلّة المحذوفات') returning id`,
    )
  ).rows[0]!.id;
  programId = (
    await db.query<{ id: string }>(
      `insert into public.programs (section_id, name, slug, capacity)
       values ($1, 'برنامج السلّة', 'account-bin-test', 2) returning id`,
      [sectionId],
    )
  ).rows[0]!.id;
  trackId = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'مسار السلّة') returning id`,
      [programId],
    )
  ).rows[0]!.id;

  fieldId = (
    await db.query<{ id: string }>(
      `insert into public.task_fields (program_id, label, kind, sort_order)
       values ($1, 'حفظ', 'counted', 0) returning id`,
      [programId],
    )
  ).rows[0]!.id;
  templateId = (
    await db.query<{ id: string }>(
      `insert into public.day_templates (program_id, name) values ($1, 'يوم') returning id`,
      [programId],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.day_template_fields (day_template_id, task_field_id, base_amount, sort_order)
     values ($1, $2, 2, 0)`,
    [templateId, fieldId],
  );
  planId = (
    await db.query<{ id: string }>(
      `insert into public.plans (track_id, name) values ($1, 'خطة السلّة') returning id`,
      [trackId],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
     select $1, g, 'normal', $2 from generate_series(1, 3) as g`,
    [planId, templateId],
  );

  questionId = (
    await db.query<{ id: string }>(
      `insert into public.admission_questions (program_id, question, sort_order)
       values ($1, 'لماذا تشارك؟', 0) returning id`,
      [programId],
    )
  ).rows[0]!.id;

  targetParticipant = (
    await db.query<{ id: string }>(
      `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3) returning id`,
      [TARGET, programId, trackId],
    )
  ).rows[0]!.id;
  otherParticipant = (
    await db.query<{ id: string }>(
      `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3) returning id`,
      [OTHER, programId, trackId],
    )
  ).rows[0]!.id;

  await db.query(
    `insert into public.admission_answers (participant_id, question_id, answer)
     values ($1, $2, 'جوابٌ شخصيّ يُمحى')`,
    [targetParticipant, questionId],
  );

  const dayOne = (
    await db.query<{ id: string }>(
      `select id from public.plan_days where plan_id = $1 and day_number = 1`,
      [planId],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.achievements (participant_id, plan_day_id, task_field_id, is_done, amount)
     values ($1, $2, $3, true, 2)`,
    [targetParticipant, dayOne, fieldId],
  );

  // طلبٌ لغير المحذوف، بتّ فيه المحذوف — فقراره يبقى واسمه يُثبَّت.
  const secondTrack = (
    await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'مسار ثانٍ') returning id`,
      [programId],
    )
  ).rows[0]!.id;
  requestId = (
    await db.query<{ id: string }>(
      `insert into public.track_change_requests
         (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage,
          status, decided_by, decided_at)
       values ($1, $2, $3, 'up', 'سببٌ مكتوب', 40, 'rejected', $4, now()) returning id`,
      [otherParticipant, trackId, secondTrack, TARGET],
    )
  ).rows[0]!.id;

  // وطلبٌ للمحذوف نفسه: سببُه بخطّه، فيُطمس والقرار يبقى.
  await db.query(
    `insert into public.track_change_requests
       (participant_id, from_track_id, to_track_id, direction, reason, baseline_percentage, status)
     values ($1, $2, $3, 'down', 'سببٌ كتبه صاحبه عن نفسه', 30, 'rejected')`,
    [targetParticipant, trackId, secondTrack],
  );

  // فعلٌ في السجلّ باسم المحذوف — التسجيل يكتبه فعلاً، ويُصطنع هنا مباشرةً.
  await db.query(
    `insert into public.audit_log (actor_id, actor_label, action, entity_table, entity_id)
     values ($1, 'حساب السلّة 0', 'participant_registered', 'participants', $2)`,
    [TARGET, targetParticipant],
  );

  roleId = (
    await db.query<{ id: string }>(
      `insert into public.roles (name) values ('دور سلّة المحذوفات') returning id`,
    )
  ).rows[0]!.id;
  for (const code of ["users.read", "users.write"]) {
    await db.query(
      `insert into public.role_permissions (role_id, permission_code) values ($1, $2)`,
      [roleId, code],
    );
  }
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    ADMIN,
    roleId,
  ]);
});

afterAll(async () => {
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  if (programId) {
    await db.query(
      `delete from public.track_change_requests where participant_id in
         (select id from public.participants where program_id = $1)`,
      [programId],
    );
    await db.query(
      `delete from public.achievements where participant_id in
         (select id from public.participants where program_id = $1)`,
      [programId],
    );
    await db.query(
      `delete from public.admission_answers where participant_id in
         (select id from public.participants where program_id = $1)`,
      [programId],
    );
    await db.query(`delete from public.admission_questions where program_id = $1`, [programId]);
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    await db.query(`delete from public.plan_days where plan_id = $1`, [planId]);
    await db.query(`delete from public.plans where id = $1`, [planId]);
    await db.query(`delete from public.day_template_fields where day_template_id = $1`, [
      templateId,
    ]);
    await db.query(`delete from public.day_templates where id = $1`, [templateId]);
    await db.query(`delete from public.task_fields where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  if (roleId) {
    await db.query(`delete from public.user_roles where role_id = $1`, [roleId]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [roleId]);
    await db.query(`delete from public.roles where id = $1`, [roleId]);
  }
  await db.query(`delete from public.attachments where owner_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db?.end();
});

describe("الحذف إلى السلّة", () => {
  it("**من لا يملك تعديل المستخدمين لا يحذف أحداً**", async () => {
    await expect(
      asUser(PLAIN, () => db.query(`select public.fn_delete_account($1)`, [TARGET])),
    ).rejects.toThrow(/لا صلاحية لحذف الحسابات/);
  });

  it("ولا يحذف الإداريُّ نفسه — له «أغلق حسابي»", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_delete_account($1)`, [ADMIN])),
    ).rejects.toThrow(/لا تحذف حسابك بنفسك/);
  });

  it("**ولا يُحذف حسابٌ دورُه قائم** — يُسحب أولاً", async () => {
    await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
      TARGET,
      roleId,
    ]);
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_delete_account($1)`, [TARGET])),
    ).rejects.toThrow(/اسحب أدواره أولاً/);
    await db.query(`update public.user_roles set deleted_at = now() where user_id = $1`, [TARGET]);
  });

  it("**والحذف يُدخله السلّة، ومقعده يتحرّر يومه لا يوم محوه**", async () => {
    expect(await liveParticipants()).toBe(2);

    await asUser(ADMIN, () => db.query(`select public.fn_delete_account($1)`, [TARGET]));

    expect(await profileOf(TARGET)).toEqual({ deleted: true, purge: true });
    // السعة مقعدان، وقد تحرّر أحدهما فوراً.
    expect(await liveParticipants()).toBe(1);
  });

  it("والسلّة يراها من يقرأ المستخدمين وحده", async () => {
    const seen = await asUser(ADMIN, () =>
      db.query<{ user_id: string; is_staff: boolean }>(
        `select user_id, is_staff from public.fn_deleted_accounts()`,
      ),
    );
    expect(seen.rows.map((r) => r.user_id)).toContain(TARGET);
    // له دورٌ مسحوب، فالصفة «إداريّ» — الدور يُقرأ ولو رُفع.
    expect(seen.rows.find((r) => r.user_id === TARGET)?.is_staff).toBe(true);

    const blind = await asUser(PLAIN, () =>
      db.query(`select * from public.fn_deleted_accounts()`),
    );
    expect(blind.rowCount).toBe(0);
  });

  it("**والمحو يُرفض قبل انقضاء المدّة** — الوعد بثلاثين يوماً وعد", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_purge_account($1)`, [TARGET])),
    ).rejects.toThrow(/انقضت مدّته/);
  });

  it("**ولا يُحذف من هو في السلّة سلفاً**", async () => {
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_delete_account($1)`, [TARGET])),
    ).rejects.toThrow(/في السلّة سلفاً/);
  });

  it("والاستعادة تُفرّغ العلامتين معاً — كما يفعل «إعادة التفعيل»", async () => {
    await asUser(ADMIN, () =>
      db.query(
        `update public.profiles set deleted_at = null, purge_after = null where user_id = $1`,
        [TARGET],
      ),
    );
    expect(await profileOf(TARGET)).toEqual({ deleted: false, purge: false });
    // ولا تُعيد مشاركته: مقعده قد تحرّر لغيره.
    expect(await liveParticipants()).toBe(1);
  });

  it("**والموقوف يُحذف كما يُحذف الحيّ** — لا يُعاد تفعيله ليُحذف", async () => {
    await asUser(ADMIN, () =>
      db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [TARGET]),
    );
    await asUser(ADMIN, () => db.query(`select public.fn_delete_account($1)`, [TARGET]));
    expect(await profileOf(TARGET)).toEqual({ deleted: true, purge: true });

    await asUser(ADMIN, () =>
      db.query(
        `update public.profiles set deleted_at = null, purge_after = null where user_id = $1`,
        [TARGET],
      ),
    );
  });
});

describe("المحو النهائي", () => {
  it("**ودورٌ قائمٌ يمنع المحو** — لا يُمحى أحدٌ وله سلطان", async () => {
    await asUser(ADMIN, () => db.query(`select public.fn_delete_account($1)`, [TARGET]));
    await ageOutOfBin(TARGET);

    await db.query(
      `update public.user_roles set deleted_at = null where user_id = $1 and role_id = $2`,
      [TARGET, roleId],
    );
    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_purge_account($1)`, [TARGET])),
    ).rejects.toThrow(/وله سلطان/);
    await db.query(`update public.user_roles set deleted_at = now() where user_id = $1`, [TARGET]);
  });

  it("**والمرفق يوقف المحو كلَّه ولا يُصنَّف** — فلا تُمحى مادة برنامجٍ بصمت", async () => {
    await db.query(
      `insert into public.attachments (storage_path, mime_type, size_bytes, owner_id, entity_table, entity_id)
       values ('test/bin.png', 'image/png', 10, $1, 'programs', $2)`,
      [TARGET, programId],
    );

    await expect(
      asUser(ADMIN, () => db.query(`select public.fn_purge_account($1)`, [TARGET])),
    ).rejects.toThrow(/أحِل ملكيتها قبل محوه/);

    await db.query(`delete from public.attachments where owner_id = $1`, [TARGET]);
  });

  it("**والمحو يمضي: الهوية تزول**", async () => {
    // حارسُ نطاقٍ قبل الفعل الوحيد الذي لا يُستدرَك: معرّفٌ مغلوط يُوقف
    // الاختبار هنا، لا بعد أن يمحو إنساناً — والقاعدة قاعدةُ العمل لا نسخةٌ.
    const { rows } = await db.query<{ email: string }>(
      `select email::text from auth.users where id = $1`,
      [TARGET],
    );
    expect(rows[0]?.email, "المحو لا يقع إلا على حساب اختبار").toMatch(/^bin-\d+@test\.local$/);

    await asUser(ADMIN, () => db.query(`select public.fn_purge_account($1)`, [TARGET]));

    expect(await profileOf(TARGET)).toBeNull();
    const { rowCount } = await db.query(`select 1 from auth.users where id = $1`, [TARGET]);
    expect(rowCount).toBe(0);

    const answers = await db.query(
      `select 1 from public.admission_answers where participant_id = $1`,
      [targetParticipant],
    );
    expect(answers.rowCount).toBe(0);
  });

  it("**وسجلّ البرنامج يبقى بلا صاحب** — الأيام لا تنقص بأثر رجعي", async () => {
    const { rows } = await db.query<{ user_id: string | null }>(
      `select user_id from public.participants where id = $1`,
      [targetParticipant],
    );
    expect(rows[0]!.user_id).toBeNull();

    const done = await db.query(
      `select 1 from public.achievements where participant_id = $1 and deleted_at is null`,
      [targetParticipant],
    );
    expect(done.rowCount).toBe(1);
  });

  it("**والسجلّ يبقى شاهداً باسمٍ مطموس** — لا «فعل منصة»", async () => {
    const { rows } = await db.query<{ actor_label: string | null }>(
      `select distinct actor_label from public.audit_log where actor_id = $1`,
      [TARGET],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.actor_label).toBe('إداريّ محذوف');

    const purged = await db.query(
      `select 1 from public.audit_log where action = 'account_purged' and entity_id is not null`,
    );
    expect(purged.rowCount).toBeGreaterThan(0);
  });

  it("وقرارُه عن غيره يبقى، واسمُه مثبَّتٌ فيه", async () => {
    const { rows } = await db.query<{ decided_by: string | null; decided_by_label: string | null }>(
      `select decided_by, decided_by_label from public.track_change_requests where id = $1`,
      [requestId],
    );
    // المعرّف يبقى حرّاً بلا مفتاح — كـ`actor_id` في السجلّ، لا يُفرَّغ أحدهما دون الآخر.
    expect(rows[0]!.decided_by).toBe(TARGET);
    expect(rows[0]!.decided_by_label).toBe("إداريّ محذوف");
  });

  it("**وسبب صاحب المشاركة يُطمس** والقرار يبقى", async () => {
    const { rows } = await db.query<{ reason: string }>(
      `select reason from public.track_change_requests where participant_id = $1`,
      [targetParticipant],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.reason).toBe("حُذف حساب صاحبه");
  });
});
