-- 066 | إصلاحات مراجعة الرصد (065)
--
-- ١. **إتمام اليوم مفتاحه المسار أيضاً.** فهرس التفرّد كان (مشارك، خطة، يوم)،
--    والحالة كلها (مشارك، خطة، مسار): من انتقل بين مسارين يشتركان في الخطة
--    الافتراضية يبدأ الجديد من أوله — فيصطدم إتمام يومه الأول بإتمامه القديم،
--    ويعلق إلى الأبد.
-- ٢. **رصدان متزامنان لا يُضيعان إتمام اليوم.** كلٌّ منهما لا يرى رصد الآخر قبل
--    التزامه، فلا يكتب أحدهما الإتمام. الكاتبات تُسلسَل بقفلٍ لكل مشارك، والحال
--    تُصلح نفسها: يومٌ رُصد كل إلزاميّه بلا إتمام يُتمّ عند قراءتها — ويغطّي هذا
--    أيضاً خطةً عُدّلت فحُذف من يومٍ حقلُه الوحيد الباقي.
-- ٣. **التسوية تبدأ من آخر يومٍ مؤرشف**، وتقرأ أيام العمل مرة، وتتجاوز التعارض
--    (`on conflict do nothing`) — فتكرارها رخيص ولا يتصادم اثنان منها. ولا تحكم
--    على من لا يتبع الخطة، ومن أتمّ خطته يُكتب يومه «معفى» فلا يُحكم عليه لاحقاً
--    إن طالت الخطة بعده.
-- ٤. **يوم المشارك الأول:** بداية البرنامج، أو يوم التحاقه بمساره إن جاء بعدها —
--    ومن التحق بعد وقت نهاية رصد يومٍ فيومه الأول ما بعده. فلا يُحكم على المتأخّر
--    في الالتحاق ولا على المنقول بأيامٍ لم يكن فيها.
-- ٥. **الحقل الاختياري يُرصد في اليوم المتمّ للتوّ** ما دامت نافذة تراجعه مفتوحة،
--    والتراجع عنه لا يُلغي إتمام اليوم.
-- ٦. «بدء واجب اليوم التالي» يُحسب ليومه التقويمي وحده، فلا يتجاوز به أحدٌ الحدّ
--    اليومي بفتحٍ قديم.
-- ٧. الحال تحمل `due_days` (أيام البرنامج التي انقضى وقت رصدها) — موعد المشارك
--    يُقرأ منها في كل شاشة بحسابٍ واحد.
--
-- تراجع: نعم.

-- ══ ١ · فهرس الإتمام ══

drop index public.idx_day_completions_live;
create unique index idx_day_completions_live
  on public.day_completions (participant_id, plan_id, track_id, day_number)
  where undone_at is null and deleted_at is null;

-- ══ أدوات ══

/** يُسلسِل كاتبات المحرّك لمشاركٍ واحد حتى نهاية المعاملة. */
create or replace function public.fn_engine_lock(p_participant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('engine:' || p_participant_id::text, 0));
$$;

/** أيام البرنامج من البداية حتى اليوم ضمناً — بقراءة الإعداد مرةً لا لكل يوم. */
create or replace function public.fn_program_days_through(p_program_id uuid, p_track_id uuid, p_start date, p_date date)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.fn_engine_settings(p_program_id, p_track_id) s
  cross join generate_series(p_start, p_date, interval '1 day') g
  where p_date >= p_start
    and extract(dow from g)::smallint = any (s.work_days)
    and not (g::date = any (s.exceptions));
$$;

/**
 * موعده: أيام البرنامج التي انقضى وقت رصدها حتى لحظة — اليوم لا يُحسب قبل
 * وقته. بحدّ أيام الخطة.
 */
