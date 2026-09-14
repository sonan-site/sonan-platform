import pg from "pg";

/**
 * قياس الحمل على «رحلتي» — **يدويّ، خارج CI**.
 *
 *   pnpm load:journey -- --seed          يبذر برنامجاً ومشاركين (مرّة)
 *   pnpm load:journey -- --run=baseline  يقيس الصفحة كما كانت
 *   pnpm load:journey -- --run=current   يقيس الصفحة كما هي الآن
 *   pnpm load:journey -- --clean         يُزيل ما بُذر
 *
 * **ما يقيسه:** كلفة القاعدة وحدها لكل مشارك يفتح يومه ثم يُرسله ثم يفتحه ثانية،
 * والجميع **في اللحظة نفسها**. كل طلب يُنفَّذ كما تنفّذه واجهة REST: معاملة،
 * بدور `authenticated` وهويّة المشارك، فتعمل سياسات الصفوف كلها كما في الإنتاج.
 * والطلبات تتزاحم على مجمّع اتصالات محدود كما تتزاحم في Supabase.
 *
 * **ما لا يقيسه:** شبكة المتصفّح، وخادم Next، وخدمة المصادقة. فالرقم **حدٌّ
 * أدنى** لزمن الصفحة لا زمنها.
 *
 * **ويفحص الصحّة لا السرعة وحدها:** لكل مشارك يُحسب يومه الجاري مرّتين، من
 * الصفحة ومن القاعدة مباشرة، ويُعدّ الاختلاف. سقف الصفوف في واجهة REST
 * (١٠٠٠ صف) يُخطئ اليوم الجاري بصمت، ولا يكشفه قياس الزمن.
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
const SUBMITTED_DAYS = 280;
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
type Day = { id: string; day_number: number; day_type: string; has_work: boolean; submitted: boolean };

function currentOf(days: Day[]): Day | undefined {
  return days.find((d) => d.day_type === "normal" && d.has_work && !d.submitted);
}

/** الجلسة: `fn_is_active` و`fn_my_permissions` — مرّتان في الصفحة القديمة (الإطار والصفحة). */
async function session(p: Participant, times: number) {
  for (let i = 0; i < times; i += 1) {
    await rest(p.uid, `select public.fn_is_active()`);
    await rest(p.uid, `select * from public.fn_my_permissions()`);
  }
}

async function spansAndLabels(p: Participant, tasks: { ordinal_start: number | null; ordinal_end: number | null }[]) {
  const spans = await Promise.all(
    tasks
      .filter((t) => t.ordinal_start !== null)
      .map((t) =>
        rest<{ from_sequence: number; to_sequence: number }>(
          p.uid,
          `select * from public.fn_track_ordinal_span($1, $2, $3)`,
          [p.trackId, t.ordinal_start, t.ordinal_end],
        ),
      ),
  );
  const sequences = [...new Set(spans.flat().flatMap((s) => [s.from_sequence, s.to_sequence]))];
  if (sequences.length) {
    await rest(
      p.uid,
      `select sequence, label from public.content_units
       where program_id = $1 and sequence = any($2) and deleted_at is null`,
      [p.programId, sequences],
    );
  }
}

/** الصفحة كما كانت قبل المراجعة — نسخة طبق الأصل من استعلاماتها. */
async function baselinePage(p: Participant): Promise<Day | undefined> {
  await session(p, 2);
  await rest(
    p.uid,
    `select pa.id, pa.status, pa.track_id from public.participants pa
     join public.programs pr on pr.id = pa.program_id
     where pa.id = $1 and pa.user_id = $2 and pa.deleted_at is null`,
    [p.id, p.uid],
  );
  const [plan] = await rest<{ id: string }>(
    p.uid,
    `select id from public.plans where track_id = $1 and deleted_at is null`,
    [p.trackId],
  );
  const [planDays, done, templateFields] = await Promise.all([
    rest<{ id: string; day_number: number; day_type: string; day_template_id: string | null }>(
      p.uid,
      `select id, day_number, day_type, day_template_id from public.plan_days
       where plan_id = $1 and deleted_at is null order by day_number`,
      [plan!.id],
    ),
    rest<{ plan_day_id: string }>(
      p.uid,
      `select plan_day_id from public.achievements where participant_id = $1 and deleted_at is null`,
      [p.id],
    ),
    rest<{ day_template_id: string }>(
      p.uid,
      `select day_template_id from public.day_template_fields where deleted_at is null`,
    ),
  ]);
  const submitted = new Set(done.map((a) => a.plan_day_id));
  const withFields = new Set(templateFields.map((f) => f.day_template_id));
  const days: Day[] = planDays.map((d) => ({
    id: d.id,
    day_number: d.day_number,
    day_type: d.day_type,
    submitted: submitted.has(d.id),
    has_work: d.day_type === "normal" && withFields.has(d.day_template_id ?? ""),
  }));
  const current = currentOf(days);
  if (!current) return undefined;

  const [tasks] = await Promise.all([
    rest<{ ordinal_start: number | null; ordinal_end: number | null }>(
      p.uid,
      `select * from public.fn_plan_day_tasks($1, $2)`,
      [p.id, current.id],
    ),
    rest(p.uid, `select public.fn_track_unit_count($1)`, [p.trackId]),
  ]);
  await spansAndLabels(p, tasks);
  return current;
}

