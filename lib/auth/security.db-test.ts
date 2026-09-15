import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * تحصين المرحلة الأولى — الهجرة ٠٢٦.
 *
 * كل ثغرة هنا وُجدت بطلب مباشر على واجهة REST، فتُختبَر **بالدور الذي
 * يصلها**: `anon` أو `authenticated`، داخل معاملة تُرجَع. الاختبار بمالك
 * القاعدة يتجاوز السياسات فلا يرى الثغرة أصلاً.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackId: string;
let roleWriter: string;
let roleTarget: string;

const ADMIN = "00000000-0000-4000-8000-0000000005a1";
const PLAYER = "00000000-0000-4000-8000-0000000005b1";
const PLAYER_2 = "00000000-0000-4000-8000-0000000005b2";
const USERS = [ADMIN, PLAYER, PLAYER_2];

/** يُنفّذ داخل معاملة بدورٍ وهويّة، ثم يُرجِعها — لا أثر يبقى. */
async function inRole<T>(
  role: "anon" | "authenticated",
  userId: string | null,
  work: (c: Client) => Promise<T>,
  client: Client = db,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      userId ? JSON.stringify({ sub: userId, role }) : "",
    ]);
    return await work(client);
  } finally {
    await client.query("rollback");
  }
}

/** كالسابق لكن يُثبِّت — لما يجب أن يبقى أثره (تسجيل يُعدّ في السعة). */
async function commitAs(userId: string, sql: string, params: unknown[], client: Client = db) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await client.query(sql, params);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function register(userId: string, extra = "", client: Client = db) {
  return commitAs(
    userId,
    `insert into public.participants (user_id, program_id, track_id${extra ? ", status" : ""})
     values ($1, $2, $3${extra ? ", $4::public.participant_status" : ""}) returning id`,
    extra ? [userId, programId, trackId, extra] : [userId, programId, trackId],
    client,
  );
}

async function clearParticipants() {
  await db.query(
    `delete from public.audit_log where entity_table = 'participants'
       and entity_id in (select id from public.participants where program_id = $1)`,
    [programId],
  );
  await db.query(`delete from public.participants where program_id = $1`, [programId]);
}

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, id] of USERS.entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role)
       values ($1, $2, 'authenticated', 'authenticated')`,
      [id, `security-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'اختبار', '+966500000000')`,
      [id],
    );
  }

  const section = await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار التحصين') returning id`,
  );
  sectionId = section.rows[0]!.id;

  const program = await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug, status, capacity)
     values ($1, 'برنامج التحصين', 'security-test', 'published', 100) returning id`,
    [sectionId],
  );
  programId = program.rows[0]!.id;

  const track = await db.query<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'مسار') returning id`,
    [programId],
  );
  trackId = track.rows[0]!.id;

  // دور يملك `roles.write` و`users.read` فقط — لا `users.write`.
  const writer = await db.query<{ id: string }>(
    `insert into public.roles (name) values ('دور اختبار التحصين') returning id`,
  );
  roleWriter = writer.rows[0]!.id;
  await db.query(
    `insert into public.role_permissions (role_id, permission_code)
     values ($1, 'roles.write'), ($1, 'users.read')`,
    [roleWriter],
  );
  await db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [
    ADMIN,
    roleWriter,
  ]);

  const target = await db.query<{ id: string }>(
    `insert into public.roles (name) values ('دور هدف التحصين') returning id`,
  );
  roleTarget = target.rows[0]!.id;
});

afterAll(async () => {
  if (programId) await clearParticipants();
  if (sectionId) {
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where section_id = $1`, [sectionId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  for (const role of [roleWriter, roleTarget].filter(Boolean)) {
    await db.query(`delete from public.user_roles where role_id = $1`, [role]);
    await db.query(`delete from public.role_permissions where role_id = $1`, [role]);
    await db.query(`delete from public.roles where id = $1`, [role]);
  }
  await db.query(`delete from public.audit_log where actor_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [USERS]);
  await db.query(`delete from public.rate_limit_events where bucket like 'security-test:%'`);
  await db?.end();
});

