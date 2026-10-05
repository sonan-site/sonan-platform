import pg from "pg";

/**
 * قياس الحمل على «رحلتي» — **يدويّ، خارج CI**.
 *
 *   pnpm load:journey -- --seed    يبذر برنامجاً ومشاركين (مرّة)
 *   pnpm load:journey -- --run     يقيس الصفحة كما هي الآن
 *   pnpm load:journey -- --clean   يُزيل ما بُذر
 *
 * **ما يقيسه:** كلفة القاعدة وحدها لكل مشارك يفتح يومه ثم يرصده (العدّاد ثم
 * الإتمام) ثم يفتحه ثانية، والجميع **في اللحظة نفسها**. كل طلب يُنفَّذ كما
 * تنفّذه واجهة REST: معاملة، بدور `authenticated` وهويّة المشارك، فتعمل سياسات
 * الصفوف كلها كما في الإنتاج. والطلبات تتزاحم على مجمّع اتصالات محدود كما
 * تتزاحم في Supabase.
 *
 * **ما لا يقيسه:** شبكة المتصفّح، وخادم Next، وخدمة المصادقة. فالرقم **حدٌّ
 * أدنى** لزمن الصفحة لا زمنها.
 *
 * **ويفحص الصحّة لا السرعة وحدها:** لكل مشارك يُحسب يومه الجاري مرّتين، من
 * الصفحة ومن القاعدة مباشرة، ويُعدّ الاختلاف. سقف الصفوف في واجهة REST
 * (١٠٠٠ صف) يُخطئ اليوم الجاري بصمت، ولا يكشفه قياس الزمن.
 *
 * **والبذر يبدأ البرنامج قبل ٢٨٠ يوماً:** فأول فتحٍ لكل مشارك يُسوّي أرشيفه كله
 * (`adr/0041`) — أسوأ حالٍ لمن غاب طويلاً. والتشغيل الثاني يقيس الصفحة بعد التسوية.
 */

/** أداة سطر أوامر: تكتب للطرفية مباشرة. */
const say = (line: string) => process.stdout.write(line + String.fromCharCode(10));

const URL = process.env.SUPABASE_DB_URL;
if (!URL) throw new Error("SUPABASE_DB_URL غير مضبوط.");

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k!, v ?? "true"];
  }),
);

const USERS = Number(args.get("users") ?? 100);
const POOL = Number(args.get("pool") ?? 10);
const DONE_DAYS = 280;
const SLUG = "load-journey";
const MAX_ROWS = 1000; // سقف واجهة REST في Supabase — `supabase/config.toml` `max_rows`.
const userId = (i: number) => `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`;

const admin = new pg.Client({ connectionString: URL });
await admin.connect();

// ══ مجمّع اتصالات: الطلبات تنتظر دورها كما تنتظره في واجهة REST ══
const clients = await Promise.all(
  Array.from({ length: POOL }, async () => {
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    return c;
  }),
);
const idle = [...clients];
const waiting: ((c: pg.Client) => void)[] = [];
const acquire = () =>
  new Promise<pg.Client>((resolve) => {
    const c = idle.pop();
    if (c) resolve(c);
    else waiting.push(resolve);
  });
const release = (c: pg.Client) => {
  const next = waiting.shift();
  if (next) next(c);
  else idle.push(c);
};

let requests = 0;

/** قيمة حرفية آمنة — لتُرسَل المعاملة كلها في رحلة شبكة واحدة كما ترسلها واجهة REST. */
function literal(c: pg.Client, value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return c.escapeLiteral(`{${value.join(",")}}`);
  return c.escapeLiteral(String(value));
}

/**
 * طلب REST واحد: معاملة بدور المستخدم، و`max_rows` مفروض على الناتج.
 *
 * **رحلة شبكة واحدة لا خمس:** واجهة REST تجاور القاعدة فتنفّذ الدور والهويّة
 * والاستعلام بلا كلفة شبكة بينها. لو أُرسلت هنا منفصلة لتضاعف الزمن خمساً
 * بكلفةٍ لا وجود لها في الإنتاج.
 */
async function rest<T extends pg.QueryResultRow>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const c = await acquire();
  requests += 1;
  const inlined = sql.replace(/\$(\d+)/g, (_, n: string) => literal(c, params[Number(n) - 1]));
  const claims = c.escapeLiteral(JSON.stringify({ sub: uid, role: "authenticated" }));
  try {
    const results = (await c.query(
      `begin; set local role authenticated;
       select set_config('request.jwt.claims', ${claims}, true);
       ${inlined};
       commit;`,
    )) as unknown as pg.QueryResult<T>[];
    return results[3]!.rows.slice(0, MAX_ROWS);
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    release(c);
  }
}