/** الصفحة كما هي الآن — تُحدَّث مع كل تحسين، والقديمة تبقى للمقارنة. */
async function currentPage(p: Participant): Promise<Day | undefined> {
  await session(p, 1);
  await rest(
    p.uid,
    `select pa.id, pa.status, pa.track_id from public.participants pa
     join public.programs pr on pr.id = pa.program_id
     where pa.id = $1 and pa.user_id = $2 and pa.deleted_at is null`,
    [p.id, p.uid],
  );
  const days = await rest<Day>(p.uid, `select * from public.fn_journey_days($1)`, [p.id]);
  const current = currentOf(days);
  if (!current) return undefined;

  const [tasks] = await Promise.all([
    rest<{ ordinal_start: number | null; ordinal_end: number | null }>(
      p.uid,
      `select * from public.fn_plan_day_tasks($1, $2)`,
      [p.id, current.id],
    ),
    rest(p.uid, `select public.fn_track_unit_count($1)`, [p.trackId]),
  ]);
  await spansAndLabels(p, tasks);
  return current;
}

async function submit(p: Participant, day: Day) {
  const fields = await rest<{ task_field_id: string }>(
    p.uid,
    `select task_field_id from public.fn_plan_day_tasks($1, $2)`,
    [p.id, day.id],
  );
  await rest(p.uid, `select public.fn_submit_day($1, $2)`, [
    day.id,
    fields.map((f) => f.task_field_id),
  ]);
}

