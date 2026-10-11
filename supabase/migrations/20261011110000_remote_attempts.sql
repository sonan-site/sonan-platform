-- 078 | محرّك الاختبار عن بعد (adr/0048)
--
-- ١ · `remote_attempts` و`remote_answers`: محاولةٌ بأسئلتها مسحوبةً مثبَّتة،
--     وإجاباتٌ بأوقاتها. **لا كتابة مباشرة لأحد**: كل كتابة من دوالّ المحرّك.
-- ٢ · بوّابة الدخول `fn_exam_gate`: النافذة · نسبة الإنجاز الآن · الاختبار الشرط
--     · المحاولات. مصدرٌ واحد تعرضه الشاشة ويرفض به البدء.
-- ٣ · المحرّك: `fn_start_attempt` · `fn_attempt_state` · `fn_answer_question`
--     · `fn_skip_question`. **المؤقّت في الخادم**: الجواب بعد وقته (بهامش ثانيتين)
--     لا يُحسب، والسؤال المنقضي يُغلق عند أول طلبٍ تالٍ، والتالي يبدأ وقته حينها —
--     فالمنقطع لا يخسر إلا سؤاله الجاري.
-- ٤ · النتيجة مشتقّة: `fn_attempt_score` و`fn_exam_best` و`fn_exam_results` للإدارة.
-- ٥ · السؤال المستعمَل في محاولة لا يُعدَّل — يُؤرشف ويُضاف بديله.
--
-- تراجع: نعم — حذف الجدولين والدوال، وإعادة `fn_save_question` من الهجرة ٠٧٧.

-- ══ ١ · البنية ══
create table public.remote_attempts (
  id                 uuid primary key default gen_random_uuid(),
  exam_id            uuid not null references public.exams (id) on delete restrict,
  participant_id     uuid not null references public.participants (id) on delete restrict,
  attempt_no         int not null,
  question_ids       uuid[] not null,
  current_index      int not null default 0,
  current_started_at timestamptz not null default now(),
  skips_used         int not null default 0,
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint chk_remote_attempts_no check (attempt_no between 1 and 10),
  constraint chk_remote_attempts_index check (current_index >= 0 and current_index <= cardinality(question_ids))
);

comment on table public.remote_attempts is
  'adr/0048 | الأسئلة تُسحب عند البدء وتُثبَّت. current_started_at أساس المؤقّت في الخادم.';

create unique index uq_remote_attempts_no
  on public.remote_attempts (exam_id, participant_id, attempt_no) where deleted_at is null;
-- محاولةٌ مفتوحة واحدة: البدء الثاني يستأنف الأولى.
create unique index uq_remote_attempts_open
  on public.remote_attempts (exam_id, participant_id) where submitted_at is null and deleted_at is null;
create index idx_remote_attempts_participant on public.remote_attempts (participant_id) where deleted_at is null;

create trigger trg_remote_attempts_updated_at before update on public.remote_attempts
  for each row execute function public.fn_set_updated_at();
alter table public.remote_attempts enable row level security;