type Participant = { id: string; uid: string; trackId: string; programId: string };
type Task = {
  task_field_id: string;
  ord_from: number | null;
  ord_to: number | null;
  repetition: number | null;
  count: number;
  marked_at: string | null;
  is_material_linked: boolean;
};

/** الجلسة: `fn_is_active` و`fn_my_permissions`. */
async function session(p: Participant) {
  await rest(p.uid, `select public.fn_is_active()`);
  await rest(p.uid, `select * from public.fn_my_permissions()`);
}

/** الصفحة كما هي — استعلاماتها بترتيبها (`app/(platform)/journey/[participantId]/page.tsx`). */
async function page(p: Participant): Promise<{ day: number; tasks: Task[] } | undefined> {
  await session(p);
  await rest(
    p.uid,
    `select pa.id, pa.status, pa.track_id from public.participants pa
     join public.programs pr on pr.id = pa.program_id
     where pa.id = $1 and pa.user_id = $2 and pa.deleted_at is null`,
    [p.id, p.uid],
  );
  const [state] = await rest<{ s: { state: string; current_day: number } }>(
    p.uid,
    `select public.fn_journey_state($1) as s`,
    [p.id],
  );
  if (!state || state.s.state !== "tasks") return undefined;
  const day = state.s.current_day;

  const [tasks] = await Promise.all([
    rest<Task>(p.uid, `select * from public.fn_day_tasks($1, $2)`, [p.id, day]),
    rest(
      p.uid,
      `select from_sequence, to_sequence, sort_order from public.track_content_ranges
       where track_id = $1 and deleted_at is null`,
      [p.trackId],
    ),
    rest(
      p.uid,
      `select id, name, unit_count from public.material_sections
       where program_id = $1 and deleted_at is null order by sort_order`,
      [p.programId],
    ),
    rest(
      p.uid,
      `select id, calendar_date, status from public.commitment_archive
       where participant_id = $1 and deleted_at is null order by calendar_date desc limit 400`,
      [p.id],
    ),
  ]);
  const sequences = [...new Set(tasks.flatMap((t) => (t.is_material_linked ? [t.ord_from, t.ord_to] : [])))].filter(
    (n): n is number => n !== null,
  );
  if (sequences.length) {
    await rest(
      p.uid,
      `select sequence, label from public.content_units
       where program_id = $1 and sequence = any($2) and deleted_at is null`,
      [p.programId, sequences],
    );
  }
  return { day, tasks };
}

/** الرصد: العدّاد حتى يبلغ عدده ثم الإتمام — لكل حقل كما يفعل المشارك. */
async function mark(p: Participant, day: number, tasks: Task[]) {
  for (const t of tasks) {
    for (let i = t.count; i < (t.repetition ?? 0); i += 1) {
      await rest(p.uid, `select public.fn_count_repetition($1, $2, $3, 1)`, [p.id, day, t.task_field_id]);
    }
    if (!t.marked_at) {
      await rest(p.uid, `select public.fn_mark_field($1, $2, $3)`, [p.id, day, t.task_field_id]);
    }
  }
}