/** اليوم الجاري لكل مشارك من القاعدة مباشرة، بمالكها وبلا سقف — مرجع الصحّة. */
async function truths(programSlug: string): Promise<Map<string, number | null>> {
  const { rows } = await admin.query<{ id: string; n: number | null }>(
    `select pa.id,
       (select min(d.day_number)
        from public.plan_days d
        join public.plans pl on pl.id = d.plan_id
        where pl.track_id = pa.track_id and d.deleted_at is null and d.day_type = 'normal'
          and not exists (
            select 1 from public.achievements a
            where a.plan_day_id = d.id and a.participant_id = pa.id and a.deleted_at is null
          )) as n
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
    `insert into public.programs (section_id, name, slug, status)
     values ($1, 'برنامج قياس الحمل', $2, 'published') returning id`,
    [section!.id, SLUG],
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
  const fields = (await admin.query<{ id: string; kind: string; amount: number }>(
    `with f as (
       insert into public.task_fields (program_id, label, kind, sort_order) values
         ($1, 'حفظ', 'ranged', 0), ($1, 'مراجعة', 'ranged', 1),
         ($1, 'تكرار', 'counted', 2), ($1, 'تلاوة', 'counted', 3)
       returning id, kind, sort_order)
     select id, kind::text, (array[2, 3, 15, 5])[sort_order + 1] as amount from f`,
    [programId],
  )).rows;
  const [template] = (await admin.query<{ id: string }>(
    `insert into public.day_templates (program_id, name) values ($1, 'يوم') returning id`,
    [programId],
  )).rows;
  for (const [i, f] of fields.entries()) {
    await admin.query(
      `insert into public.day_template_fields (day_template_id, task_field_id, base_amount, sort_order)
       values ($1, $2, $3, $4)`,
      [template!.id, f.id, f.amount, i],
    );
  }
  const [plan] = (await admin.query<{ id: string }>(
    `insert into public.plans (track_id, name) values ($1, 'سنة كاملة') returning id`,
    [track!.id],
  )).rows;
  await admin.query(
    `insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
     select $1, g,
            case when g % 7 = 0 then 'rest'::public.day_type else 'normal'::public.day_type end,
            case when g % 7 = 0 then null else $2::uuid end
     from generate_series(1, 366) g`,
    [plan!.id, template!.id],
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
  await admin.query(
    `insert into public.participants (user_id, program_id, track_id, status)
     select u.id, $1, $2, 'memorizing' from auth.users u where u.email like 'load-%@test.local'`,
    [programId, track!.id],
  );

  // ٢٨٠ يوم عمل مُرسَلة لكل مشارك، بأربعة حقول: ١١٢٠ صفّ إنجاز — فوق السقف عمداً.
  await admin.query(
    `insert into public.achievements
       (participant_id, plan_day_id, task_field_id, is_done,
        ordinal_start, ordinal_end, range_start, range_end, amount)
     select pa.id, d.id, f.id, true,
            case when f.kind = 'ranged' then (d.k - 1) * f.amount + 1 end,
            case when f.kind = 'ranged' then d.k * f.amount end,
            case when f.kind = 'ranged' then (d.k - 1) * f.amount + 1 end,
            case when f.kind = 'ranged' then d.k * f.amount end,
            f.amount
     from public.participants pa
     cross join (
       select id, row_number() over (order by day_number) as k
       from public.plan_days where plan_id = $2 and day_type = 'normal' and deleted_at is null
     ) d
     cross join (select * from jsonb_to_recordset($3::jsonb) as x(id uuid, kind text, amount int)) f
     where pa.program_id = $1 and d.k <= $4`,
    [programId, plan!.id, JSON.stringify(fields), SUBMITTED_DAYS],
  );
  say(`بُذر: ${USERS} مشاركاً، خطة ٣٦٦ يوماً، ${SUBMITTED_DAYS} يوم عمل مُرسَل لكل واحد.`);
}

async function clean() {
  const { rows } = await admin.query<{ id: string; section_id: string }>(
    `select id, section_id from public.programs where slug = $1`,
    [SLUG],
  );
  const program = rows[0];
  if (program) {
    const p = program.id;
    await admin.query(`delete from public.achievements where participant_id in (select id from public.participants where program_id = $1)`, [p]);
    await admin.query(`delete from public.audit_log where actor_id in (select user_id from public.participants where program_id = $1)`, [p]);
    await admin.query(`delete from public.participants where program_id = $1`, [p]);
    await admin.query(`delete from public.plan_days where plan_id in (select pl.id from public.plans pl join public.tracks t on t.id = pl.track_id where t.program_id = $1)`, [p]);
    await admin.query(`delete from public.plans where track_id in (select id from public.tracks where program_id = $1)`, [p]);
    await admin.query(`delete from public.day_template_fields where day_template_id in (select id from public.day_templates where program_id = $1)`, [p]);
    await admin.query(`delete from public.day_templates where program_id = $1`, [p]);
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

async function run(mode: "baseline" | "current") {
  const participants = (await admin.query<Participant>(
    `select pa.id, pa.user_id as uid, pa.track_id as "trackId", pa.program_id as "programId"
     from public.participants pa join public.programs pr on pr.id = pa.program_id
     where pr.slug = $1 and pa.deleted_at is null`,
    [SLUG],
  )).rows;
  if (!participants.length) throw new Error("لا مشاركين — شغّل --seed أولاً.");

  const page = mode === "baseline" ? baselinePage : currentPage;
  const pages: number[] = [];
  const submits: number[] = [];
  let wrongDay = 0;
  let failures = 0;
  const expected = await truths(SLUG);
  const rtt = await roundTrip();

  const started = performance.now();
  await Promise.all(
    participants.map(async (p) => {
      try {
        let t = performance.now();
        const day = await page(p);
        pages.push(performance.now() - t);
        if ((day?.day_number ?? null) !== expected.get(p.id)) wrongDay += 1;
        if (!day) return;

        t = performance.now();
        await submit(p, day);
        submits.push(performance.now() - t);

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
  say(`\n══ ${mode} · ${participants.length} مشاركاً متزامناً · مجمّع ${POOL} اتصالات ══`);
  say(`فتح اليوم : p50 ${ms(percentile(pages, 50))} · p95 ${ms(percentile(pages, 95))} · أقصى ${ms(Math.max(...pages))}`);
  say(`الإرسال   : p50 ${ms(percentile(submits, 50))} · p95 ${ms(percentile(submits, 95))} · أقصى ${ms(Math.max(...submits))}`);
  say(`طلبات REST: ${requests} (${(requests / participants.length).toFixed(1)} لكل مشارك) · رحلة الشبكة من هذا الجهاز: ${ms(rtt)}`);
  say(`يوم جارٍ خاطئ: ${wrongDay} · أخطاء: ${failures} · المدّة الكلية: ${total.toFixed(1)}ث`);
}

try {
  if (args.has("seed")) await seed();
  else if (args.has("clean")) await clean();
  else await run(args.get("run") === "baseline" ? "baseline" : "current");
} finally {
  await Promise.all(clients.map((c) => c.end()));
  await admin.end();
}