create or replace function public.fn_due_days_at(
  p_program_id uuid, p_track_id uuid, p_start date, p_day_count int, p_at timestamptz
)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select public.fn_local_now(p_at)::date as today)
  select case when p_start is null or coalesce(p_day_count, 0) = 0 then 0 else least(
    p_day_count,
    public.fn_program_days_through(p_program_id, p_track_id, p_start, t.today - 1)
    + case when t.today >= p_start
            and public.fn_is_program_day(p_program_id, p_track_id, t.today)
            and p_at >= public.fn_cut_at(p_program_id, p_track_id, t.today)
           then 1 else 0 end
  ) end
  from t;
$$;

-- ══ ٤ · يوم المشارك الأول ══

drop function public.fn_participant_track_start(uuid);

/** لحظة التحاقه بمساره الحالي: آخر قبولٍ نقله إليه، وإلا التحاقه بالبرنامج. */
create or replace function public.fn_participant_track_moment(p_participant_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select max(r.decided_at) from public.track_change_requests r
      where r.participant_id = pa.id and r.status = 'approved' and r.to_track_id = pa.track_id),
    pa.joined_at
  )
  from public.participants pa
  where pa.id = p_participant_id;
$$;

create or replace function public.fn_participant_engine(
  p_participant_id uuid,
  out program_id   uuid,
  out track_id     uuid,
  out plan_id      uuid,
  out day_count    int,
  out start_date   date,
  out daily_limit  int,
  out credit       boolean,
  out compensation boolean,
  out measure      public.progress_measure
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_moment timestamptz;
  v_first  date;
begin
  select pa.program_id, pa.track_id into program_id, track_id
  from public.participants pa
  where pa.id = p_participant_id and pa.deleted_at is null;
  if track_id is null then
    return;
  end if;
  plan_id := public.fn_track_plan(track_id);
  select p.day_count into day_count from public.plans p where p.id = plan_id;
  select s.start_date, s.daily_limit, s.credit_enabled, s.compensation_enabled, s.progress_measure
  into start_date, daily_limit, credit, compensation, measure
  from public.fn_engine_settings(program_id, track_id) s;

  -- يومه الأول: بداية البرنامج، أو يوم التحاقه بمساره إن جاء بعدها. ومن التحق
  -- بعد وقت نهاية رصد يومٍ فأوّل أيامه ما بعده — لا يُحكم عليه بيومٍ لم يدركه.
  v_moment := public.fn_participant_track_moment(p_participant_id);
  v_first := public.fn_local_now(v_moment)::date;
  if v_moment >= public.fn_cut_at(program_id, track_id, v_first) then
    v_first := v_first + 1;
  end if;
  start_date := greatest(coalesce(start_date, v_first), v_first);
end;
$$;

-- ══ ٢ · إتمام اليوم — من الرصد ومن قراءة الحال ══

/**
 * يكتب إتمام يوم الخطة إن رُصد كل حقلٍ إلزاميٍّ له قيمةٌ فيه ولا إتمام حيّ له
 * (`BR-PLAN-01`). يُرجع هل كتب. والتعارض مع كاتبٍ متزامن يُتجاوز.
 */
create or replace function public.fn_complete_day_at(
  p_participant_id uuid, p_plan_id uuid, p_track_id uuid, p_day int, p_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  if exists (
    select 1 from public.day_completions c
    where c.participant_id = p_participant_id and c.plan_id = p_plan_id and c.track_id = p_track_id
      and c.day_number = p_day and c.undone_at is null and c.deleted_at is null
  ) or not exists (
    select 1 from public.plan_values v
    join public.task_fields f on f.id = v.task_field_id and f.is_required
    where v.plan_id = p_plan_id and v.day_number = p_day and v.deleted_at is null
  ) or exists (
    select 1 from public.plan_values v
    join public.task_fields f on f.id = v.task_field_id and f.is_required
    where v.plan_id = p_plan_id and v.day_number = p_day and v.deleted_at is null
      and not exists (
        select 1 from public.field_marks m
        where m.participant_id = p_participant_id and m.plan_id = p_plan_id and m.track_id = p_track_id
          and m.day_number = p_day and m.task_field_id = v.task_field_id
          and m.undone_at is null and m.deleted_at is null
      )
  ) then
    return false;
  end if;

  insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
  values (p_participant_id, p_plan_id, p_track_id, p_day, p_at)
  on conflict (participant_id, plan_id, track_id, day_number) where undone_at is null and deleted_at is null
  do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ══ الحال ══

create or replace function public.fn_journey_state_at(p_participant_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e          record;
  v_now      timestamp := public.fn_local_now(p_at);
  v_today    date := v_now::date;
  v_done     int;
  v_current  int;
  v_today_n  int;
  v_prev_at  timestamptz;
  v_opened   boolean;
  v_marked   boolean;
  v_state    text;
  v_expected int;
  v_units    int := 0;
  v_size     int := 0;
  v_base     uuid;
  v_pct      numeric := 0;
  v_stumbled int;
  v_comp     int;
  v_carried  boolean;
  v_deadline time;
begin
  perform public.fn_settle_commitment_at(p_participant_id, p_at);
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null or coalesce(e.day_count, 0) = 0 then
    return jsonb_build_object('state', 'no_plan');
  end if;

  v_done := public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, p_at);
  -- يومٌ رُصد كل إلزاميّه ولم يُكتب إتمامه (رصدان متزامنان، أو خطةٌ عُدّلت بعد
  -- الرصد) يُتمّ الآن — وإلا علق المشارك بلا زرٍّ يضغطه.
  while v_done < e.day_count
        and public.fn_complete_day_at(p_participant_id, e.plan_id, e.track_id, v_done + 1, p_at) loop
    v_done := v_done + 1;
  end loop;
  v_current := least(v_done + 1, e.day_count + 1);

  select count(*)::int into v_today_n from public.day_completions c
  where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
    and c.deleted_at is null and c.undone_at is null and c.completed_at <= p_at
    and public.fn_local_now(c.completed_at)::date = v_today;
  select c.completed_at into v_prev_at from public.day_completions c
  where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
    and c.day_number = v_current - 1 and c.deleted_at is null and c.undone_at is null;
  -- البدء يُحسب ليومه التقويمي وحده: فتحٌ قديم لا يتجاوز به الحدّ اليومي اليوم.
  v_opened := exists (
    select 1 from public.day_openings o
    where o.participant_id = p_participant_id and o.plan_id = e.plan_id and o.track_id = e.track_id
      and o.day_number = v_current and o.deleted_at is null
      and public.fn_local_now(o.opened_at)::date = v_today
  );
  v_marked := exists (
    select 1 from public.field_marks m
    where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
      and m.day_number = v_current and m.undone_at is null and m.deleted_at is null
  );

  v_state := case
    when v_today < e.start_date then 'not_started'
    when v_current > e.day_count then 'finished'
    when v_prev_at is not null and public.fn_local_now(v_prev_at)::date = v_today and not v_opened and not v_marked
      then case when v_today_n >= e.daily_limit then 'limit' else 'done_today' end
    else 'tasks'
  end;

  v_expected := least(e.day_count, public.fn_program_days_through(e.program_id, e.track_id, e.start_date, v_today));

  -- النسبة: بالوحدات (مجموع مقادير الأساس في المتمّ ÷ حجم النصيب)، أو بالأيام.
  select f.id into v_base from public.task_fields f
  where f.program_id = e.program_id and f.is_base and f.deleted_at is null;
  v_size := public.fn_track_unit_count(e.track_id);
  if v_base is not null then
    select coalesce(sum(v.amount), 0)::int into v_units from public.plan_values v
    where v.plan_id = e.plan_id and v.task_field_id = v_base and v.deleted_at is null and v.day_number <= v_done;
  end if;
  v_pct := case
    when e.measure = 'units' and v_size > 0 and v_base is not null then round(100.0 * least(v_units, v_size) / v_size, 1)
    else round(100.0 * v_done / e.day_count, 1)
  end;

  select count(*) filter (where a.status = 'stumbled')::int,
         count(*) filter (where a.status = 'stumbled' and a.compensated_at is not null)::int
  into v_stumbled, v_comp
  from public.commitment_archive a
  where a.participant_id = p_participant_id and a.track_id = e.track_id and a.deleted_at is null;

  v_carried := v_state = 'tasks' and exists (
    select 1 from public.commitment_archive a
    where a.participant_id = p_participant_id and a.track_id = e.track_id and a.deleted_at is null
      and a.status = 'stumbled' and a.plan_day = v_current and a.calendar_date < v_today
  );
  v_deadline := public.fn_deadline_at(e.program_id, e.track_id, v_today);

  return jsonb_build_object(
    'state', v_state,
    'plan_id', e.plan_id,
    'track_id', e.track_id,
    'day_count', e.day_count,
    'current_day', v_current,
    'done_days', v_done,
    'completed_today', v_today_n,
    'last_completed_today', v_prev_at is not null and public.fn_local_now(v_prev_at)::date = v_today,
    'daily_limit', e.daily_limit,
    'start_date', e.start_date,
    'today', v_today,
    'is_program_day', public.fn_is_program_day(e.program_id, e.track_id, v_today),
    'deadline', to_char(v_deadline, 'HH24:MI'),
    'expected_day', v_expected,
    'due_days', public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, p_at),
    'progress_pct', v_pct,
    'progress_units', v_units,
    'share_size', v_size,
    'measure', e.measure,
    'stumbled', v_stumbled,
    'compensated', v_comp,
    'carried', v_carried
  );
end;
$$;

-- ══ الرصد ══

drop function public.fn_engine_require_tasks(uuid, int, timestamptz);

/**
 * يُرصد يوم الخطة الحالي وهو مفتوح — أو اليوم المتمّ للتوّ، يُكمَل فيه
 * الاختياري ما دامت نافذة تراجعه مفتوحة (`p_done_ok`).
 */
create or replace function public.fn_engine_require_day(
  p_participant_id uuid, p_day int, p_at timestamptz, p_done_ok boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_cur   int;
  e       record;
begin
  v_state := public.fn_journey_state_at(p_participant_id, p_at);
  v_cur := (v_state ->> 'current_day')::int;

  if v_state ->> 'state' = 'tasks' and p_day = v_cur then
    return v_state;
  end if;
  if p_done_ok and p_day = v_cur - 1
     and v_state ->> 'state' in ('done_today', 'limit', 'finished')
     and (v_state ->> 'last_completed_today')::boolean then
    select * into e from public.fn_participant_engine(p_participant_id);
    if p_at > public.fn_cut_at(e.program_id, e.track_id, public.fn_local_now(p_at)::date) then
      raise exception 'انقضى وقت رصد اليوم' using errcode = '23514';
    end if;
    return v_state;
  end if;

  if v_state ->> 'state' = 'no_plan' then
    raise exception 'لا خطة لمسارك بعد' using errcode = '23514';
  elsif v_state ->> 'state' = 'not_started' then
    raise exception 'لم يبدأ البرنامج بعد' using errcode = '23514';
  elsif v_state ->> 'state' = 'finished' then
    raise exception 'أتممت الخطة كاملة' using errcode = '23514';
  elsif v_state ->> 'state' = 'limit' then
    raise exception 'بلغت الحد اليومي — يُفتح واجب اليوم التالي غداً' using errcode = '23514';
  elsif v_state ->> 'state' = 'done_today' then
    raise exception 'أتممت واجب اليوم. ابدأ واجب اليوم التالي أولاً' using errcode = '23514';
  end if;
  raise exception 'يُرصد يوم خطتك الحالي وحده (اليوم %)', public.fn_ar_digits(v_cur::text)
    using errcode = '23514';
end;
$$;

create or replace function public.fn_count_repetition_at(
  p_participant_id uuid, p_day int, p_field_id uuid, p_delta int, p_at timestamptz
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e       record;
  v_rep   int;
  v_count int;
begin
  perform public.fn_engine_lock(p_participant_id);
  perform public.fn_engine_require_day(p_participant_id, p_day, p_at, true);
  select * into e from public.fn_participant_engine(p_participant_id);
  select v.repetition into v_rep from public.plan_values v
  where v.plan_id = e.plan_id and v.day_number = p_day and v.task_field_id = p_field_id and v.deleted_at is null;
  if v_rep is null then
    raise exception 'لا تكرار لهذا الواجب في يومك' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.field_marks m
    where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
      and m.day_number = p_day and m.task_field_id = p_field_id and m.undone_at is null and m.deleted_at is null
  ) then
    raise exception 'رُصد هذا الواجب — تراجع عن رصده لتعدّل العدد' using errcode = '23514';
  end if;

  insert into public.field_counts (participant_id, plan_id, track_id, day_number, task_field_id, count)
  values (p_participant_id, e.plan_id, e.track_id, p_day, p_field_id, greatest(0, least(v_rep, p_delta)))
  on conflict (participant_id, plan_id, track_id, day_number, task_field_id) where deleted_at is null
  do update set count = greatest(0, least(v_rep, public.field_counts.count + p_delta))
  returning count into v_count;
  return v_count;
end;
$$;

create or replace function public.fn_mark_field_at(p_participant_id uuid, p_day int, p_field_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e        record;
  v_rep    int;
  v_count  int;
  v_exists boolean;
begin
  perform public.fn_engine_lock(p_participant_id);
  -- يُسلسَل مع حفظ الخطة: لا يُكتب إتمامٌ على يومٍ يُعاد كتابته في اللحظة نفسها.
  perform 1 from public.plans p
  where p.id = (select fn.plan_id from public.fn_participant_engine(p_participant_id) fn) for share;
  perform public.fn_engine_require_day(p_participant_id, p_day, p_at, true);
  select * into e from public.fn_participant_engine(p_participant_id);

  select true, v.repetition into v_exists, v_rep from public.plan_values v
  where v.plan_id = e.plan_id and v.day_number = p_day and v.task_field_id = p_field_id and v.deleted_at is null;
  if v_exists is null then
    raise exception 'ليس هذا الواجب في يومك' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.field_marks m
    where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
      and m.day_number = p_day and m.task_field_id = p_field_id and m.undone_at is null and m.deleted_at is null
  ) then
    raise exception 'رُصد هذا الواجب سلفاً' using errcode = '23514';
  end if;
  if v_rep is not null then
    select coalesce(c.count, 0) into v_count from public.field_counts c
    where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
      and c.day_number = p_day and c.task_field_id = p_field_id and c.deleted_at is null;
    if coalesce(v_count, 0) < v_rep then
      raise exception 'أكمل التكرار أولاً: % من %', public.fn_ar_digits(coalesce(v_count, 0)::text), public.fn_ar_digits(v_rep::text)
        using errcode = '23514';
    end if;
  end if;

  insert into public.field_marks (participant_id, plan_id, track_id, day_number, task_field_id, marked_at)
  values (p_participant_id, e.plan_id, e.track_id, p_day, p_field_id, p_at);

  update public.participants set status = 'memorizing'
  where id = p_participant_id and status = 'registered';

  -- BR-PLAN-01: اكتمال كل إلزاميٍّ له قيمةٌ في اليوم = إتمام يوم الخطة.
  perform public.fn_complete_day_at(p_participant_id, e.plan_id, e.track_id, p_day, p_at);

  return public.fn_journey_state_at(p_participant_id, p_at);
end;
$$;

create or replace function public.fn_undo_mark_at(p_participant_id uuid, p_day int, p_field_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e          record;
  v_mark     public.field_marks%rowtype;
  v_current  int;
  v_required boolean;
  v_today    date := public.fn_local_now(p_at)::date;
begin
  perform public.fn_engine_lock(p_participant_id);
  select * into e from public.fn_participant_engine(p_participant_id);
  select * into v_mark from public.field_marks m
  where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
    and m.day_number = p_day and m.task_field_id = p_field_id and m.undone_at is null and m.deleted_at is null;
  if v_mark.id is null then
    raise exception 'لا رصد حيّ لهذا الواجب' using errcode = '23514';
  end if;
  if public.fn_local_now(v_mark.marked_at)::date <> v_today
     or p_at > public.fn_cut_at(e.program_id, e.track_id, v_today) then
    raise exception 'التراجع في يوم الرصد قبل وقت نهاية رصده وحده' using errcode = '23514';
  end if;

  v_current := public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, p_at) + 1;
  if not (
    p_day = v_current
    or (p_day = v_current - 1
        and not exists (
          select 1 from public.day_openings o
          where o.participant_id = p_participant_id and o.plan_id = e.plan_id and o.track_id = e.track_id
            and o.day_number = v_current and o.deleted_at is null)
        and not exists (
          select 1 from public.field_marks m
          where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
            and m.day_number = v_current and m.undone_at is null and m.deleted_at is null))
  ) then
    raise exception 'بدأتَ ما بعده، فلا تراجع عنه' using errcode = '23514';
  end if;

  update public.field_marks set undone_at = p_at where id = v_mark.id;

  -- التراجع عن اختياريٍّ لا يُلغي إتمام اليوم — الإتمام بالإلزامي وحده.
  select f.is_required into v_required from public.task_fields f where f.id = p_field_id;
  if v_required then
    update public.day_completions c set undone_at = p_at
    where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
      and c.day_number = p_day and c.undone_at is null and c.deleted_at is null;
  end if;

  return public.fn_journey_state_at(p_participant_id, p_at);
end;
$$;

create or replace function public.fn_open_next_day_at(p_participant_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e       record;
  v_state jsonb;
begin
  perform public.fn_engine_lock(p_participant_id);
  v_state := public.fn_journey_state_at(p_participant_id, p_at);
  if v_state ->> 'state' = 'limit' then
    raise exception 'بلغت الحد اليومي — يُفتح واجب اليوم التالي غداً' using errcode = '23514';
  end if;
  if v_state ->> 'state' <> 'done_today' then
    raise exception 'لا يومٌ أُتمّ اليوم ليُبدأ ما بعده' using errcode = '23514';
  end if;
  select * into e from public.fn_participant_engine(p_participant_id);
  -- فتحٌ قديمٌ لليوم نفسه (من يومٍ تقويمي سبق) يُستبدل: البدء ليومه التقويمي.
  update public.day_openings o set deleted_at = p_at
  where o.participant_id = p_participant_id and o.plan_id = e.plan_id and o.track_id = e.track_id
    and o.day_number = (v_state ->> 'current_day')::int and o.deleted_at is null;
  insert into public.day_openings (participant_id, plan_id, track_id, day_number, opened_at)
  values (p_participant_id, e.plan_id, e.track_id, (v_state ->> 'current_day')::int, p_at);
  return public.fn_journey_state_at(p_participant_id, p_at);
end;
$$;

-- ══ ٣ · التسوية ══

create or replace function public.fn_settle_commitment_at(p_participant_id uuid, p_until timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e          record;
  s          record;
  v_status_p public.participant_status;
  v_until    date := public.fn_local_now(p_until)::date;
  v_from     date;
  v_day      date;
  v_cut      timestamptz;
  v_idx      int;
  v_done     int;
  v_on_day   int[];
  v_expected int;
  v_status   public.commitment_status;
  v_rows     int;
  v_written  int := 0;
begin
  select pa.status into v_status_p from public.participants pa
  where pa.id = p_participant_id and pa.deleted_at is null;
  -- من لا يتبع الخطة لا يُطالَب بيوم.
  if v_status_p is null or not public.fn_follows_plan(v_status_p) then
    return 0;
  end if;
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null or coalesce(e.day_count, 0) = 0 or e.start_date is null then
    return 0;
  end if;
  select * into s from public.fn_engine_settings(e.program_id, e.track_id);

  -- من آخر يومٍ مؤرشف: ما قبله حُكم عليه، فتكرار التسوية رخيص.
  select greatest(e.start_date, coalesce(max(a.calendar_date) + 1, e.start_date)) into v_from
  from public.commitment_archive a
  where a.participant_id = p_participant_id and a.deleted_at is null;

  for v_day in
    select g::date from generate_series(v_from, v_until, interval '1 day') g
  loop
    continue when not (extract(dow from v_day)::smallint = any (s.work_days) and not (v_day = any (s.exceptions)));
    v_cut := public.fn_cut_at(e.program_id, e.track_id, v_day);
    exit when v_cut >= p_until;  -- لم ينقضِ وقت رصده بعد، ولا ما بعده

    -- رتبة اليوم في أيام البرنامج تُحسب مرة عند أول يومٍ يُحكم عليه.
    if v_idx is null then
      v_idx := public.fn_program_days_through(e.program_id, e.track_id, e.start_date, v_day - 1);
    end if;
    v_idx := v_idx + 1;

    v_done := public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, v_cut);
    select coalesce(array_agg(c.day_number order by c.day_number), '{}') into v_on_day
    from public.day_completions c
    where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
      and c.deleted_at is null and c.completed_at <= v_cut
      and (c.undone_at is null or c.undone_at > v_cut)
      and public.fn_local_now(c.completed_at)::date = v_day;
    v_expected := least(e.day_count, v_idx);

    v_status := case
      when cardinality(v_on_day) > 0 then 'completed'
      -- أتمّ الخطة قبل هذا اليوم: لا مطالبة عليه — ويُكتب فلا يُحكم عليه إن طالت الخطة بعده.
      when public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id,
             (v_day::timestamp at time zone 'Asia/Riyadh')) >= e.day_count then 'exempt'
      when e.credit and v_done >= v_expected then 'exempt'
      else 'stumbled'
    end::public.commitment_status;

    insert into public.commitment_archive
      (participant_id, track_id, plan_id, calendar_date, deadline, status, plan_day, completed_days)
    values (p_participant_id, e.track_id, e.plan_id, v_day,
            public.fn_deadline_at(e.program_id, e.track_id, v_day), v_status,
            least(v_done + 1, e.day_count), v_on_day)
    on conflict (participant_id, calendar_date) where deleted_at is null do nothing;
    get diagnostics v_rows = row_count;
    v_written := v_written + v_rows;

    -- التعويض: عاد إلى موعده، فتُوسم أيام تعثّره قبله «معوَّضة» ولا تُحذف.
    if e.compensation and v_done >= v_expected then
      update public.commitment_archive a
      set compensated_at = v_cut
      where a.participant_id = p_participant_id and a.track_id = e.track_id and a.deleted_at is null
        and a.status = 'stumbled' and a.compensated_at is null and a.calendar_date < v_day;
    end if;
  end loop;

  return v_written;
end;
$$;

-- ══ المنح ══

do $$
declare
  f text;
begin
  foreach f in array array[
    'fn_engine_lock(uuid)', 'fn_due_days_at(uuid, uuid, date, int, timestamptz)',
    'fn_participant_track_moment(uuid)', 'fn_complete_day_at(uuid, uuid, uuid, int, timestamptz)',
    'fn_engine_require_day(uuid, int, timestamptz, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
  end loop;
end;
$$;