describe("١ · الإيقاف يوقف", () => {
  it("**الموقوف يفقد صلاحياته كلها** — لا شاشة ولا سياسة ولا إجراء", async () => {
    const before = await inRole("authenticated", ADMIN, (c) =>
      c.query<{ v: boolean }>(`select public.fn_has_permission('roles.write') as v`),
    );
    expect(before.rows[0]?.v).toBe(true);

    await db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [ADMIN]);
    try {
      const after = await inRole("authenticated", ADMIN, (c) =>
        c.query<{ v: boolean }>(`select public.fn_has_permission('roles.write') as v`),
      );
      expect(after.rows[0]?.v).toBe(false);

      const mine = await inRole("authenticated", ADMIN, (c) =>
        c.query(`select * from public.fn_my_permissions()`),
      );
      expect(mine.rowCount).toBe(0);
    } finally {
      await db.query(`update public.profiles set deleted_at = null where user_id = $1`, [ADMIN]);
    }
  });

  it("**لا يرفع أحدٌ إيقافه عن نفسه**", async () => {
    await db.query(`update public.profiles set deleted_at = now() where user_id = $1`, [PLAYER]);
    try {
      await expect(
        inRole("authenticated", PLAYER, (c) =>
          c.query(`update public.profiles set deleted_at = null where user_id = $1`, [PLAYER]),
        ),
      ).rejects.toThrow(/لا تُعدَّل إلا من الإدارة/);
    } finally {
      await db.query(`update public.profiles set deleted_at = null where user_id = $1`, [PLAYER]);
    }
  });

  it("ويعدّل اسمه وجواله — الحارس على الحالة وحدها", async () => {
    const { rowCount } = await inRole("authenticated", PLAYER, (c) =>
      c.query(`update public.profiles set full_name = 'اسم جديد' where user_id = $1`, [PLAYER]),
    );
    expect(rowCount).toBe(1);
  });
});

