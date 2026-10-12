-- 086 | تحصين المرحلي قبل نافذته (مراجعة ١١ أكتوبر، الدفعة ب)
--
-- ١ · السباق (م٢): دوالّ المحاولة تقفل صفّها قبل قراءة المؤشر، والتحديث مشروطٌ به.
-- ٢ · المهلة (م٣): لكل محاولةٍ مهلةٌ **ثابتة** = أبعد الإغلاق وتشغيلٍ متصلٍ من بدئها.
--     المنقضيةُ مهلتُها مسلَّمةٌ حكماً في كل قراءة، ويفرضها كل كاتب، ويختمها
--     `fn_seal_expired_attempts` فعلاً (من الفرز والنتائج وتعديل الإغلاق).
-- ٣ · الكتابة المباشرة (م٤): لا إدراج للأسئلة ولا للخيارات إلا من الدالة، وتحديث
--     السؤال على أرشفته وحدها. وحارسا السؤال المستعمَل والمعيار المستعمَل.
-- ٤ · قفل الإعدادات (م٤): ما يغيّر نتيجةً قائمة يُقفل بعد البدء، والمخرج الإداري
--     بسببٍ مدقَّق. وكل تغييرٍ في الإعدادات يُدقَّق بقبل/بعد.
-- ٥ · تنوّع المحاولة: ما لم يُسأل في محاولاته أولاً — في البدء والتخطّي.
-- ٦ · التغطية: المطلوب = الأسئلة + حدّ التخطّي.
--
-- تراجع: نعم — إعادة الدوال من ٠٧٨ و٠٨٣ و٠٨٥، وإعادة المنح والسياسات، وحذف
-- الحارسين والدوال الجديدة.

