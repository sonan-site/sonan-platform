-- 083 | حرّاس الفرز والإسناد، وحساب «اختباراتي» في وقته (مراجعة ١١ أكتوبر، الدفعة أ)
--
-- ١ · `exams.eligibility_at` (للشفهي وحده): لحظة احتساب الإنجاز للتأهل
--     (`adr/0048`: نهاية ٥ ديسمبر). **الحسم يُرفض قبلها ويُرفض بلا تحديدها**،
--     والإنجاز يُقرأ عندها لا «الآن». كان حسمٌ مبكر واحد يُنهي رحلات الجميع.
-- ٢ · الإسناد إلى جلسة للمتأهل وحده: كان يقبل أي مشارك في أي وقت، ويثبّت أسئلته
--     بإنجازه الحاضر.
-- ٣ · `fn_my_exams` لا تحسب اختباراً قبل نافذته بأسبوع: «رحلتي» تُفتح كل يوم،
--     والبوّابة تحسب الإنجاز وأعلى المحاولات — بلا فائدة قبل أوانها.
--
-- تراجع: نعم — حذف العمود وقيده، وإعادة الدوال الثلاث من ٠٧٩ و٠٨٠.

-- ══ ١ · لحظة الاحتساب ══
alter table public.exams
  add column eligibility_at timestamptz,
  add constraint chk_exams_eligibility_oral check (eligibility_at is null or exam_type = 'oral');

comment on column public.exams.eligibility_at is
  'مراجعة ١١ أكتوبر | لحظة احتساب الإنجاز للتأهل. فارغ = لم تُحدَّد، والفرز لا يُحسم. الحسم يُرفض قبلها.';

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
  e    record;
  v_at timestamptz;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or e.exam_type <> 'oral' then
    raise exception 'الفرز للاختبار الشفهي وحده' using errcode = '22023';
  end if;
  if not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;
  -- قبل لحظة الاحتساب: معاينةٌ بإنجاز الآن. وبعدها: الإنجاز عندها لا بعدها.
  v_at := least(now(), coalesce(e.eligibility_at, now()));

  return query
    with base as (
      select pa.id, pr.full_name, pa.registration_no, pa.track_id, pa.status,
             coalesce((select p.percent from public.fn_progress_at(pa.id, v_at) p), 0) as pct,
             case when e.prerequisite_exam_id is null then true
                  else coalesce((select b.passed from public.fn_exam_best(e.prerequisite_exam_id, pa.id) b), false) end as pre
      from public.participants pa
      join public.profiles pr on pr.user_id = pa.user_id
      where pa.program_id = e.program_id and pa.deleted_at is null
        and (e.track_id is null or pa.track_id = e.track_id)
        and pa.status in ('registered', 'memorizing', 'qualified', 'not_qualified')
    )
    select b.id, b.full_name, b.registration_no, b.track_id, b.status, b.pct, b.pre,
           b.pct >= coalesce(e.entry_percentage, 0) and b.pre
    from base b
    order by b.track_id, b.registration_no;
end;
$$;

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
  -- «غير متأهل» لا يتبع الخطة: حسمٌ قبل نهاية الحفظ يوقف رحلات من لم يُتمّ بعد.
  if e.eligibility_at is null then
    raise exception 'حدّد لحظة احتساب الإنجاز في إعدادات الاختبار أولاً' using errcode = '23514';
  end if;
  if now() < e.eligibility_at then
    raise exception 'لا يُحسم الفرز قبل لحظة احتساب الإنجاز' using errcode = '23514';
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

-- ══ ٢ · الإسناد للمتأهل وحده ══
create or replace function public.fn_move_participant(p_session_id uuid, p_participant_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s        record;
  v_old    record;
  v_order  int;
begin
  select es.*, e.program_id, e.id as eid into s
  from public.exam_sessions es join public.exams e on e.id = es.exam_id
  where es.id = p_session_id and es.deleted_at is null;
  if s.id is null or not public.fn_has_permission('exams.manage', s.program_id) then
    raise exception 'لا تملك إدارة هذه الجلسة' using errcode = '42501';
  end if;
  if not exists (select 1 from public.participants
                  where id = p_participant_id and program_id = s.program_id and deleted_at is null) then
    raise exception 'المشارك ليس في هذا البرنامج' using errcode = '23514';
  end if;
  if not exists (select 1 from public.participants where id = p_participant_id and status = 'qualified') then
    raise exception 'لا يُسنَد إلى جلسة إلا المتأهل — احسم الفرز أولاً' using errcode = '23514';
  end if;

  select sp.* into v_old from public.session_participants sp
  join public.exam_sessions es on es.id = sp.session_id
  where sp.participant_id = p_participant_id and es.exam_id = s.eid
    and sp.deleted_at is null and es.deleted_at is null;
  if v_old.id is not null then
    if v_old.session_id = p_session_id then
      return;
    end if;
    if exists (select 1 from public.judge_evaluations je
                where je.session_id = v_old.session_id and je.participant_id = p_participant_id and je.deleted_at is null) then
      raise exception 'بدأ تحكيمه في جلسته — لا يُنقل' using errcode = '23514';
    end if;
    update public.session_participants set deleted_at = now() where id = v_old.id;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_order from public.session_participants
  where session_id = p_session_id and deleted_at is null;
  insert into public.session_participants (session_id, participant_id, sort_order, question_ids)
  values (p_session_id, p_participant_id, v_order,
          coalesce(v_old.question_ids, public.fn_draw_oral(s.eid, p_participant_id)));
end;
$$;

-- ══ ٣ · «اختباراتي» في أوانها ══
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
             where a.exam_id = e.id and a.participant_id = pa.id and a.submitted_at is null and a.deleted_at is null),
           public.fn_exam_gate(e.id)
    from public.exams e
    cross join lateral public.fn_exam_best(e.id, pa.id) b
    where e.program_id = pa.program_id and e.deleted_at is null and e.exam_type = 'remote'
      and (e.track_id is null or e.track_id = pa.track_id)
      -- لا يُحسب قبل نافذته بأسبوع: البطاقة لا تظهر، ولا كلفة على «رحلتي».
      and (e.opens_at is null or now() >= e.opens_at - interval '7 days')
    order by e.opens_at nulls first, e.created_at;
end;
$$;