describe("٢ · عدّاد المحاولات للخادم وحده", () => {
  for (const role of ["anon", "authenticated"] as const) {
    it(`**${role} لا يصل العدّاد** — لا مسح ولا ملء لدلو غيره`, async () => {
      await expect(
        inRole(role, role === "anon" ? null : PLAYER, (c) =>
          c.query(`select public.fn_hit_rate_limit('security-test:x', 1, 0)`),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        inRole(role, role === "anon" ? null : PLAYER, (c) =>
          c.query(`select public.fn_rate_limit('security-test:x', 'auth.login')`),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  }

  it("والمحاولات المتزامنة لا تمرّ كلها تحت الحدّ", async () => {
    const clients = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
        await c.connect();
        return c;
      }),
    );
    try {
      const results = await Promise.all(
        clients.map((c) =>
          c
            .query<{ ok: boolean }>(`select public.fn_hit_rate_limit('security-test:burst', 3, 900) as ok`)
            .then((r) => r.rows[0]!.ok),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(3);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
      await db.query(`delete from public.audit_log where action = 'rate_limit_exceeded'
                        and after->>'bucket' = 'security-test:burst'`);
    }
  });
});

describe("٣ · التسجيل الذاتي", () => {
  it("**لا يسجّل أحدٌ نفسه «مجتازاً»**", async () => {
    await expect(register(PLAYER, "passed")).rejects.toThrow(/row-level security/);
    await clearParticipants();
  });

  it("والتسجيل بحالة البداية يمرّ — لا نفي زائد", async () => {
    const { rowCount } = await register(PLAYER);
    expect(rowCount).toBe(1);
    await clearParticipants();
  });

  it("**المقعد الأخير لا يأخذه اثنان متزامنان**", async () => {
    await db.query(`update public.programs set capacity = 1 where id = $1`, [programId]);
    const first = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    const second = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await first.connect();
    await second.connect();
    try {
      await first.query("begin");
      await first.query("set local role authenticated");
      await first.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: PLAYER, role: "authenticated" }),
      ]);
      await first.query(
        `insert into public.participants (user_id, program_id) values ($1, $2)`,
        [PLAYER, programId],
      );

      const pid = (await second.query<{ pid: number }>(`select pg_backend_pid() as pid`)).rows[0]!.pid;
      const racing = register(PLAYER_2, "", second).then(
        () => "accepted",
        (error: Error) => error.message,
      );

      // الثاني يجب أن ينتظر القفل فعلاً قبل أن يُثبَّت الأول — وإلا فلا سباق مختبَر.
      for (let i = 0; i < 50; i += 1) {
        const { rows } = await db.query<{ w: string | null }>(
          `select wait_event_type as w from pg_stat_activity where pid = $1`,
          [pid],
        );
        if (rows[0]?.w === "Lock") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await first.query("commit");

      expect(await racing).toMatch(/اكتمل العدد/);
    } finally {
      await first.end();
      await second.end();
      await db.query(`update public.programs set capacity = 100 where id = $1`, [programId]);
      await clearParticipants();
    }
  });

  it("**سعة المسار تُفرض** — كانت تُخزَّن ولا يقرؤها شيء", async () => {
    await db.query(`update public.tracks set capacity = 1 where id = $1`, [trackId]);
    try {
      await register(PLAYER);
      await expect(register(PLAYER_2)).rejects.toThrow(/اكتمل العدد في هذا المسار/);
    } finally {
      await db.query(`update public.tracks set capacity = null where id = $1`, [trackId]);
      await clearParticipants();
    }
  });
});

describe("٤ · لا يمنح أحدٌ دوراً ما لا يملكه", () => {
  it("**`roles.write` لا يضيف لدورٍ صلاحيةً لا يملكها صاحبه**", async () => {
    await expect(
      inRole("authenticated", ADMIN, (c) =>
        c.query(
          `insert into public.role_permissions (role_id, permission_code) values ($1, 'users.write')`,
          [roleTarget],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("ويضيف ما يملكه — لا نفي زائد", async () => {
    const { rowCount } = await inRole("authenticated", ADMIN, (c) =>
      c.query(
        `insert into public.role_permissions (role_id, permission_code) values ($1, 'users.read')`,
        [roleTarget],
      ),
    );
    expect(rowCount).toBe(1);
  });

  it("**ولا يُمسّ دور النظام**", async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.roles where is_system and deleted_at is null limit 1`,
    );
    await expect(
      inRole("authenticated", ADMIN, (c) =>
        c.query(
          `insert into public.role_permissions (role_id, permission_code) values ($1, 'roles.write')`,
          [rows[0]!.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("٥ · سجل التدقيق", () => {
  it("**من لا صلاحية له لا يكتب تدقيقاً إدارياً**", async () => {
    await expect(
      inRole("authenticated", PLAYER, (c) =>
        c.query(`select public.fn_write_audit('role_assigned', 'user_roles')`),
      ),
    ).rejects.toThrow(/بلا صلاحية/);
  });

  it("**وتدقيق التسجيل: على تسجيله هو، ومرّة واحدة**", async () => {
    const mine = await register(PLAYER);
    const id = (mine.rows[0] as { id: string }).id;
    try {
      await commitAs(PLAYER, `select public.fn_write_audit('participant_registered', 'participants', $1)`, [id]);
      await expect(
        commitAs(PLAYER, `select public.fn_write_audit('participant_registered', 'participants', $1)`, [id]),
      ).rejects.toThrow(/غير مطابق/);
      await expect(
        commitAs(PLAYER_2, `select public.fn_write_audit('participant_registered', 'participants', $1)`, [id]),
      ).rejects.toThrow(/غير مطابق/);
    } finally {
      await clearParticipants();
    }
  });
});

describe("٦ · أرشفة المسار", () => {
  /** بصلاحية الكتابة وحدها، بلا قراءة المشاركين — عين الحالة التي كان الفحص يعمى فيها. */
  async function withProgramsWrite<T>(work: () => Promise<T>): Promise<T> {
    await db.query(
      `insert into public.role_permissions (role_id, permission_code) values ($1, 'programs.write')`,
      [roleWriter],
    );
    try {
      return await work();
    } finally {
      await db.query(
        `delete from public.role_permissions where role_id = $1 and permission_code = 'programs.write'`,
        [roleWriter],
      );
    }
  }

  it("**مسارٌ فيه مشاركون لا يُؤرشَف** — ولو لم يرَهم المؤرشِف", async () => {
    await register(PLAYER);
    try {
      await withProgramsWrite(() =>
        expect(
          inRole("authenticated", ADMIN, (c) => c.query(`select public.fn_archive_track($1)`, [trackId])),
        ).rejects.toThrow(/في المسار مشاركون/),
      );
    } finally {
      await clearParticipants();
    }
  });

  it("ومن لا يملك الكتابة لا يؤرشف شيئاً — فراغٌ لا نجاح", async () => {
    const { rows } = await inRole("authenticated", PLAYER, (c) =>
      c.query<{ v: number | null }>(`select public.fn_archive_track($1) as v`, [trackId]),
    );
    expect(rows[0]?.v).toBeNull();
  });
});

describe("الدوال المكشوفة للزائر — قائمة مغلقة", () => {
  /**
   * كل دالة `security definer` تتجاوز السياسات. فما يصله `anon` منها يُسمّى
   * هنا بالاسم، وأي إضافة تُفشل الاختبار حتى تُقرَّر صراحةً.
   */
  it("**لا دالة يصلها الزائر إلا ما سُمّي**", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select p.proname as name
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prorettype <> 'pg_catalog.trigger'::regtype
         and has_function_privilege('anon', p.oid, 'EXECUTE')
       order by 1`,
    );
    // `fn_has_permission` تُجيب الزائر بـ`false` دائماً، وسياسات القراءة العامة تستدعيها.
    // `fn_auth_showcase` تُرجع شرائح شاشة الدخول وحدها، لا جدول الإعدادات (الهجرة ٠٣٨).
    expect(rows.map((r) => r.name)).toEqual([
      "fn_auth_showcase",
      "fn_has_permission",
      "fn_registration_state",
      "fn_track_unit_count",
    ]);
  });

  it("**الزائر يقرأ مسارات البرنامج المنشور وعناصر صفحته وأسئلته**", async () => {
    await db.query(
      `insert into public.page_blocks (program_id, block_type, sort_order, content)
       values ($1, 'free_text', 0, '{"text":"نص"}')`,
      [programId],
    );
    await db.query(
      `insert into public.admission_questions (program_id, question) values ($1, 'سؤال قبول')`,
      [programId],
    );
    try {
      for (const table of ["tracks", "page_blocks", "admission_questions"]) {
        const { rowCount } = await inRole("anon", null, (c) =>
          c.query(`select id from public.${table} where program_id = $1`, [programId]),
        );
        expect(rowCount, table).toBeGreaterThan(0);
      }
    } finally {
      await db.query(`delete from public.page_blocks where program_id = $1`, [programId]);
      await db.query(`delete from public.admission_questions where program_id = $1`, [programId]);
    }
  });

  it("والزائر لا ينال بها شيئاً — جوابها له `false`", async () => {
    const { rows } = await inRole("anon", null, (c) =>
      c.query<{ v: boolean }>(`select public.fn_has_permission('programs.write') as v`),
    );
    expect(rows[0]?.v).toBe(false);
  });

  it("**وعدّاد المحاولات لمفتاح الخدمة وحده**", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select p.proname as name
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'fn_rate_limit%'
         and has_function_privilege('service_role', p.oid, 'EXECUTE')
       order by 1`,
    );
    expect(rows.map((r) => r.name)).toEqual(["fn_rate_limit", "fn_rate_limit_clear"]);
  });
});