-- ══ ٢ · المهلة ══
/** مهلة المحاولة — فارغ = بلا مهلة (اختبارٌ بلا إغلاق). ثابتةٌ لا تتحرك بالإجابة. */
create or replace function public.fn_attempt_deadline(p_attempt_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when e.closes_at is null then null
              else greatest(e.closes_at,
                            a.started_at + make_interval(secs => (e.question_count + coalesce(e.max_skips, 0))
                                                                 * (e.seconds_per_question + 2)))
         end
  from public.remote_attempts a join public.exams e on e.id = a.exam_id
  where a.id = p_attempt_id;
$$;
revoke all on function public.fn_attempt_deadline(uuid) from public, anon, authenticated;

/** مسلَّمةٌ فعلاً أو حكماً. */
create or replace function public.fn_attempt_done(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a.submitted_at is not null
         or coalesce(now() > public.fn_attempt_deadline(a.id), false)
  from public.remote_attempts a where a.id = p_attempt_id;
$$;
revoke all on function public.fn_attempt_done(uuid) from public, anon, authenticated;

/** يختم المحاولات المنقضية مهلتُها بتاريخ مهلتها. يُرجع عددها. */
create or replace function public.fn_seal_expired_attempts(p_exam_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.remote_attempts a
     set submitted_at = public.fn_attempt_deadline(a.id)
   where a.exam_id = p_exam_id and a.submitted_at is null and a.deleted_at is null
     and now() > public.fn_attempt_deadline(a.id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.fn_seal_expired_attempts(uuid) from public, anon, authenticated;

/** للإدارة: ختمٌ قبل قراءة النتائج. */
create or replace function public.fn_seal_exam(p_exam_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('exams.manage', (select program_id from public.exams where id = p_exam_id)) then
    raise exception 'لا تملك إدارة هذا الاختبار' using errcode = '42501';
  end if;
  return public.fn_seal_expired_attempts(p_exam_id);
end;
$$;
revoke all on function public.fn_seal_exam(uuid) from public;
grant execute on function public.fn_seal_exam(uuid) to authenticated;

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
    and a.deleted_at is null and public.fn_attempt_done(a.id);
$$;

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

  -- المفتوحة تُستأنف ما لم تنقضِ مهلتها.
  if exists (select 1 from public.remote_attempts a
              where a.exam_id = p_exam_id and a.participant_id = v_pid and a.submitted_at is null
                and a.deleted_at is null and not public.fn_attempt_done(a.id)) then
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

-- ══ ١ · الحالة والجواب والتخطّي — بقفلٍ وتحديثٍ مشروط ══
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
  where at.id = p_attempt_id and at.deleted_at is null and pa.user_id = (select auth.uid())
  for update of at;
  if a.id is null then
    raise exception 'المحاولة غير موجودة' using errcode = 'P0002';
  end if;
  select * into e from public.exams where id = a.exam_id;

  -- انقضت مهلتها: تُختم كما هي.
  if a.submitted_at is null and public.fn_attempt_done(a.id) then
    update public.remote_attempts set submitted_at = public.fn_attempt_deadline(a.id)
     where id = a.id returning * into a;
  end if;

  -- السؤال المنقضي يُغلق بلا جواب، والتالي يبدأ وقته الآن — مشروطاً بالمؤشر المقروء.
  if a.submitted_at is null
     and now() > a.current_started_at + make_interval(secs => e.seconds_per_question + 2) then
    insert into public.remote_answers (attempt_id, question_id)
    values (a.id, a.question_ids[a.current_index + 1])
    on conflict (attempt_id, question_id) do nothing;
    update public.remote_attempts
       set current_index = current_index + 1, current_started_at = now(),
           submitted_at = case when current_index + 1 >= cardinality(question_ids) then now() end
     where id = a.id and current_index = a.current_index
    returning * into a;
    if a.id is null then
      select * into a from public.remote_attempts where id = p_attempt_id;
    end if;
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

/** جواب السؤال الجاري ثم التالي. والمرفوض (غير الجاري أو بعد وقته أو بعد المهلة) يُعلَم بـ`late`. */
create or replace function public.fn_answer_question(p_attempt_id uuid, p_question_id uuid, p_option_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a      record;
  e      record;
  v_ok   boolean := false;
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

  if not public.fn_attempt_done(a.id)
     and a.question_ids[a.current_index + 1] = p_question_id
     and now() <= a.current_started_at + make_interval(secs => e.seconds_per_question + 2) then
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
     where id = a.id and current_index = a.current_index;
    v_ok := found;
  end if;

  return public.fn_attempt_state(p_attempt_id) || jsonb_build_object('late', not v_ok);
end;
$$;

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
  v_prior uuid[];
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

  if public.fn_attempt_done(a.id)
     or a.question_ids[a.current_index + 1] <> p_question_id
     or now() > a.current_started_at + make_interval(secs => e.seconds_per_question + 2) then
    return public.fn_attempt_state(p_attempt_id) || jsonb_build_object('late', true);
  end if;
  if a.skips_used >= e.max_skips then
    raise exception 'استنفدت حدّ التخطّي' using errcode = '23514';
  end if;

  v_seen := a.question_ids || coalesce((select array_agg(question_id) from public.remote_answers where attempt_id = a.id), '{}');
  -- ما سُئل في محاولاته السابقة يأتي آخراً.
  v_prior := coalesce((select array_agg(x) from public.remote_attempts p cross join unnest(p.question_ids) x
                        where p.exam_id = a.exam_id and p.participant_id = a.participant_id and p.id <> a.id
                          and p.deleted_at is null), '{}');
  select x into v_new from public.fn_exam_pool(a.exam_id, a.participant_id, v_seen) x
  order by (x = any(v_prior)), random() limit 1;
  if v_new is null then
    raise exception 'لا سؤال بديلاً — أجب عن هذا السؤال' using errcode = '23514';
  end if;

  insert into public.remote_answers (attempt_id, question_id, is_skipped, answered_at)
  values (a.id, p_question_id, true, now())
  on conflict (attempt_id, question_id) do nothing;
  update public.remote_attempts
     set question_ids[current_index + 1] = v_new, skips_used = skips_used + 1, current_started_at = now()
   where id = a.id and current_index = a.current_index;

  return public.fn_attempt_state(p_attempt_id);
end;
$$;

-- ══ ٥ · البدء بتنوّع ══
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
  v_prior  uuid[];
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

  perform pg_advisory_xact_lock(hashtextextended('attempt:' || p_exam_id::text || v_pid::text, 0));

  -- المنقضية تُختم أولاً: لا تحجز مكان المحاولة المفتوحة.
  perform public.fn_seal_expired_attempts(p_exam_id);

  select id into v_open from public.remote_attempts
  where exam_id = p_exam_id and participant_id = v_pid and submitted_at is null and deleted_at is null;
  if v_open is not null then
    return v_open;
  end if;

  select * into e from public.exams where id = p_exam_id;
  v_prior := coalesce((select array_agg(x) from public.remote_attempts p cross join unnest(p.question_ids) x
                        where p.exam_id = p_exam_id and p.participant_id = v_pid and p.deleted_at is null), '{}');
  select array_agg(x) into v_ids from (
    select x from public.fn_exam_pool(p_exam_id, v_pid, '{}') x
    order by (x = any(v_prior)), random()
    limit e.question_count
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

-- ══ القراءات تقرأ «المسلَّمة» من دالتها ══
create or replace function public.fn_my_exams(p_participant_id uuid)
returns table (
  exam_id uuid, name text, stage public.exam_stage,
  opens_at timestamptz, closes_at timestamptz,
  question_count int, seconds_per_question int, max_skips int, max_attempts int,
  pass_percentage numeric, entry_percentage numeric,
  attempts int, best_percent numeric, passed boolean, open_attempt_id uuid, blockers text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pa record;
begin
  select * into pa from public.participants
  where id = p_participant_id and deleted_at is null and user_id = (select auth.uid());
  if pa.id is null then
    return;
  end if;

  return query
    select e.id, e.name, e.stage, e.opens_at, e.closes_at,
           e.question_count, e.seconds_per_question, e.max_skips, e.max_attempts,
           e.pass_percentage, e.entry_percentage,
           coalesce(b.attempts, 0), b.best_percent, coalesce(b.passed, false),
           (select a.id from public.remote_attempts a
             where a.exam_id = e.id and a.participant_id = pa.id and a.submitted_at is null
               and a.deleted_at is null and not public.fn_attempt_done(a.id)),
           public.fn_exam_gate(e.id)
    from public.exams e
    cross join lateral public.fn_exam_best(e.id, pa.id) b
    where e.program_id = pa.program_id and e.deleted_at is null and e.exam_type = 'remote'
      and (e.track_id is null or e.track_id = pa.track_id)
      and (e.opens_at is null or now() >= e.opens_at - interval '7 days')
    order by e.opens_at nulls first, e.created_at;
end;
$$;

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
                     and a.submitted_at is null and a.deleted_at is null and not public.fn_attempt_done(a.id)),
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

-- الفرز يختم الشرط قبل أن يقرأه.
create or replace function public.fn_apply_sorting(p_exam_id uuid, p_overrides jsonb default '{}'::jsonb)
returns table (qualified int, not_qualified int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e        record;
  v_q      int := 0;
  v_n      int := 0;
  r        record;
  v_final  boolean;
  v_over   jsonb := coalesce(p_overrides, '{}'::jsonb);
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;
  if e.eligibility_at is null then
    raise exception 'حدّد لحظة احتساب الإنجاز في إعدادات الاختبار أولاً' using errcode = '23514';
  end if;
  if now() < e.eligibility_at then
    raise exception 'لا يُحسم الفرز قبل لحظة احتساب الإنجاز' using errcode = '23514';
  end if;
  if e.prerequisite_exam_id is not null then
    perform public.fn_seal_expired_attempts(e.prerequisite_exam_id);
  end if;

  for r in select * from public.fn_final_eligibility(p_exam_id) loop
    v_final := coalesce((v_over ->> r.participant_id::text)::boolean, r.eligible);
    update public.participants
       set status = case when v_final then 'qualified'::public.participant_status else 'not_qualified'::public.participant_status end
     where id = r.participant_id;
    if v_final then v_q := v_q + 1; else v_n := v_n + 1; end if;
  end loop;

  perform public.fn_write_audit('exam_sorting_applied', 'exams', p_exam_id, null,
    jsonb_build_object('qualified', v_q, 'not_qualified', v_n, 'overrides', v_over));

  qualified := v_q;
  not_qualified := v_n;
  return next;
end;
$$;

-- ══ ٣ · الكتابة المباشرة ══
drop policy questions_manage_insert on public.questions;
drop policy question_options_manage_insert on public.question_options;
drop policy question_options_manage_update on public.question_options;
revoke insert, update on public.questions from authenticated;
revoke insert, update on public.question_options from authenticated;
-- الأرشفة وحدها: تغيير النوع مباشرةً يُنتج «مفرداً» بصحيحين.
grant update (deleted_at) on public.questions to authenticated;

create or replace function public.fn_guard_used_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;
  if exists (select 1 from public.remote_attempts a where old.id = any(a.question_ids))
     or exists (select 1 from public.remote_answers r where r.question_id = old.id)
     or exists (select 1 from public.session_participants sp where old.id = any(sp.question_ids) and sp.deleted_at is null)
     or exists (select 1 from public.evaluation_answers ea where ea.question_id = old.id) then
    raise exception 'استُعمل هذا السؤال في اختبار — أرشفه وأضف بديله' using errcode = '23514';
  end if;
  return new;
end;
$$;

/** المعيار المستعمَل: اسمه وقيمته وسؤاله وبرنامجه لا تتغيّر — درجاتٌ مُحتسبة به. */
create or replace function public.fn_guard_used_criterion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.label, new.deduction_value, new.question_id, new.program_id)
     is not distinct from (old.label, old.deduction_value, old.question_id, old.program_id) then
    return new;
  end if;
  if exists (select 1 from public.evaluation_deductions d where d.criterion_id = old.id) then
    raise exception 'خُصم بهذا المعيار في تقييم — أرشفه وأضف بديله' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_deduction_criteria_guard_used before update on public.deduction_criteria
  for each row execute function public.fn_guard_used_criterion();

-- ══ ٤ · قفل الإعدادات ══
/**
 * ما يغيّر نتيجةً قائمة يُقفل بعد البدء (أول محاولة · أول إسناد · الحسم)، إلا
 * بالمخرج الإداري `fn_override_exam_settings` (متغيّرٌ محلي يحمل معرّف الاختبار).
 * والنوع والبرنامج لا يتغيّران أبداً. وكل تغييرٍ يُدقَّق، وتعديل الإغلاق يختم أولاً.
 */
create or replace function public.fn_guard_exam_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started boolean;
  v_sorted  boolean;
  v_override boolean := coalesce(current_setting('app.exam_override', true), '') = old.id::text;
  v_locked  text[] := '{}';
  v_before  jsonb := '{}';
  v_after   jsonb := '{}';
  k         text;
  -- رسالة القفل بلغة المسؤول لا باسم العمود.
  v_label   jsonb := '{"pass_percentage": "نسبة الاجتياز", "question_count": "عدد الأسئلة",
                      "seconds_per_question": "زمن السؤال", "max_skips": "حدّ التخطّي", "track_id": "المسار",
                      "judge_count": "عدد المحكّمين", "award_percentage": "نسبة أهلية الجائزة",
                      "entry_percentage": "نسبة الدخول", "prerequisite_exam_id": "الاختبار الشرط",
                      "eligibility_at": "لحظة احتساب الإنجاز"}';
begin
  if new.exam_type is distinct from old.exam_type or new.program_id is distinct from old.program_id then
    raise exception 'نوع الاختبار وبرنامجه لا يتغيّران' using errcode = '23514';
  end if;

  if old.exam_type = 'remote' then
    v_started := exists (select 1 from public.remote_attempts where exam_id = old.id);
    if v_started then
      v_locked := array['pass_percentage', 'question_count', 'seconds_per_question', 'max_skips', 'track_id'];
    end if;
  else
    v_started := exists (select 1 from public.session_participants sp join public.exam_sessions s on s.id = sp.session_id
                          where s.exam_id = old.id);
    v_sorted := exists (select 1 from public.audit_log where action = 'exam_sorting_applied' and entity_id = old.id);
    if v_started or v_sorted then
      v_locked := array['pass_percentage', 'question_count', 'judge_count', 'award_percentage',
                        'entry_percentage', 'prerequisite_exam_id', 'eligibility_at', 'track_id'];
    end if;
  end if;

  foreach k in array array['name', 'track_id', 'pass_percentage', 'question_count', 'entry_percentage',
                           'prerequisite_exam_id', 'seconds_per_question', 'max_skips', 'max_attempts',
                           'opens_at', 'closes_at', 'eligibility_at', 'judge_count', 'award_percentage', 'deleted_at'] loop
    if (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k) then
      if k = any(v_locked) and not v_override then
        raise exception 'بدأ الاختبار: تغيير «%» يغيّر نتائج قائمة — عدّله تعديلاً رجعياً بسبب', coalesce(v_label ->> k, k)
          using errcode = '23514';
      end if;
      v_before := v_before || jsonb_build_object(k, to_jsonb(old) -> k);
      v_after := v_after || jsonb_build_object(k, to_jsonb(new) -> k);
    end if;
  end loop;

  -- تمديد النافذة لا يُحيي المهجورة: تُختم بالإغلاق القديم قبل تغييره.
  if old.exam_type = 'remote' and new.closes_at is distinct from old.closes_at then
    perform public.fn_seal_expired_attempts(old.id);
  end if;

  -- التدقيق لمن يملك صلاحيةً — والهجرات والبذرة (بلا مستخدم) خارجه.
  if v_after <> '{}'::jsonb and (select auth.uid()) is not null
     and exists (select 1 from public.fn_my_permissions()) then
    perform public.fn_write_audit('exam_settings_changed', 'exams', old.id, v_before,
      v_after || case when v_override
                      then jsonb_build_object('reason', current_setting('app.exam_override_reason', true))
                      else '{}'::jsonb end);
  end if;
  return new;
end;
$$;

create trigger trg_exams_guard_settings before update on public.exams
  for each row execute function public.fn_guard_exam_settings();

/** التعديل الرجعي لإعدادٍ مقفل — بسببٍ إلزامي يُدقَّق. `p_changes` بأسماء الأعمدة. */
create or replace function public.fn_override_exam_settings(p_exam_id uuid, p_changes jsonb, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c jsonb := coalesce(p_changes, '{}'::jsonb);
begin
  if not public.fn_has_permission('exams.manage', (select program_id from public.exams where id = p_exam_id)) then
    raise exception 'لا تملك إدارة هذا الاختبار' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر سبب التعديل الرجعي' using errcode = '23514';
  end if;
  perform set_config('app.exam_override', p_exam_id::text, true);
  perform set_config('app.exam_override_reason', btrim(p_reason), true);

  update public.exams set
    pass_percentage      = case when c ? 'pass_percentage' then (c ->> 'pass_percentage')::numeric else pass_percentage end,
    question_count       = case when c ? 'question_count' then (c ->> 'question_count')::int else question_count end,
    seconds_per_question = case when c ? 'seconds_per_question' then (c ->> 'seconds_per_question')::int else seconds_per_question end,
    max_skips            = case when c ? 'max_skips' then (c ->> 'max_skips')::int else max_skips end,
    judge_count          = case when c ? 'judge_count' then (c ->> 'judge_count')::int else judge_count end,
    award_percentage     = case when c ? 'award_percentage' then (c ->> 'award_percentage')::numeric else award_percentage end,
    entry_percentage     = case when c ? 'entry_percentage' then (c ->> 'entry_percentage')::numeric else entry_percentage end,
    prerequisite_exam_id = case when c ? 'prerequisite_exam_id' then (c ->> 'prerequisite_exam_id')::uuid else prerequisite_exam_id end,
    eligibility_at       = case when c ? 'eligibility_at' then (c ->> 'eligibility_at')::timestamptz else eligibility_at end,
    track_id             = case when c ? 'track_id' then (c ->> 'track_id')::uuid else track_id end
  where id = p_exam_id and deleted_at is null;
  if not found then
    raise exception 'الاختبار غير موجود' using errcode = 'P0002';
  end if;

  perform set_config('app.exam_override', '', true);
end;
$$;
revoke all on function public.fn_override_exam_settings(uuid, jsonb, text) from public;
grant execute on function public.fn_override_exam_settings(uuid, jsonb, text) to authenticated;

/** أيّ الاختبارات بدأت — للشاشة تعرض المقفل وتطلب السبب. */
create or replace function public.fn_exam_lock_state(p_program_id uuid)
returns table (exam_id uuid, locked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id,
         case when e.exam_type = 'remote'
              then exists (select 1 from public.remote_attempts a where a.exam_id = e.id)
              else exists (select 1 from public.session_participants sp join public.exam_sessions s on s.id = sp.session_id
                            where s.exam_id = e.id)
                   or exists (select 1 from public.audit_log l where l.action = 'exam_sorting_applied' and l.entity_id = e.id)
         end
  from public.exams e
  where e.program_id = p_program_id and e.deleted_at is null
    and public.fn_has_permission('exams.manage', p_program_id);
$$;
revoke all on function public.fn_exam_lock_state(uuid) from public;
grant execute on function public.fn_exam_lock_state(uuid) to authenticated;

-- ══ ٦ · التغطية: المطلوب مع حدّ التخطّي ══
create or replace function public.fn_bank_coverage(p_program_id uuid)
returns table (exam_id uuid, exam_name text, track_id uuid, track_name text, scope_units int, available int, needed int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('exams.manage', p_program_id) then
    raise exception 'لا تملك إدارة بنك الأسئلة' using errcode = '42501';
  end if;
  return query
    with scope as (
      select e.id as eid, e.name as ename, e.exam_type, e.question_count + coalesce(e.max_skips, 0) as need,
             t.id as tid, t.name as tname, t.sort_order,
             case when e.exam_type = 'remote' and e.entry_percentage is not null
                  then ceil(public.fn_track_unit_count(t.id) * e.entry_percentage / 100.0)::int
                  else public.fn_track_unit_count(t.id) end as lim
      from public.exams e
      join public.tracks t on t.program_id = e.program_id and t.deleted_at is null
      where e.program_id = p_program_id and e.deleted_at is null
        and (e.track_id is null or e.track_id = t.id)
    )
    select s.eid, s.ename, s.tid, s.tname, s.lim,
           (select count(*)::int
              from public.questions q join public.content_units u on u.id = q.content_unit_id
             where q.program_id = p_program_id and q.deleted_at is null
               and (q.track_id is null or q.track_id = s.tid)
               and public.fn_track_ordinal_of(s.tid, u.sequence) between 1 and s.lim
               and case s.exam_type
                     when 'remote' then q.usage in ('remote', 'both') and q.question_type <> 'open'
                     else q.usage in ('oral', 'both') and btrim(q.correct_answer_text) <> ''
                   end),
           s.need
    from scope s
    order by s.ename, s.sort_order;
end;
$$;

-- ══ ٧ · السحب يحسب الإنجاز مرّة (قياس ب٨) ══
-- كان \`me\` يُدمج في الاستعلام فيُعاد حساب \`fn_progress_at\` لكل سؤالٍ في البنك:
-- ٢٨ ثانية لبدء محاولةٍ على ١٣٠٠ سؤال. \`materialized\` يحسبه مرّة: أجزاءٌ من الثانية.
create or replace function public.fn_exam_pool(p_exam_id uuid, p_participant_id uuid, p_exclude uuid[])
returns setof uuid
language sql
volatile
security definer
set search_path = ''
as $$
  with me as materialized (
    select pa.track_id, e.program_id, e.exam_type,
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
    and case me.exam_type
          when 'remote' then q.usage in ('remote', 'both') and q.question_type <> 'open'
          else q.usage in ('oral', 'both') and btrim(q.correct_answer_text) <> ''
        end
  order by random();
$$;
