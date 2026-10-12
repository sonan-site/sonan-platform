import pg from "pg";

/**
 * قياس كلفة الاختبارات — **يدويّ، خارج CI، على قاعدةٍ محلية** (مراجعة ١١ أكتوبر، ب٨).
 *
 *   pnpm load:journey -- --seed --users=400   أولاً: برنامجٌ بمشاركين وتقدّم
 *   node tech/load/exams-load.ts --seed       اختباران وبنكٌ بـ١٠٠٠ سؤالٍ عن بعد و٣٠٠ شفهي
 *   node tech/load/exams-load.ts --run        القياس
 *   node tech/load/exams-load.ts --clean      يُزيل ما بذره (قبل --clean لقياس الرحلة)
 *
 * **ما يقيسه:** (١) `fn_my_exams` لكل مشارك في أسبوع النافذة — ما تضيفه «رحلتي»
 * إلى كل فتح، ومعه `fn_journey_state` للمقارنة. (٢) `fn_final_eligibility` و
 * `fn_bank_coverage` مرّةً للإدارة. (٣) **ذروة المرحلي:** ١٠٠ مشارك يبدؤون معاً
 * ويجيبون عشرين سؤالاً بأسرع ما يمكن — أسوأ من الواقع عمداً، والقفل الجديد فيه.
 *
 * **ما لا يقيسه:** الشبكة وخادم Next. والقاعدة المحلية غير Supabase — الرقم
 * **رتبةٌ** لا وعد: يُقرأ الفرق بين الدوالّ لا الزمن المطلق.
 */

const say = (line: string) => process.stdout.write(line + String.fromCharCode(10));

const URL = process.env.SUPABASE_DB_URL;
if (!URL) throw new Error("SUPABASE_DB_URL غير مضبوط.");
if (!/localhost|127\.0\.0\.1/.test(new globalThis.URL(URL).hostname)) {
  throw new Error("القياس على قاعدةٍ محلية وحدها — يكتب مشاركين ومحاولات.");
}

const SLUG = "load-journey";
const ADMIN = "00000000-0000-4000-9000-0000000ad111";
const POOL = 10;
const PEAK = 100;

const admin = new pg.Client({ connectionString: URL });
await admin.connect();

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

/** طلبٌ بهويّة المستخدم في رحلة شبكة واحدة — كواجهة REST. يُرجع الصفوف والزمن. */
async function rest<T extends pg.QueryResultRow>(uid: string, sql: string): Promise<{ rows: T[]; ms: number }> {
  const c = await acquire();
  const claims = c.escapeLiteral(JSON.stringify({ sub: uid, role: "authenticated" }));
  const t = performance.now();
  try {
    const results = (await c.query(
      `begin; set local role authenticated;
       select set_config('request.jwt.claims', ${claims}, true);
       ${sql};
       commit;`,
    )) as unknown as pg.QueryResult<T>[];
    return { rows: results[3]!.rows, ms: performance.now() - t };
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    release(c);
  }
}

const pct = (values: number[], p: number) => {
  const s = [...values].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0);
};
const report = (label: string, values: number[]) =>
  say(`${label}: الوسيط ${pct(values, 50)} م.ث · ٩٥٪ ${pct(values, 95)} م.ث · الأقصى ${pct(values, 100)} م.ث (${values.length})`);

async function programId(): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(`select id from public.programs where slug = $1`, [SLUG]);
  if (!rows[0]) throw new Error("ابذر الرحلة أولاً: pnpm load:journey -- --seed --users=400");
  return rows[0].id;
}

async function seed() {
  const pid = await programId();
  const { rows: had } = await admin.query(`select 1 from public.exams where program_id = $1`, [pid]);
  if (had.length) throw new Error("مبذورٌ سلفاً — شغّل --clean أولاً.");

  // البنك مباشرةً بمالك القاعدة: القياس للقراءة والمحاولة لا للإدخال.
  await admin.query(
    `with q as (
       insert into public.questions (program_id, content_unit_id, text, question_type, usage, score, correct_answer_text)
       select $1, u.id, 'سؤال قياس ' || g, 'single', 'remote', 1, ''
       from generate_series(1, 1000) g
       join public.content_units u on u.program_id = $1 and u.sequence = 1 + (g * 7) % 1200
       returning id
     )
     insert into public.question_options (question_id, text, is_correct, sort_order)
     select id, o.t, o.c, o.n from q cross join (values ('صحيح', true, 0), ('خطأ', false, 1), ('خطأ آخر', false, 2)) as o(t, c, n)`,
    [pid],
  );
  await admin.query(
    `insert into public.questions (program_id, content_unit_id, text, question_type, usage, score, correct_answer_text)
     select $1, u.id, 'سمّع ' || g, 'open', 'oral', 2, 'نصّ الجواب'
     from generate_series(1, 300) g
     join public.content_units u on u.program_id = $1 and u.sequence = 1 + (g * 13) % 1200`,
    [pid],
  );

  const interim = (
    await admin.query<{ id: string }>(
      `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, seconds_per_question,
                                 max_skips, max_attempts, entry_percentage, opens_at, closes_at)
       values ($1, 'مرحلي القياس', 'remote', 'interim', 80, 20, 60, 0, 2, 0, now() - interval '1 day', now() + interval '6 days')
       returning id`,
      [pid],
    )
  ).rows[0]!.id;
  await admin.query(
    `insert into public.exams (program_id, name, exam_type, stage, pass_percentage, question_count, judge_count,
                               award_percentage, entry_percentage, prerequisite_exam_id, eligibility_at)
     values ($1, 'نهائي القياس', 'oral', 'final', 80, 15, 3, 90, 100, $2, now() - interval '1 hour')`,
    [pid, interim],
  );

  await admin.query(`insert into auth.users (id, email, aud, role) values ($1, 'load-admin@test.local', 'authenticated', 'authenticated')`, [ADMIN]);
  await admin.query(`insert into public.profiles (user_id, full_name) values ($1, 'مدير القياس')`, [ADMIN]);
  const role = (await admin.query<{ id: string }>(`insert into public.roles (name) values ('دور قياس الاختبارات') returning id`)).rows[0]!.id;
  for (const code of ["exams.manage", "participants.read"]) {
    await admin.query(`insert into public.role_permissions (role_id, permission_code) values ($1, $2)`, [role, code]);
  }
  await admin.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [ADMIN, role]);
  say("بُذر: اختباران، ١٠٠٠ سؤالٍ عن بعد و٣٠٠ شفهي، ومدير اختبارات.");
}