/** اليوم الجاري لكل مشارك من القاعدة مباشرة، بمالكها وبلا سقف — مرجع الصحّة. */
async function truths(programSlug: string): Promise<Map<string, number>> {
  const { rows } = await admin.query<{ id: string; n: number }>(
    `select pa.id,
       (select count(*)::int + 1 from public.day_completions c
        where c.participant_id = pa.id and c.track_id = pa.track_id
          and c.deleted_at is null and c.undone_at is null) as n
     from public.participants pa join public.programs pr on pr.id = pa.program_id
     where pr.slug = $1 and pa.deleted_at is null`,
    [programSlug],
  );
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** زمن رحلة شبكة واحدة إلى القاعدة — ليُطرح من الأرقام حين تُقرأ. */
async function roundTrip(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const t = performance.now();
    await admin.query("select 1");
    samples.push(performance.now() - t);
  }
  return percentile(samples, 50);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

async function seed() {
  const { rows: existing } = await admin.query(`select id from public.programs where slug = $1`, [SLUG]);
  if (existing.length) throw new Error("مبذورٌ سلفاً — شغّل --clean أولاً.");

  const [section] = (await admin.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم قياس الحمل') returning id`,
  )).rows;
  const [program] = (await admin.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug, status, start_date)
     values ($1, 'برنامج قياس الحمل', $2, 'published', (now() at time zone 'Asia/Riyadh')::date - $3::int)
     returning id`,
    [section!.id, SLUG, DONE_DAYS],
  )).rows;
  const programId = program!.id;
  const [track] = (await admin.query<{ id: string }>(
    `insert into public.tracks (program_id, name) values ($1, 'مسار القياس') returning id`,
    [programId],
  )).rows;
  await admin.query(
    `insert into public.content_units (program_id, sequence, label)
     select $1, g, 'وحدة ' || g from generate_series(1, 1200) g`,
    [programId],
  );
  await admin.query(
    `insert into public.track_content_ranges (track_id, from_sequence, to_sequence) values ($1, 1, 1200)`,
    [track!.id],
  );
  // حفظٌ أساسٌ بتكرار، ومراجعةٌ صريحة لما حُفظ، وعدّيان.
  const fields = (await admin.query<{ id: string; label: string }>(
    `insert into public.task_fields (program_id, label, kind, sort_order, is_base, is_constrained) values
       ($1, 'حفظ', 'ranged', 0, true, false), ($1, 'مراجعة', 'explicit', 1, false, true),
       ($1, 'تكرار', 'counted', 2, false, false), ($1, 'تلاوة', 'counted', 3, false, false)
     returning id, label`,
    [programId],
  )).rows;
  const fieldId = (label: string) => fields.find((f) => f.label === label)!.id;

  const [plan] = (await admin.query<{ id: string }>(
    `insert into public.plans (program_id, name, day_count, created_at)
     values ($1, 'سنة كاملة', 366, now() - ($2::int + 10) * interval '1 day') returning id`,
    [programId, DONE_DAYS],
  )).rows;
  await admin.query(
    `insert into public.plan_values (plan_id, day_number, task_field_id, amount, from_sequence, to_sequence, value, repetition)
     select $1, g, $2::uuid, 3, null::int, null::int, null::numeric, 3 from generate_series(1, 366) g
     union all
     select $1, g, $3::uuid, null, greatest(1, 3 * (g - 1) - 5), 3 * (g - 1), null, null from generate_series(2, 366) g
     union all
     select $1, g, $4::uuid, null, null, null, 15, null from generate_series(1, 366) g
     union all
     select $1, g, $5::uuid, null, null, null, 5, null from generate_series(1, 366) g`,
    [plan!.id, fieldId("حفظ"), fieldId("مراجعة"), fieldId("تكرار"), fieldId("تلاوة")],
  );

  for (let i = 1; i <= USERS; i += 1) {
    await admin.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [userId(i), `load-${i}@test.local`],
    );
    await admin.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, $2, '0500000000')`,
      [userId(i), `مشارك ${i}`],
    );
  }
  // التحقوا قبل البداية: فأول فتحٍ يُسوّي ٢٨٠ يوماً — أسوأ حالٍ لمن غاب طويلاً.
  await admin.query(
    `insert into public.participants (user_id, program_id, track_id, status, joined_at)
     select u.id, $1, $2, 'memorizing', now() - ($3::int + 5) * interval '1 day'
     from auth.users u where u.email like 'load-%@test.local'`,
    [programId, track!.id, DONE_DAYS],
  );

  // ٢٨٠ يوماً متمّة لكل مشارك، يوماً كل يوم من البداية، برصد حقوله الأربعة:
  // ١١٢٠ صفّ رصد — فوق سقف واجهة REST عمداً.
  await admin.query(
    `with days as (
       select g as d,
              (((now() at time zone 'Asia/Riyadh')::date - $3::int + g - 1) + time '10:00')
                at time zone 'Asia/Riyadh' as at
       from generate_series(1, $3::int) g
     )
     insert into public.field_marks (participant_id, plan_id, track_id, day_number, task_field_id, marked_at)
     select pa.id, $2, pa.track_id, days.d, f.id, days.at
     from public.participants pa
     cross join days
     cross join public.task_fields f
     where pa.program_id = $1 and f.program_id = $1`,
    [programId, plan!.id, DONE_DAYS],
  );
  await admin.query(
    `insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
     select m.participant_id, m.plan_id, m.track_id, m.day_number, max(m.marked_at)
     from public.field_marks m join public.participants pa on pa.id = m.participant_id
     where pa.program_id = $1
     group by m.participant_id, m.plan_id, m.track_id, m.day_number`,
    [programId],
  );
  say(`بُذر: ${USERS} مشاركاً، خطة ٣٦٦ يوماً، ${DONE_DAYS} يوماً متمّاً لكل واحد.`);
}

