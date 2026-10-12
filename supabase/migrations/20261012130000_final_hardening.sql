-- 087 | تحصين النهائي قبل البروفة (مراجعة ١١ أكتوبر، الدفعة ج)
--
-- ١ · لقطة الأهلية (ج١): `exam_eligibility` تُكتب بدفعاتٍ من ٤٠ (`statement_timeout`
--     الحيّة ٨ ثوانٍ؛ ٤٠٠ مشارك = ٢٢ ث دفعةً واحدة). والصفحة والحسم والسحب يقرؤونها.
-- ٢ · الحسم مرّة (ج٢): `exams.sorted_at`، ولا إعادة بعد أول إسناد، وتصحيحٌ فردي مدقَّق.
-- ٣ · وصول المحرّك (ج٣): `fn_progress_at_unchecked` داخلية، والعامّة غلافٌ يفحص ثم يستدعيها.
-- ٤ · السحب الشفهي (ج٤): من وحدات اللقطة، والناقص يُرفض باسم صاحبه، والتوزيع بدفعات،
--     وإعادة السحب واستبدال سؤالٍ لم يُقيَّم.
-- ٥ · الدرجة (ج٥): متاحةٌ بـ`judge_count` تقييماً معتمداً من محكّمين مختلفين أيّاً كانت
--     اللجنة الحالية؛ وإخراج المحكّم بسببٍ يؤرشف غير المعتمد وحده؛ واللجنة لا تتجاوز عددها.
-- ٦ · منح الجلسات بالأعمدة (ج٦).
-- ٧ · التدقيق والتفاصيل (ج٧).
--
-- تراجع: نعم — حذف الجدول والعمود والدوال الجديدة، وإعادة ما أُعيد تعريفه من ٠٧٧–٠٨٦.

-- ══ ٣ · وصول المحرّك ══
/** الإنجاز بلا فحص وصول — داخليةٌ لا يصلها أحد، يستدعيها من فحص قبلها. */
create or replace function public.fn_progress_at_unchecked(p_participant_id uuid, p_at timestamptz)
returns table (done_days int, day_count int, units int, share_size int, percent numeric, reach_sequence int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e      record;
  v_base uuid;
begin
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null then
    return;
  end if;
  done_days := public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, p_at);
  day_count := e.day_count;
  share_size := public.fn_track_unit_count(e.track_id);
  select f.id into v_base from public.task_fields f
  where f.program_id = e.program_id and f.is_base and f.deleted_at is null;
  units := coalesce((
    select sum(v.amount)::int from public.plan_values v
    where v.plan_id = e.plan_id and v.task_field_id = v_base and v.deleted_at is null and v.day_number <= done_days
  ), 0);
  percent := case
    when e.measure = 'units' and share_size > 0 and v_base is not null then round(100.0 * least(units, share_size) / share_size, 1)
    when coalesce(e.day_count, 0) > 0 then round(100.0 * done_days / e.day_count, 1)
    else 0
  end;
  reach_sequence := case when units > 0 then public.fn_track_unit_at(e.track_id, least(units, share_size)) end;
  return next;
end;
$$;
revoke all on function public.fn_progress_at_unchecked(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.fn_progress_at(p_participant_id uuid, p_at timestamptz)
returns table (done_days int, day_count int, units int, share_size int, percent numeric, reach_sequence int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_engine_access(p_participant_id, false);
  return query select * from public.fn_progress_at_unchecked(p_participant_id, p_at);
end;
$$;

-- ══ ١ · لقطة الأهلية ══
alter table public.exams add column sorted_at timestamptz;
comment on column public.exams.sorted_at is 'ج٢ | وقت حسم الفرز — يُقفل به ما يُقفل، ولا يُعاد الحسم بعد الإسناد.';

-- الحسم القائم (إن وُجد) يُنقل من سجل التدقيق.
update public.exams e set sorted_at = (
  select min(l.created_at) from public.audit_log l where l.action = 'exam_sorting_applied' and l.entity_id = e.id
) where e.exam_type = 'oral';

create table public.exam_eligibility (
  id                  uuid primary key default gen_random_uuid(),
  exam_id             uuid not null references public.exams (id) on delete restrict,
  participant_id      uuid not null references public.participants (id) on delete restrict,
  percent             numeric(5,1) not null,
  units               int not null,
  prerequisite_passed boolean not null,
  eligible            boolean not null,
  computed_at         timestamptz not null,
  decision            boolean,
  decision_source     text,
  decision_reason     text,
  decided_by          uuid references auth.users (id) on delete restrict,
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint chk_exam_eligibility_source check (decision_source is null or decision_source in ('auto', 'override', 'correction'))
);

comment on table public.exam_eligibility is
  'ج١ | لقطة أهلية النهائي: الإنجاز ووحداته عند لحظة الاحتساب، واجتياز الشرط. والقرار ومصدره (حسابٌ · استثناء · تصحيح) وسببه.';

create unique index uq_exam_eligibility on public.exam_eligibility (exam_id, participant_id) where deleted_at is null;
create trigger trg_exam_eligibility_updated_at before update on public.exam_eligibility
  for each row execute function public.fn_set_updated_at();
alter table public.exam_eligibility enable row level security;

create policy exam_eligibility_read on public.exam_eligibility
  for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id
                   and (select public.fn_has_permission('exams.manage', e.program_id))));