create table public.remote_answers (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.remote_attempts (id) on delete restrict,
  question_id         uuid not null references public.questions (id) on delete restrict,
  selected_option_ids uuid[] not null default '{}',
  is_skipped          boolean not null default false,
  answered_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table public.remote_answers is
  'adr/0048 | answered_at فارغ وليس متخطّى = انقضى وقته بلا جواب. والصحّة مشتقّة من is_correct.';

create unique index uq_remote_answers_question on public.remote_answers (attempt_id, question_id);
create trigger trg_remote_answers_updated_at before update on public.remote_answers
  for each row execute function public.fn_set_updated_at();
alter table public.remote_answers enable row level security;

-- ══ السياسات: صاحب المحاولة يقرؤها، ومدير الاختبارات يقرأ محاولات برنامجه ══
create policy remote_attempts_read on public.remote_attempts
  for select to authenticated
  using (exists (
    select 1 from public.participants pa
    where pa.id = participant_id
      and (pa.user_id = (select auth.uid()) or (select public.fn_has_permission('exams.manage', pa.program_id)))
  ));

create policy remote_answers_read on public.remote_answers
  for select to authenticated
  using (exists (
    select 1 from public.remote_attempts a
    join public.participants pa on pa.id = a.participant_id
    where a.id = attempt_id
      and (pa.user_id = (select auth.uid()) or (select public.fn_has_permission('exams.manage', pa.program_id)))
  ));

revoke all on public.remote_attempts, public.remote_answers from anon, authenticated, service_role;
grant select on public.remote_attempts, public.remote_answers to authenticated;

-- ══ ٤ · النتيجة ══
/** صحّة جواب: مجموعة المختار تساوي مجموعة الصحيح تماماً. */
create or replace function public.fn_answer_correct(p_question_id uuid, p_selected uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(cardinality(p_selected), 0) > 0
    and (select coalesce(array_agg(o.id order by o.id), '{}') from public.question_options o
          where o.question_id = p_question_id and o.is_correct and o.deleted_at is null)
      = (select coalesce(array_agg(distinct s order by s), '{}') from unnest(p_selected) s);
$$;
revoke all on function public.fn_answer_correct(uuid, uuid[]) from public;

/** درجة محاولة: الصحيح من أسئلتها النهائية (المتخطّى استُبدل فلا يُعدّ). */
create or replace function public.fn_attempt_score(p_attempt_id uuid)
returns table (score numeric, max_score numeric, percent numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with qs as (
    select q.id, q.score from public.remote_attempts a
    cross join unnest(a.question_ids) as qid
    join public.questions q on q.id = qid
    where a.id = p_attempt_id
  )
  select
    coalesce(sum(qs.score) filter (where public.fn_answer_correct(qs.id, ans.selected_option_ids)), 0),
    coalesce(sum(qs.score), 0),
    case when coalesce(sum(qs.score), 0) = 0 then 0
         else round(100.0 * coalesce(sum(qs.score) filter (where public.fn_answer_correct(qs.id, ans.selected_option_ids)), 0)
                    / sum(qs.score), 1) end
  from qs
  left join public.remote_answers ans
    on ans.attempt_id = p_attempt_id and ans.question_id = qs.id and not ans.is_skipped and ans.deleted_at is null;
$$;
revoke all on function public.fn_attempt_score(uuid) from public;

/** أعلى نسبة بين المحاولات المسلَّمة، وهل بلغت الاجتياز. فارغ = لا محاولة مسلَّمة. */
create or replace function public.fn_exam_best(p_exam_id uuid, p_participant_id uuid)
returns table (best_percent numeric, passed boolean, attempts int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    max(s.percent),
    coalesce(max(s.percent) >= (select e.pass_percentage from public.exams e where e.id = p_exam_id), false),
    (select count(*)::int from public.remote_attempts a2
      where a2.exam_id = p_exam_id and a2.participant_id = p_participant_id and a2.deleted_at is null)
  from public.remote_attempts a
  cross join lateral public.fn_attempt_score(a.id) s
  where a.exam_id = p_exam_id and a.participant_id = p_participant_id
    and a.submitted_at is not null and a.deleted_at is null;
$$;
revoke all on function public.fn_exam_best(uuid, uuid) from public;

-- ══ ٢ · البوّابة ══
/** مشاركة المستدعي في برنامج الاختبار — أو فراغ. */
create or replace function public.fn_exam_participant(p_exam_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pa.id from public.participants pa
  join public.exams e on e.program_id = pa.program_id
  where e.id = p_exam_id and pa.user_id = (select auth.uid()) and pa.deleted_at is null
  limit 1;
$$;
revoke all on function public.fn_exam_participant(uuid) from public;

/**
 * لماذا لا يبدأ المستدعي الاختبار الآن — مصفوفة رسائل، فارغة = يبدأ.
 * والمحاولة المفتوحة ليست مانعاً: البدء يستأنفها.
 */
create or replace function public.fn_exam_gate(p_exam_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e        record;
  pa       record;
  v_pid    uuid := public.fn_exam_participant(p_exam_id);
  v_pct    numeric;
  v_best   record;
  v_pre    record;
  v_out    text[] := '{}';
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or e.exam_type <> 'remote' then
    return array['الاختبار غير متاح'];
  end if;
  if v_pid is null then
    return array['لست مسجّلاً في هذا البرنامج'];
  end if;
  select * into pa from public.participants where id = v_pid;

  if e.track_id is not null and e.track_id is distinct from pa.track_id then
    return array['هذا الاختبار لمسارٍ غير مسارك'];
  end if;
  if not public.fn_follows_plan(pa.status) then
    return array['مشاركتك لا تتيح الاختبار الآن'];
  end if;

  if exists (select 1 from public.remote_attempts
              where exam_id = p_exam_id and participant_id = v_pid and submitted_at is null and deleted_at is null) then
    return v_out;
  end if;

  if e.opens_at is not null and now() < e.opens_at then
    v_out := array_append(v_out, 'لم تُفتح نافذة الاختبار بعد');
  end if;
  if e.closes_at is not null and now() > e.closes_at then
    v_out := array_append(v_out, 'أُغلقت نافذة الاختبار');
  end if;

  if e.entry_percentage is not null then
    select p.percent into v_pct from public.fn_progress_at(v_pid, now()) p;
    if coalesce(v_pct, 0) < e.entry_percentage then
      v_out := array_append(v_out, format('يُفتح لك بإنجاز %s٪ من خطتك — إنجازك الآن %s٪',
        trim_scale(e.entry_percentage), trim_scale(coalesce(v_pct, 0))));
    end if;
  end if;

  if e.prerequisite_exam_id is not null then
    select * into v_pre from public.exams where id = e.prerequisite_exam_id;
    if v_pre.exam_type <> 'remote' or not coalesce((select b.passed from public.fn_exam_best(v_pre.id, v_pid) b), false) then
      v_out := array_append(v_out, format('يُشترط اجتياز «%s» أولاً', v_pre.name));
    end if;
  end if;

  select * into v_best from public.fn_exam_best(p_exam_id, v_pid);
  if v_best.passed then
    v_out := array_append(v_out, 'اجتزت هذا الاختبار');
  elsif coalesce(v_best.attempts, 0) >= e.max_attempts then
    v_out := array_append(v_out, 'استنفدت محاولاتك');
  end if;

  return v_out;
end;
$$;
revoke all on function public.fn_exam_gate(uuid) from public;
grant execute on function public.fn_exam_gate(uuid) to authenticated;

-- ══ ٣ · المحرّك ══
/** الأسئلة التي بلغها المشارك من البنك (`BR-EXAM-01`) — بلا المستبعَد. */
create or replace function public.fn_exam_pool(p_exam_id uuid, p_participant_id uuid, p_exclude uuid[])
returns setof uuid
language sql
volatile
security definer
set search_path = ''
as $$
  with me as (
    select pa.track_id, e.program_id,
           (select p.units from public.fn_progress_at(pa.id, now()) p) as reached
    from public.participants pa join public.exams e on e.id = p_exam_id
    where pa.id = p_participant_id
  )
  select q.id
  from public.questions q
  join public.content_units u on u.id = q.content_unit_id
  cross join me
  where q.program_id = me.program_id and q.deleted_at is null
    and (q.track_id is null or q.track_id = me.track_id)
    and public.fn_track_ordinal_of(me.track_id, u.sequence) between 1 and coalesce(me.reached, 0)
    and not (q.id = any(coalesce(p_exclude, '{}')))
  order by random();
$$;
revoke all on function public.fn_exam_pool(uuid, uuid, uuid[]) from public;

/** حالة المحاولة للمشارك — وتُغلق سؤالها المنقضي أولاً. الصحيح لا يُرسل أبداً. */
create or replace function public.fn_attempt_state(p_attempt_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a      record;
  e      record;
  v_qid  uuid;
  v_q    record;
  v_s    record;
  v_left numeric;
begin
  select at.* into a from public.remote_attempts at
  join public.participants pa on pa.id = at.participant_id
  where at.id = p_attempt_id and at.deleted_at is null and pa.user_id = (select auth.uid());
  if a.id is null then
    raise exception 'المحاولة غير موجودة' using errcode = 'P0002';
  end if;
  select * into e from public.exams where id = a.exam_id;

  -- السؤال المنقضي يُغلق بلا جواب، والتالي يبدأ وقته الآن.
  if a.submitted_at is null
     and now() > a.current_started_at + make_interval(secs => e.seconds_per_question + 2) then
    insert into public.remote_answers (attempt_id, question_id)
    values (a.id, a.question_ids[a.current_index + 1])
    on conflict (attempt_id, question_id) do nothing;
    update public.remote_attempts
       set current_index = current_index + 1, current_started_at = now(),
           submitted_at = case when current_index + 1 >= cardinality(question_ids) then now() end
     where id = a.id
    returning * into a;
  end if;

  if a.submitted_at is not null then
    select * into v_s from public.fn_attempt_score(a.id);
    return jsonb_build_object(
      'status', 'submitted', 'exam', e.name, 'attempt_no', a.attempt_no,
      'score', v_s.score, 'max', v_s.max_score, 'percent', v_s.percent,
      'passed', v_s.percent >= e.pass_percentage, 'pass_percentage', e.pass_percentage
    );
  end if;

  v_qid := a.question_ids[a.current_index + 1];
  select q.id, q.text, q.question_type into v_q from public.questions q where q.id = v_qid;
  v_left := greatest(0, e.seconds_per_question - extract(epoch from now() - a.current_started_at));

  return jsonb_build_object(
    'status', 'open', 'exam', e.name, 'attempt_no', a.attempt_no,
    'index', a.current_index + 1, 'total', cardinality(a.question_ids),
    'seconds_left', floor(v_left), 'seconds_per_question', e.seconds_per_question,
    'skips_left', greatest(0, e.max_skips - a.skips_used),
    'question', jsonb_build_object(
      'id', v_q.id, 'text', v_q.text, 'type', v_q.question_type,
      'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by o.sort_order), '[]')
                  from public.question_options o where o.question_id = v_q.id and o.deleted_at is null)
    )
  );
end;
$$;
revoke all on function public.fn_attempt_state(uuid) from public;
grant execute on function public.fn_attempt_state(uuid) to authenticated;

/** يبدأ محاولة — أو يستأنف المفتوحة. يُرجع معرّفها. */
create or replace function public.fn_start_attempt(p_exam_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e        record;
  v_pid    uuid := public.fn_exam_participant(p_exam_id);
  v_gate   text[];
  v_open   uuid;
  v_ids    uuid[];
  v_no     int;
  v_id     uuid;
begin
  if not public.fn_is_active() then
    raise exception 'حسابك موقوف' using errcode = '42501';
  end if;
  v_gate := public.fn_exam_gate(p_exam_id);
  if cardinality(v_gate) > 0 then
    raise exception '%', v_gate[1] using errcode = '23514';
  end if;

  -- قفلٌ على المشارك والاختبار: نقرتان متزامنتان لا تفتحان محاولتين.
  perform pg_advisory_xact_lock(hashtextextended('attempt:' || p_exam_id::text || v_pid::text, 0));

  select id into v_open from public.remote_attempts
  where exam_id = p_exam_id and participant_id = v_pid and submitted_at is null and deleted_at is null;
  if v_open is not null then
    return v_open;
  end if;

  select * into e from public.exams where id = p_exam_id;
  select array_agg(x) into v_ids from (
    select x from public.fn_exam_pool(p_exam_id, v_pid, '{}') x limit e.question_count
  ) t;
  if coalesce(cardinality(v_ids), 0) < e.question_count then
    raise exception 'أسئلة الاختبار لما بلغته لم تكتمل بعد — تواصل مع إدارة البرنامج'
      using errcode = '23514';
  end if;

  select coalesce(max(attempt_no), 0) + 1 into v_no from public.remote_attempts
  where exam_id = p_exam_id and participant_id = v_pid and deleted_at is null;

  insert into public.remote_attempts (exam_id, participant_id, attempt_no, question_ids)
  values (p_exam_id, v_pid, v_no, v_ids)
  returning id into v_id;

  -- لا تدقيق: سجلّ التدقيق للأفعال الإدارية، والمحاولة نفسها سجلٌّ بوقت بدئها.
  return v_id;
end;
$$;
revoke all on function public.fn_start_attempt(uuid) from public;
grant execute on function public.fn_start_attempt(uuid) to authenticated;

/** جواب السؤال الجاري ثم التالي. جوابٌ عن غير الجاري أو بعد وقته لا يُحسب. */
create or replace function public.fn_answer_question(p_attempt_id uuid, p_question_id uuid, p_option_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a record;
  e record;
begin
  select at.* into a from public.remote_attempts at
  join public.participants pa on pa.id = at.participant_id
  where at.id = p_attempt_id and at.deleted_at is null and at.submitted_at is null
    and pa.user_id = (select auth.uid())
  for update of at;
  if a.id is null then
    return public.fn_attempt_state(p_attempt_id);
  end if;
  select * into e from public.exams where id = a.exam_id;

  if a.question_ids[a.current_index + 1] = p_question_id
     and now() <= a.current_started_at + make_interval(secs => e.seconds_per_question + 2) then
    -- خياراتٌ من السؤال نفسه وحده: لا يُحسب معرّفٌ دخيل.
    insert into public.remote_answers (attempt_id, question_id, selected_option_ids, answered_at)
    values (a.id, p_question_id,
            coalesce((select array_agg(o.id) from public.question_options o
                       where o.question_id = p_question_id and o.deleted_at is null
                         and o.id = any(coalesce(p_option_ids, '{}'))), '{}'),
            now())
    on conflict (attempt_id, question_id) do nothing;
    update public.remote_attempts
       set current_index = current_index + 1, current_started_at = now(),
           submitted_at = case when current_index + 1 >= cardinality(question_ids) then now() end
     where id = a.id;
  end if;

  return public.fn_attempt_state(p_attempt_id);
end;
$$;
revoke all on function public.fn_answer_question(uuid, uuid, uuid[]) from public;
grant execute on function public.fn_answer_question(uuid, uuid, uuid[]) to authenticated;

/** تخطّي السؤال الجاري ضمن حدّه: يُستبدل بسؤالٍ من النطاق لم يُسحب، بوقتٍ جديد. */
create or replace function public.fn_skip_question(p_attempt_id uuid, p_question_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a       record;
  e       record;
  v_new   uuid;
  v_seen  uuid[];
begin
  select at.* into a from public.remote_attempts at
  join public.participants pa on pa.id = at.participant_id
  where at.id = p_attempt_id and at.deleted_at is null and at.submitted_at is null
    and pa.user_id = (select auth.uid())
  for update of at;
  if a.id is null then
    return public.fn_attempt_state(p_attempt_id);
  end if;
  select * into e from public.exams where id = a.exam_id;

  if a.question_ids[a.current_index + 1] <> p_question_id
     or now() > a.current_started_at + make_interval(secs => e.seconds_per_question + 2) then
    return public.fn_attempt_state(p_attempt_id);
  end if;
  if a.skips_used >= e.max_skips then
    raise exception 'استنفدت حدّ التخطّي' using errcode = '23514';
  end if;

  v_seen := a.question_ids || coalesce((select array_agg(question_id) from public.remote_answers where attempt_id = a.id), '{}');
  select x into v_new from public.fn_exam_pool(a.exam_id, a.participant_id, v_seen) x limit 1;
  if v_new is null then
    raise exception 'لا سؤال بديلاً — أجب عن هذا السؤال' using errcode = '23514';
  end if;

  insert into public.remote_answers (attempt_id, question_id, is_skipped, answered_at)
  values (a.id, p_question_id, true, now())
  on conflict (attempt_id, question_id) do nothing;
  update public.remote_attempts
     set question_ids[current_index + 1] = v_new, skips_used = skips_used + 1, current_started_at = now()
   where id = a.id;

  return public.fn_attempt_state(p_attempt_id);
end;
$$;
revoke all on function public.fn_skip_question(uuid, uuid) from public;
grant execute on function public.fn_skip_question(uuid, uuid) to authenticated;

-- ══ ٤ب · نتائج الإدارة ══
create or replace function public.fn_exam_results(p_exam_id uuid)
returns table (
  participant_id uuid, full_name text, registration_no int, track_id uuid,
  attempts int, open_attempt boolean, best_percent numeric, passed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program uuid := (select program_id from public.exams where id = p_exam_id);
begin
  if v_program is null or not public.fn_has_permission('exams.manage', v_program) then
    raise exception 'لا تملك عرض نتائج هذا الاختبار' using errcode = '42501';
  end if;
  return query
    select pa.id, pr.full_name, pa.registration_no, pa.track_id,
           coalesce(b.attempts, 0),
           exists (select 1 from public.remote_attempts a where a.exam_id = p_exam_id and a.participant_id = pa.id
                     and a.submitted_at is null and a.deleted_at is null),
           b.best_percent, coalesce(b.passed, false)
    from public.participants pa
    join public.profiles pr on pr.user_id = pa.user_id
    cross join lateral public.fn_exam_best(p_exam_id, pa.id) b
    where pa.program_id = v_program and pa.deleted_at is null
      and exists (select 1 from public.remote_attempts a where a.exam_id = p_exam_id and a.participant_id = pa.id
                    and a.deleted_at is null)
    order by b.best_percent desc nulls last, pa.registration_no;
end;
$$;
revoke all on function public.fn_exam_results(uuid) from public;
grant execute on function public.fn_exam_results(uuid) to authenticated;

-- ══ ٥ · السؤال المستعمَل لا يُعدَّل ══
create or replace function public.fn_guard_used_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- الأرشفة وحدها مسموحة: تُخرجه من السحب ولا تمسّ ما سبق.
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;
  if exists (select 1 from public.remote_attempts a where old.id = any(a.question_ids))
     or exists (select 1 from public.remote_answers r where r.question_id = old.id) then
    raise exception 'استُعمل هذا السؤال في اختبار — أرشفه وأضف بديله' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_questions_guard_used before update on public.questions
  for each row execute function public.fn_guard_used_question();