async function clean() {
  const { rows } = await admin.query<{ id: string; section_id: string }>(
    `select id, section_id from public.programs where slug = $1`,
    [SLUG],
  );
  const program = rows[0];
  if (program) {
    const p = program.id;
    const mine = `participant_id in (select id from public.participants where program_id = $1)`;
    for (const table of ["commitment_archive", "field_marks", "field_counts", "day_openings", "day_completions"]) {
      await admin.query(`delete from public.${table} where ${mine}`, [p]);
    }
    await admin.query(`delete from public.audit_log where actor_id in (select user_id from public.participants where program_id = $1)`, [p]);
    await admin.query(`delete from public.participants where program_id = $1`, [p]);
    await admin.query(`delete from public.plan_versions where plan_id in (select id from public.plans where program_id = $1)`, [p]);
    await admin.query(`delete from public.plan_values where plan_id in (select id from public.plans where program_id = $1)`, [p]);
    await admin.query(`delete from public.plans where program_id = $1`, [p]);
    await admin.query(`delete from public.task_fields where program_id = $1`, [p]);
    await admin.query(`delete from public.track_content_ranges where track_id in (select id from public.tracks where program_id = $1)`, [p]);
    await admin.query(`delete from public.content_units where program_id = $1`, [p]);
    await admin.query(`delete from public.tracks where program_id = $1`, [p]);
    await admin.query(`delete from public.programs where id = $1`, [p]);
    await admin.query(`delete from public.sections where id = $1`, [program.section_id]);
  }
  await admin.query(`delete from public.profiles where user_id in (select id from auth.users where email like 'load-%@test.local')`);
  await admin.query(`delete from auth.users where email like 'load-%@test.local'`);
  say("أُزيل ما بُذر.");
}

async function run() {
  const participants = (await admin.query<Participant>(
    `select pa.id, pa.user_id as uid, pa.track_id as "trackId", pa.program_id as "programId"
     from public.participants pa join public.programs pr on pr.id = pa.program_id
     where pr.slug = $1 and pa.deleted_at is null`,
    [SLUG],
  )).rows;
  if (!participants.length) throw new Error("لا مشاركين — شغّل --seed أولاً.");

  const pages: number[] = [];
  const marks: number[] = [];
  let wrongDay = 0;
  let failures = 0;
  const expected = await truths(SLUG);
  const rtt = await roundTrip();

  const started = performance.now();
  await Promise.all(
    participants.map(async (p) => {
      try {
        let t = performance.now();
        const shown = await page(p);
        pages.push(performance.now() - t);
        if ((shown?.day ?? null) !== expected.get(p.id)) wrongDay += 1;
        if (!shown) return;

        t = performance.now();
        await mark(p, shown.day, shown.tasks);
        marks.push(performance.now() - t);

        t = performance.now();
        await page(p);
        pages.push(performance.now() - t);
      } catch (error) {
        failures += 1;
        if (failures <= 3) console.error((error as Error).message);
      }
    }),
  );
  const total = (performance.now() - started) / 1000;

  const ms = (v: number) => `${Math.round(v)}ms`;
  say(`\n══ ${participants.length} مشاركاً متزامناً · مجمّع ${POOL} اتصالات ══`);
  say(`فتح اليوم : p50 ${ms(percentile(pages, 50))} · p95 ${ms(percentile(pages, 95))} · أقصى ${ms(Math.max(...pages))}`);
  say(`الرصد     : p50 ${ms(percentile(marks, 50))} · p95 ${ms(percentile(marks, 95))} · أقصى ${ms(Math.max(...marks))}`);
  say(`طلبات REST: ${requests} (${(requests / participants.length).toFixed(1)} لكل مشارك) · رحلة الشبكة من هذا الجهاز: ${ms(rtt)}`);
  say(`يوم جارٍ خاطئ: ${wrongDay} · أخطاء: ${failures} · المدّة الكلية: ${total.toFixed(1)}ث`);
}

try {
  if (args.has("seed")) await seed();
  else if (args.has("clean")) await clean();
  else await run();
} finally {
  await Promise.all(clients.map((c) => c.end()));
  await admin.end();
}