revoke all on public.exam_eligibility from anon, authenticated, service_role;
grant select on public.exam_eligibility to authenticated;

/** من يدخل نطاق الفرز — بترتيبٍ ثابت تقوم عليه الدفعات. */
create or replace function public.fn_eligibility_scope(p_exam_id uuid)
returns table (participant_id uuid, n int)
language sql
stable
security definer
set search_path = ''
as $$
  select pa.id, (row_number() over (order by pa.registration_no nulls last, pa.id))::int
  from public.participants pa join public.exams e on e.id = p_exam_id
  where pa.program_id = e.program_id and pa.deleted_at is null
    and (e.track_id is null or pa.track_id = e.track_id)
    and pa.status in ('registered', 'memorizing', 'qualified', 'not_qualified');
$$;
revoke all on function public.fn_eligibility_scope(uuid) from public, anon, authenticated;

/**
 * يحسب دفعةً من اللقطة: المشاركون من `p_offset` (من صفر) بعدد `p_limit`.
 * الإنجاز عند `least(now(), eligibility_at)` — قبلها معاينة، وبعدها ثابتٌ عندها.
 * يُرجع ما حُسب والعدد الكلّي — والشاشة تكرّر حتى يكتمل، والانقطاع يُستأنف.
 */
create or replace function public.fn_compute_eligibility(p_exam_id uuid, p_offset int, p_limit int default 40)
returns table (computed int, total int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e     record;
  v_at  timestamptz;
  v_n   int := 0;
  r     record;
  p     record;
  v_pre boolean;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or e.exam_type <> 'oral' then
    raise exception 'الفرز للاختبار الشفهي وحده' using errcode = '22023';
  end if;
  if not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;
  if e.sorted_at is not null then
    raise exception 'حُسم الفرز — التصحيح فرديٌّ بسبب' using errcode = '23514';
  end if;
  if e.prerequisite_exam_id is not null then
    perform public.fn_seal_expired_attempts(e.prerequisite_exam_id);
  end if;
  v_at := least(now(), coalesce(e.eligibility_at, now()));

  for r in
    select s.participant_id from public.fn_eligibility_scope(p_exam_id) s
    where s.n > greatest(p_offset, 0) and s.n <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 100)
    order by s.n
  loop
    select * into p from public.fn_progress_at_unchecked(r.participant_id, v_at);
    v_pre := e.prerequisite_exam_id is null
             or coalesce((select b.passed from public.fn_exam_best(e.prerequisite_exam_id, r.participant_id) b), false);
    insert into public.exam_eligibility (exam_id, participant_id, percent, units, prerequisite_passed, eligible, computed_at)
    values (p_exam_id, r.participant_id, coalesce(p.percent, 0), coalesce(p.units, 0), v_pre,
            coalesce(p.percent, 0) >= coalesce(e.entry_percentage, 0) and v_pre, now())
    on conflict (exam_id, participant_id) where deleted_at is null do update
      set percent = excluded.percent, units = excluded.units, prerequisite_passed = excluded.prerequisite_passed,
          eligible = excluded.eligible, computed_at = excluded.computed_at;
    v_n := v_n + 1;
  end loop;

  computed := v_n;
  total := (select count(*)::int from public.fn_eligibility_scope(p_exam_id));
  return next;
end;
$$;
revoke all on function public.fn_compute_eligibility(uuid, int, int) from public;
grant execute on function public.fn_compute_eligibility(uuid, int, int) to authenticated;