async function run() {
  const pid = await programId();
  const exams = (await admin.query<{ id: string; exam_type: string }>(`select id, exam_type from public.exams where program_id = $1`, [pid])).rows;
  const interim = exams.find((e) => e.exam_type === "remote")!.id;
  const final = exams.find((e) => e.exam_type === "oral")!.id;
  const people = (
    await admin.query<{ id: string; uid: string }>(`select id, user_id as uid from public.participants where program_id = $1`, [pid])
  ).rows;

  // ١ · «رحلتي»: بإضافة الاختبارات ودونها — الجميع في اللحظة نفسها.
  const journey = await Promise.all(people.map((p) => rest(p.uid, `select public.fn_journey_state('${p.id}')`).then((r) => r.ms)));
  report("fn_journey_state", journey);
  const mine = await Promise.all(people.map((p) => rest(p.uid, `select * from public.fn_my_exams('${p.id}')`).then((r) => r.ms)));
  report("fn_my_exams (أسبوع النافذة)", mine);

  // ٢ · الإدارة.
  report("fn_final_eligibility (٤٠٠)", [(await rest(ADMIN, `select * from public.fn_final_eligibility('${final}')`)).ms]);
  report("fn_bank_coverage", [(await rest(ADMIN, `select * from public.fn_bank_coverage('${pid}')`)).ms]);

  // ٣ · الذروة: ١٠٠ يبدؤون معاً ثم يجيبون عشرين بأسرع ما يمكن.
  const crowd = people.slice(0, PEAK);
  const starts: number[] = [];
  const answers: number[] = [];
  const t0 = performance.now();
  await Promise.all(
    crowd.map(async (p) => {
      const s = await rest<{ id: string }>(p.uid, `select public.fn_start_attempt('${interim}') as id`);
      starts.push(s.ms);
      const attempt = s.rows[0]!.id;
      for (let i = 0; i < 20; i += 1) {
        const st = await rest<{ s: { status: string; question?: { id: string; options: { id: string }[] } } }>(
          p.uid,
          `select public.fn_attempt_state('${attempt}') as s`,
        );
        const q = st.rows[0]!.s.question;
        if (st.rows[0]!.s.status !== "open" || !q) break;
        const a = await rest(p.uid, `select public.fn_answer_question('${attempt}', '${q.id}', array['${q.options[0]!.id}']::uuid[])`);
        answers.push(a.ms);
      }
    }),
  );
  report("fn_start_attempt (١٠٠ معاً)", starts);
  report("fn_answer_question (الذروة)", answers);
  say(`الذروة كلها: ${Math.round((performance.now() - t0) / 1000)} ث لـ${PEAK} × ٢٠ سؤالاً.`);
}

async function clean() {
  const pid = await programId();
  await admin.query(`delete from public.remote_answers where attempt_id in (select a.id from public.remote_attempts a join public.exams e on e.id = a.exam_id where e.program_id = $1)`, [pid]);
  await admin.query(`delete from public.remote_attempts where exam_id in (select id from public.exams where program_id = $1)`, [pid]);
  await admin.query(`update public.exams set prerequisite_exam_id = null where program_id = $1`, [pid]);
  await admin.query(`delete from public.exams where program_id = $1`, [pid]);
  await admin.query(`delete from public.question_options where question_id in (select id from public.questions where program_id = $1)`, [pid]);
  await admin.query(`delete from public.questions where program_id = $1`, [pid]);
  await admin.query(`delete from public.audit_log where actor_id = $1`, [ADMIN]);
  await admin.query(`delete from public.user_roles where user_id = $1`, [ADMIN]);
  await admin.query(`delete from public.role_permissions where role_id in (select id from public.roles where name = 'دور قياس الاختبارات')`);
  await admin.query(`delete from public.roles where name = 'دور قياس الاختبارات'`);
  await admin.query(`delete from public.profiles where user_id = $1`, [ADMIN]);
  await admin.query(`delete from auth.users where id = $1`, [ADMIN]);
  say("أُزيل ما بُذر للاختبارات.");
}

try {
  const mode = process.argv[2];
  if (mode === "--seed") await seed();
  else if (mode === "--run") await run();
  else if (mode === "--clean") await clean();
  else say("استعمل --seed أو --run أو --clean");
} finally {
  await Promise.all(clients.map((c) => c.end()));
  await admin.end();
}