/** حال اللقطة: كم في النطاق، وكم حُسب، وأقدم حساب — والحسم يشترط اكتمالها بعد لحظة الاحتساب. */
create or replace function public.fn_eligibility_status(p_exam_id uuid)
returns table (total int, computed int, oldest timestamptz, ready boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;
  return query
    select (select count(*)::int from public.fn_eligibility_scope(p_exam_id)),
           count(x.id)::int,
           min(x.computed_at),
           e.eligibility_at is not null and now() >= e.eligibility_at
             and count(x.id) = (select count(*) from public.fn_eligibility_scope(p_exam_id))
             and coalesce(min(x.computed_at) >= e.eligibility_at, false)
    from public.fn_eligibility_scope(p_exam_id) s
    left join public.exam_eligibility x on x.exam_id = p_exam_id and x.participant_id = s.participant_id and x.deleted_at is null;
end;
$$;
revoke all on function public.fn_eligibility_status(uuid) from public;
grant execute on function public.fn_eligibility_status(uuid) to authenticated;

/** الأهلية **من اللقطة** لا من الحساب الحيّ — بالتوقيع نفسه، فالصفحة والحسم واحد. */
create or replace function public.fn_final_eligibility(p_exam_id uuid)
returns table (
  participant_id uuid, full_name text, registration_no int, track_id uuid,
  status public.participant_status, percent numeric, prerequisite_passed boolean, eligible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or e.exam_type <> 'oral' then
    raise exception 'الفرز للاختبار الشفهي وحده' using errcode = '22023';
  end if;
  if not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;
  return query
    select pa.id, pr.full_name, pa.registration_no, pa.track_id, pa.status,
           x.percent, coalesce(x.prerequisite_passed, false), coalesce(x.eligible, false)
    from public.fn_eligibility_scope(p_exam_id) s
    join public.participants pa on pa.id = s.participant_id
    join public.profiles pr on pr.user_id = pa.user_id
    left join public.exam_eligibility x on x.exam_id = p_exam_id and x.participant_id = pa.id and x.deleted_at is null
    order by pa.track_id, pa.registration_no;
end;
$$;

-- ══ ٢ · الحسم مرّة ══
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
  if exists (select 1 from public.session_participants sp join public.exam_sessions s on s.id = sp.session_id
              where s.exam_id = p_exam_id and sp.deleted_at is null) then
    raise exception 'أُسند متأهلون إلى الجلسات — لا يُعاد الحسم، والتصحيح فرديٌّ بسبب' using errcode = '23514';
  end if;
  if not (select st.ready from public.fn_eligibility_status(p_exam_id) st) then
    raise exception 'احسب الأهلية كاملةً بعد لحظة الاحتساب أولاً' using errcode = '23514';
  end if;

  -- النطاق مربوطاً باللقطة: من خرج من النطاق بعد حساب لقطته لا تُكتب حالته.
  for r in
    select x.participant_id, x.eligible
    from public.fn_eligibility_scope(p_exam_id) s
    join public.exam_eligibility x on x.exam_id = p_exam_id and x.participant_id = s.participant_id and x.deleted_at is null
  loop
    v_final := coalesce((v_over ->> r.participant_id::text)::boolean, r.eligible);
    update public.participants
       set status = case when v_final then 'qualified'::public.participant_status else 'not_qualified'::public.participant_status end
     where id = r.participant_id;
    update public.exam_eligibility
       set decision = v_final,
           decision_source = case when v_over ? r.participant_id::text then 'override' else 'auto' end,
           decided_by = (select auth.uid()), decided_at = now()
     where exam_id = p_exam_id and participant_id = r.participant_id and deleted_at is null;
    if v_final then v_q := v_q + 1; else v_n := v_n + 1; end if;
  end loop;

  perform set_config('app.exam_sorting', p_exam_id::text, true);
  update public.exams set sorted_at = now() where id = p_exam_id;
  perform set_config('app.exam_sorting', '', true);
  perform public.fn_write_audit('exam_sorting_applied', 'exams', p_exam_id, null,
    jsonb_build_object('qualified', v_q, 'not_qualified', v_n, 'overrides', v_over));

  qualified := v_q;
  not_qualified := v_n;
  return next;
end;
$$;

/**
 * تصحيحٌ فردي بعد الحسم بسببٍ مدقَّق. من صار غير متأهل يُرفع من جلسته إن لم يبدأ
 * تحكيمه؛ ومن صار متأهلاً يُسند يدوياً. ولا تصحيح لمن له تقييمٌ معتمد.
 */
create or replace function public.fn_set_qualification(p_exam_id uuid, p_participant_id uuid, p_qualified boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e      record;
  v_was  public.participant_status;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;
  if e.sorted_at is null then
    raise exception 'لم يُحسم الفرز بعد' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر سبب التصحيح' using errcode = '23514';
  end if;
  select status into v_was from public.participants
  where id = p_participant_id and program_id = e.program_id and deleted_at is null;
  if v_was is null then
    raise exception 'المشارك ليس في هذا البرنامج' using errcode = '23514';
  end if;
  if exists (select 1 from public.judge_evaluations je join public.exam_sessions s on s.id = je.session_id
              where s.exam_id = p_exam_id and je.participant_id = p_participant_id and je.deleted_at is null) then
    raise exception 'بدأ تحكيمه — لا يُصحَّح فرزه' using errcode = '23514';
  end if;

  if not p_qualified then
    update public.session_participants sp set deleted_at = now()
    from public.exam_sessions s
    where s.id = sp.session_id and s.exam_id = p_exam_id and sp.participant_id = p_participant_id and sp.deleted_at is null;
  end if;
  update public.participants
     set status = case when p_qualified then 'qualified'::public.participant_status else 'not_qualified'::public.participant_status end
   where id = p_participant_id;
  update public.exam_eligibility
     set decision = p_qualified, decision_source = 'correction', decision_reason = btrim(p_reason),
         decided_by = (select auth.uid()), decided_at = now()
   where exam_id = p_exam_id and participant_id = p_participant_id and deleted_at is null;

  perform public.fn_write_audit('qualification_corrected', 'participants', p_participant_id,
    jsonb_build_object('status', v_was),
    jsonb_build_object('status', case when p_qualified then 'qualified' else 'not_qualified' end,
                       'exam_id', p_exam_id, 'reason', btrim(p_reason)));
end;
$$;
revoke all on function public.fn_set_qualification(uuid, uuid, boolean, text) from public;
grant execute on function public.fn_set_qualification(uuid, uuid, boolean, text) to authenticated;

-- القفل يقرأ وقت الحسم من عموده لا من السجل.
create or replace function public.fn_guard_exam_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started boolean;
  v_override boolean := coalesce(current_setting('app.exam_override', true), '') = old.id::text;
  v_locked  text[] := '{}';
  v_before  jsonb := '{}';
  v_after   jsonb := '{}';
  k         text;
  v_label   jsonb := '{"pass_percentage": "نسبة الاجتياز", "question_count": "عدد الأسئلة",
                      "seconds_per_question": "زمن السؤال", "max_skips": "حدّ التخطّي", "track_id": "المسار",
                      "judge_count": "عدد المحكّمين", "award_percentage": "نسبة أهلية الجائزة",
                      "entry_percentage": "نسبة الدخول", "prerequisite_exam_id": "الاختبار الشرط",
                      "eligibility_at": "لحظة احتساب الإنجاز"}';
begin
  if new.exam_type is distinct from old.exam_type or new.program_id is distinct from old.program_id then
    raise exception 'نوع الاختبار وبرنامجه لا يتغيّران' using errcode = '23514';
  end if;
  -- وقت الحسم يكتبه الحسم وحده — إفراغه يفتح ما أقفله.
  if new.sorted_at is distinct from old.sorted_at
     and coalesce(current_setting('app.exam_sorting', true), '') <> old.id::text then
    raise exception 'وقت حسم الفرز لا يُكتب إلا من الحسم' using errcode = '23514';
  end if;

  if old.exam_type = 'remote' then
    v_started := exists (select 1 from public.remote_attempts where exam_id = old.id);
    if v_started then
      v_locked := array['pass_percentage', 'question_count', 'seconds_per_question', 'max_skips', 'track_id'];
    end if;
  else
    v_started := old.sorted_at is not null
                 or exists (select 1 from public.session_participants sp join public.exam_sessions s on s.id = sp.session_id
                             where s.exam_id = old.id);
    if v_started then
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

  if old.exam_type = 'remote' and new.closes_at is distinct from old.closes_at then
    perform public.fn_seal_expired_attempts(old.id);
  end if;

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
              else e.sorted_at is not null
                   or exists (select 1 from public.session_participants sp join public.exam_sessions s on s.id = sp.session_id
                               where s.exam_id = e.id)
         end
  from public.exams e
  where e.program_id = p_program_id and e.deleted_at is null
    and public.fn_has_permission('exams.manage', p_program_id);
$$;

-- ══ ٤ · السحب الشفهي من اللقطة ══
-- الشفهي يُسأل مما بلغه **عند لحظة الاحتساب** (اللقطة)، والمرحلي مما بلغه الآن.
create or replace function public.fn_exam_pool(p_exam_id uuid, p_participant_id uuid, p_exclude uuid[])
returns setof uuid
language sql
volatile
security definer
set search_path = ''
as $$
  with me as materialized (
    select pa.track_id, e.program_id, e.exam_type,
           case when e.exam_type = 'oral'
                then (select x.units from public.exam_eligibility x
                       where x.exam_id = e.id and x.participant_id = pa.id and x.deleted_at is null)
                else (select p.units from public.fn_progress_at_unchecked(pa.id, now()) p)
           end as reached
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

/** سحبٌ شفهيٌّ كامل أو رفضٌ باسم صاحبه — لا ورقةٌ ناقصة. */
create or replace function public.fn_draw_oral(p_exam_id uuid, p_participant_id uuid)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n   int := (select question_count from public.exams where id = p_exam_id);
  v_ids uuid[];
  v_who text;
begin
  select array_agg(x) into v_ids from (
    select x from public.fn_exam_pool(p_exam_id, p_participant_id, '{}') x limit v_n
  ) t;
  if coalesce(cardinality(v_ids), 0) < v_n then
    select pr.full_name || ' (' || coalesce(t.name, '—') || ')' into v_who
    from public.participants pa join public.profiles pr on pr.user_id = pa.user_id
    left join public.tracks t on t.id = pa.track_id
    where pa.id = p_participant_id;
    raise exception 'أسئلة الشفهي لا تكفي %: % من % — أضف أسئلةً شفهية لنطاق مساره',
      v_who, coalesce(cardinality(v_ids), 0), v_n using errcode = '23514';
  end if;
  return v_ids;
end;
$$;
revoke all on function public.fn_draw_oral(uuid, uuid) from public, anon, authenticated;

/** التوزيع بدفعات: يُسند حتى `p_limit` من المتأهلين غير المُسنَدين. يُرجع ما أُسند وما بقي. */
drop function public.fn_distribute_participants(uuid);
create or replace function public.fn_distribute_participants(p_exam_id uuid, p_limit int default 25)
returns table (assigned int, remaining int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e          record;
  v_sessions uuid[];
  v_n        int := 0;
  v_base     int;
  r          record;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك إدارة هذا الاختبار' using errcode = '42501';
  end if;
  select array_agg(id order by scheduled_at, created_at) into v_sessions
  from public.exam_sessions where exam_id = p_exam_id and deleted_at is null and status <> 'closed';
  if coalesce(cardinality(v_sessions), 0) = 0 then
    raise exception 'أنشئ جلسةً واحدة على الأقل أولاً' using errcode = '23514';
  end if;
  -- الدور يكمل من حيث وقف: بعدد المُسنَدين قبل هذه الدفعة.
  select count(*)::int into v_base from public.session_participants sp
  join public.exam_sessions s on s.id = sp.session_id
  where s.exam_id = p_exam_id and sp.deleted_at is null and s.deleted_at is null;

  for r in
    select pa.id from public.participants pa
    where pa.program_id = e.program_id and pa.deleted_at is null and pa.status = 'qualified'
      and (e.track_id is null or pa.track_id = e.track_id)
      and not exists (
        select 1 from public.session_participants sp join public.exam_sessions es on es.id = sp.session_id
        where sp.participant_id = pa.id and es.exam_id = p_exam_id and sp.deleted_at is null and es.deleted_at is null
      )
    order by pa.track_id, pa.registration_no
    limit least(greatest(p_limit, 1), 100)
  loop
    perform public.fn_move_participant(v_sessions[((v_base + v_n) % cardinality(v_sessions)) + 1], r.id);
    v_n := v_n + 1;
  end loop;

  assigned := v_n;
  remaining := (select count(*)::int from public.participants pa
                where pa.program_id = e.program_id and pa.deleted_at is null and pa.status = 'qualified'
                  and (e.track_id is null or pa.track_id = e.track_id)
                  and not exists (
                    select 1 from public.session_participants sp join public.exam_sessions es on es.id = sp.session_id
                    where sp.participant_id = pa.id and es.exam_id = p_exam_id and sp.deleted_at is null and es.deleted_at is null));
  return next;
end;
$$;
revoke all on function public.fn_distribute_participants(uuid, int) from public;
grant execute on function public.fn_distribute_participants(uuid, int) to authenticated;

/** إعادة سحب أسئلة مشاركٍ لم يبدأ تحكيمه. */
create or replace function public.fn_redraw_oral(p_session_id uuid, p_participant_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_exam uuid := (select exam_id from public.exam_sessions where id = p_session_id);
begin
  if not public.fn_has_permission('exams.manage', public.fn_session_program(p_session_id)) then
    raise exception 'لا تملك إدارة هذه الجلسة' using errcode = '42501';
  end if;
  if exists (select 1 from public.judge_evaluations
              where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null) then
    raise exception 'بدأ تحكيمه — استبدل السؤال الذي لم يُقيَّم وحده' using errcode = '23514';
  end if;
  update public.session_participants set question_ids = public.fn_draw_oral(v_exam, p_participant_id)
   where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null;
  if not found then
    raise exception 'المشارك ليس في هذه الجلسة' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.fn_redraw_oral(uuid, uuid) from public;
grant execute on function public.fn_redraw_oral(uuid, uuid) to authenticated;

/** استبدال سؤالٍ واحدٍ لم يقيّمه أحد — بسؤالٍ من نطاقه ليس في ورقته. */
create or replace function public.fn_replace_oral_question(p_session_id uuid, p_participant_id uuid, p_question_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sp    record;
  v_new uuid;
begin
  if not public.fn_has_permission('exams.manage', public.fn_session_program(p_session_id)) then
    raise exception 'لا تملك إدارة هذه الجلسة' using errcode = '42501';
  end if;
  select s.*, es.exam_id into sp from public.session_participants s join public.exam_sessions es on es.id = s.session_id
  where s.session_id = p_session_id and s.participant_id = p_participant_id and s.deleted_at is null
  for update of s;
  if sp.id is null or not (p_question_id = any(sp.question_ids)) then
    raise exception 'السؤال ليس في ورقة هذا المشارك' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.evaluation_answers ea join public.judge_evaluations je on je.id = ea.evaluation_id
              where je.session_id = p_session_id and je.participant_id = p_participant_id
                and ea.question_id = p_question_id and ea.deleted_at is null) then
    raise exception 'قُيِّم هذا السؤال — لا يُستبدل' using errcode = '23514';
  end if;
  select x into v_new from public.fn_exam_pool(sp.exam_id, p_participant_id, sp.question_ids) x limit 1;
  if v_new is null then
    raise exception 'لا سؤال شفهياً بديلاً في نطاقه' using errcode = '23514';
  end if;
  update public.session_participants set question_ids = array_replace(question_ids, p_question_id, v_new)
   where id = sp.id;
end;
$$;
revoke all on function public.fn_replace_oral_question(uuid, uuid, uuid) from public;
grant execute on function public.fn_replace_oral_question(uuid, uuid, uuid) to authenticated;

-- ══ ٥ · اللجنة والدرجة ══
/** المحكّمون **الأحياء** في الجلسة. */
create or replace function public.fn_session_judge_count(p_session_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.session_judges where session_id = p_session_id and deleted_at is null;
$$;
revoke all on function public.fn_session_judge_count(uuid) from public, anon, authenticated;

/** الإسناد لا يتجاوز `judge_count`؛ والإخراج بسببٍ يؤرشف غير المعتمد وحده ويعيد الجلسة جارية. */
drop function public.fn_set_session_judge(uuid, uuid, boolean);
create or replace function public.fn_set_session_judge(p_session_id uuid, p_user_id uuid, p_assign boolean, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program uuid := public.fn_session_program(p_session_id);
  v_limit   int := (select e.judge_count from public.exam_sessions s join public.exams e on e.id = s.exam_id where s.id = p_session_id);
  v_n       int;
begin
  if v_program is null or not public.fn_has_permission('exams.manage', v_program) then
    raise exception 'لا تملك إدارة هذه الجلسة' using errcode = '42501';
  end if;
  if p_assign then
    if not exists (
      select 1 from public.user_roles ur
      join public.roles ro on ro.id = ur.role_id and ro.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id and rp.deleted_at is null
      where ur.user_id = p_user_id and ur.deleted_at is null and rp.permission_code = 'exams.judge'
        and (ur.scope_program_id is null or ur.scope_program_id = v_program)
    ) then
      raise exception 'هذا الحساب لا يحمل صلاحية التحكيم — امنحه دوراً بها أولاً' using errcode = '23514';
    end if;
    if exists (select 1 from public.session_judges where session_id = p_session_id and user_id = p_user_id and deleted_at is null) then
      return;
    end if;
    if public.fn_session_judge_count(p_session_id) >= v_limit then
      raise exception 'اكتملت اللجنة (%) — أخرِج محكّماً أولاً', v_limit using errcode = '23514';
    end if;
    insert into public.session_judges (session_id, user_id) values (p_session_id, p_user_id);
  else
    if exists (select 1 from public.judge_evaluations
                where session_id = p_session_id and judge_id = p_user_id and deleted_at is null) then
      if char_length(btrim(coalesce(p_reason, ''))) < 3 then
        raise exception 'قيّم هذا المحكّم في الجلسة — اذكر سبب إخراجه' using errcode = '23514';
      end if;
      update public.judge_evaluations set deleted_at = now()
       where session_id = p_session_id and judge_id = p_user_id and approved_at is null and deleted_at is null;
      get diagnostics v_n = row_count;
      update public.exam_sessions set status = 'in_progress', closed_at = null where id = p_session_id and status = 'closed';
      perform public.fn_write_audit('session_judge_removed', 'exam_sessions', p_session_id, null,
        jsonb_build_object('judge_id', p_user_id, 'reason', btrim(p_reason), 'archived_unapproved', v_n));
    end if;
    update public.session_judges set deleted_at = now()
     where session_id = p_session_id and user_id = p_user_id and deleted_at is null;
  end if;
end;
$$;
revoke all on function public.fn_set_session_judge(uuid, uuid, boolean, text) from public;
grant execute on function public.fn_set_session_judge(uuid, uuid, boolean, text) to authenticated;

/** اعتماد المحكّم — وعن محكّمٍ بسببٍ إلزامي. والإقفال باكتمال `judge_count` معتمداً لكل مشارك. */
drop function public.fn_judge_approve(uuid, uuid, uuid);
create or replace function public.fn_judge_approve(p_session_id uuid, p_participant_id uuid, p_judge_id uuid default null, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_judge uuid := public.fn_evaluation_judge(p_session_id, p_judge_id);
  je      record;
  v_need  int;
  v_limit int := (select e.judge_count from public.exam_sessions s join public.exams e on e.id = s.exam_id where s.id = p_session_id);
begin
  if v_judge <> (select auth.uid()) and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر سبب الاعتماد عن المحكّم' using errcode = '23514';
  end if;
  select * into je from public.judge_evaluations
  where session_id = p_session_id and judge_id = v_judge and participant_id = p_participant_id and deleted_at is null;
  select cardinality(question_ids) into v_need from public.session_participants
  where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null;
  if je.id is null or coalesce(v_need, 0) = 0
     or (select count(*) from public.evaluation_answers where evaluation_id = je.id and deleted_at is null) < v_need then
    raise exception 'قيّم الأسئلة كلها قبل الاعتماد' using errcode = '23514';
  end if;
  update public.judge_evaluations set approved_at = coalesce(approved_at, now()) where id = je.id;
  if v_judge <> (select auth.uid()) then
    insert into public.retroactive_entries (evaluation_id, entered_by, reason)
    values (je.id, (select auth.uid()), 'اعتماد: ' || btrim(p_reason));
  end if;

  if not exists (
    select 1 from public.session_participants sp
    where sp.session_id = p_session_id and sp.deleted_at is null
      and (select count(distinct x.judge_id) from public.judge_evaluations x
            where x.session_id = p_session_id and x.participant_id = sp.participant_id
              and x.approved_at is not null and x.deleted_at is null) < v_limit
  ) then
    update public.exam_sessions set status = 'closed', closed_at = now() where id = p_session_id;
  end if;

  return public.fn_judge_sheet(p_session_id, p_participant_id, p_judge_id);
end;
$$;
revoke all on function public.fn_judge_approve(uuid, uuid, uuid, text) from public;
grant execute on function public.fn_judge_approve(uuid, uuid, uuid, text) to authenticated;

/** الدرجة متاحةٌ بـ`judge_count` تقييماً معتمداً من محكّمين مختلفين — أيّاً كانت اللجنة الحالية. */
create or replace function public.fn_final_scores(p_exam_id uuid)
returns table (
  participant_id uuid, full_name text, registration_no int, track_id uuid, session_name text,
  judges int, approved int, final_score numeric, max_score numeric, percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
begin
  select * into e from public.exams where id = p_exam_id;
  if e.id is null or not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك عرض الدرجات' using errcode = '42501';
  end if;
  return query
    with base as (
      select sp.participant_id, s.name as sname, sp.question_ids,
             (select count(distinct je.judge_id)::int from public.judge_evaluations je
               where je.session_id = sp.session_id and je.participant_id = sp.participant_id
                 and je.approved_at is not null and je.deleted_at is null) as na,
             (select avg(public.fn_evaluation_total(je.id)) from public.judge_evaluations je
               where je.session_id = sp.session_id and je.participant_id = sp.participant_id
                 and je.approved_at is not null and je.deleted_at is null) as avg_total,
             (select coalesce(sum(q.score), 0) from public.questions q where q.id = any(sp.question_ids)) as mx
      from public.session_participants sp
      join public.exam_sessions s on s.id = sp.session_id and s.deleted_at is null
      where s.exam_id = p_exam_id and sp.deleted_at is null
    )
    select b.participant_id, pr.full_name, pa.registration_no, pa.track_id, b.sname, e.judge_count, b.na,
           case when b.na >= e.judge_count then round(b.avg_total, 2) end,
           b.mx,
           case when b.na >= e.judge_count and b.mx > 0 then round(100.0 * b.avg_total / b.mx, 1) end
    from base b
    join public.participants pa on pa.id = b.participant_id
    join public.profiles pr on pr.user_id = pa.user_id
    order by pa.track_id, 10 desc nulls last, pa.registration_no;
end;
$$;

-- ══ ٦ · منح الجلسات بالأعمدة ══
revoke insert, update on public.exam_sessions from authenticated;
grant insert (exam_id, name, scheduled_at, location) on public.exam_sessions to authenticated;
grant update (name, scheduled_at, location, deleted_at) on public.exam_sessions to authenticated;

-- ══ ٧ · التدقيق والتفاصيل ══
/** تعليم المحكّم — والمعيار المؤرشف يبقى إن كان معلَّماً من قبل. ويُدقَّق التغيّر بقبل/بعد. */
create or replace function public.fn_judge_mark(
  p_session_id     uuid,
  p_participant_id uuid,
  p_question_id    uuid,
  p_criterion_ids  uuid[],
  p_judge_id       uuid default null,
  p_reason         text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_judge  uuid := public.fn_evaluation_judge(p_session_id, p_judge_id);
  v_prog   uuid := public.fn_session_program(p_session_id);
  v_eval   uuid;
  v_ans    uuid;
  v_appr   timestamptz;
  v_before uuid[];
  v_new    uuid[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_criterion_ids, '{}')) x), '{}');
begin
  if not exists (select 1 from public.session_participants
                  where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null
                    and p_question_id = any(question_ids)) then
    raise exception 'السؤال ليس من أسئلة هذا المشارك' using errcode = '23514';
  end if;

  insert into public.judge_evaluations (session_id, judge_id, participant_id)
  values (p_session_id, v_judge, p_participant_id)
  on conflict (session_id, judge_id, participant_id) where deleted_at is null do nothing;
  select id, approved_at into v_eval, v_appr from public.judge_evaluations
  where session_id = p_session_id and judge_id = v_judge and participant_id = p_participant_id and deleted_at is null;
  if v_appr is not null then
    raise exception 'اعتُمد التقييم وأُقفل — يُعاد فتحه من الإدارة' using errcode = '23514';
  end if;
  -- اكتمل له عدد اللجنة من غيره (بعد استبدال محكّم): تقييمٌ زائد يغيّر المتوسط.
  if (select count(distinct je.judge_id) from public.judge_evaluations je
       where je.session_id = p_session_id and je.participant_id = p_participant_id
         and je.judge_id <> v_judge and je.approved_at is not null and je.deleted_at is null)
     >= (select e.judge_count from public.exam_sessions s join public.exams e on e.id = s.exam_id where s.id = p_session_id) then
    raise exception 'اكتمل تقييم هذا المشارك من لجنته — لا يُقيَّم ثانيةً' using errcode = '23514';
  end if;

  select ea.id, coalesce((select array_agg(d.criterion_id order by d.criterion_id) from public.evaluation_deductions d
                           where d.evaluation_answer_id = ea.id and d.deleted_at is null), '{}')
    into v_ans, v_before
  from public.evaluation_answers ea where ea.evaluation_id = v_eval and ea.question_id = p_question_id and ea.deleted_at is null;

  -- المعيار الحيّ للبرنامج وللسؤال، أو المؤرشف إن كان معلَّماً من قبل (لا يُضاف جديداً).
  if exists (select 1 from unnest(v_new) cid
              where not exists (select 1 from public.deduction_criteria c
                                 where c.id = cid and c.program_id = v_prog
                                   and (c.question_id is null or c.question_id = p_question_id)
                                   and (c.deleted_at is null or cid = any(coalesce(v_before, '{}'))))) then
    raise exception 'معيار خصمٍ غير معروف' using errcode = '23514';
  end if;

  if v_judge <> (select auth.uid()) then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'اذكر سبب الإدخال عن المحكّم' using errcode = '23514';
    end if;
    insert into public.retroactive_entries (evaluation_id, entered_by, reason)
    values (v_eval, (select auth.uid()), btrim(p_reason));
  end if;

  insert into public.evaluation_answers (evaluation_id, question_id)
  values (v_eval, p_question_id)
  on conflict (evaluation_id, question_id) where deleted_at is null do update set evaluated_at = now()
  returning id into v_ans;

  update public.evaluation_deductions set deleted_at = now()
   where evaluation_answer_id = v_ans and deleted_at is null and not (criterion_id = any(v_new));
  insert into public.evaluation_deductions (evaluation_answer_id, criterion_id)
  select v_ans, cid from unnest(v_new) cid
  on conflict (evaluation_answer_id, criterion_id) where deleted_at is null do nothing;

  -- يُدقَّق التغيّر لا كلّ نقرة: أول تقييمٍ أو معاييرُ تبدّلت.
  if v_before is distinct from v_new then
    perform public.fn_write_audit('evaluation_marked', 'judge_evaluations', v_eval,
      jsonb_build_object('question_id', p_question_id, 'criteria', v_before),
      jsonb_build_object('question_id', p_question_id, 'criteria', v_new, 'judge_id', v_judge));
  end if;

  update public.exam_sessions set status = 'in_progress', opened_at = coalesce(opened_at, now())
   where id = p_session_id and status = 'scheduled';

  return public.fn_judge_sheet(p_session_id, p_participant_id, p_judge_id);
end;
$$;

/** الورقة — والمعيار المؤرشف المعلَّم عليه يظهر (لا خصمٌ خفي)، معلَّماً بأرشفته. */
create or replace function public.fn_judge_sheet(p_session_id uuid, p_participant_id uuid, p_judge_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_judge uuid := public.fn_evaluation_judge(p_session_id, p_judge_id);
  sp      record;
  je      record;
  v_prog  uuid := public.fn_session_program(p_session_id);
begin
  select * into sp from public.session_participants
  where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null;
  if sp.id is null then
    raise exception 'المشارك ليس في هذه الجلسة' using errcode = 'P0002';
  end if;
  select * into je from public.judge_evaluations
  where session_id = p_session_id and participant_id = p_participant_id and judge_id = v_judge and deleted_at is null;

  return jsonb_build_object(
    'participant', (select jsonb_build_object('name', pr.full_name, 'registration_no', pa.registration_no)
                    from public.participants pa join public.profiles pr on pr.user_id = pa.user_id
                    where pa.id = p_participant_id),
    'approved', je.approved_at is not null,
    'total', case when je.id is null then 0 else public.fn_evaluation_total(je.id) end,
    'max', (select coalesce(sum(q.score), 0) from public.questions q where q.id = any(sp.question_ids)),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'text', q.text, 'answer', q.correct_answer_text, 'score', q.score,
        'evaluated', ea.id is not null,
        'marked', coalesce((select jsonb_agg(d.criterion_id) from public.evaluation_deductions d
                            where d.evaluation_answer_id = ea.id and d.deleted_at is null), '[]'::jsonb),
        'criteria', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'value', c.deduction_value,
                                                                  'archived', c.deleted_at is not null)
                                               order by c.question_id nulls first, c.sort_order), '[]'::jsonb)
                     from public.deduction_criteria c
                     where c.program_id = v_prog and (c.question_id is null or c.question_id = q.id)
                       and (c.deleted_at is null
                            or exists (select 1 from public.evaluation_deductions d
                                        where d.evaluation_answer_id = ea.id and d.criterion_id = c.id and d.deleted_at is null)))
      ) order by n), '[]'::jsonb)
      from unnest(sp.question_ids) with ordinality as u(qid, n)
      join public.questions q on q.id = u.qid
      left join public.evaluation_answers ea on ea.evaluation_id = je.id and ea.question_id = q.id and ea.deleted_at is null
    )
  );
end;
$$;

create or replace function public.fn_exam_judge_candidates(p_program_id uuid)
returns table (user_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('exams.manage', p_program_id) then
    raise exception 'لا تملك إدارة الاختبارات' using errcode = '42501';
  end if;
  return query
    select distinct ur.user_id, pr.full_name
    from public.user_roles ur
    join public.roles ro on ro.id = ur.role_id and ro.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.deleted_at is null
    join public.profiles pr on pr.user_id = ur.user_id and pr.deleted_at is null
    where ur.deleted_at is null and rp.permission_code = 'exams.judge'
      and (ur.scope_program_id is null or ur.scope_program_id = p_program_id)
    order by pr.full_name;
end;
$$;

-- وحدة السؤال ضمن نطاق مساره إن حُدّد مسار — وإلا سؤالٌ لا يُسحب أبداً.
create or replace function public.fn_guard_question_unit_in_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.track_id is not null
     and public.fn_track_ordinal_of(new.track_id, (select sequence from public.content_units where id = new.content_unit_id)) is null then
    raise exception 'الوحدة خارج نطاق المسار المحدّد — اختر وحدةً من مادته أو اجعل السؤال عامّاً' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_questions_unit_in_track before insert or update of track_id, content_unit_id on public.questions
  for each row execute function public.fn_guard_question_unit_in_track();
