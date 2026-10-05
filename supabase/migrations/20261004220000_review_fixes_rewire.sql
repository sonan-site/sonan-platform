-- 068 | إصلاحات مراجعة التوصيل (067) — الحكم لا يقع على ما لم يكن في يد المشارك
--
-- ١. **لحظةٌ يبدأ منها الحكم** (`participants.judge_from`): تُضبط عند الالتحاق،
--    وعند كل تغييرٍ في المسار (قبول نقلٍ أو إسنادُ مسارٍ لمن لا مسار له)، وعند
--    عودة الحالة إلى ما يتبع الخطة. ومعها لحظة أول حفظٍ لخطة مساره: **لا يُحكم
--    على يومٍ قبل أن يكون للمشارك مسارٌ وخطةٌ وحالةٌ تتبعها**. كانت التسوية تصمت
--    في الفجوة ثم تعود فتكتب أيامها «متعثّراً» في أرشيفٍ لا يُعاد.
-- ٢. **الموعد يُحسب من لحظة البدء بما أتمّه عندها:** العائد إلى مسارٍ سبق له
--    يحمل أيامه فيه، فلا يبدو متقدّماً بها ولا يُطالَب بأيام غيابه عنه.
-- ٣. **نافذة اليوم من وقت رصد اليوم السابق إلى وقت رصده:** ما أُتمّ بعد الوقت
--    قبل منتصف الليل يُحسب لليوم التالي — كان لا يُحسب لأيٍّ منهما، فمن يُتمّ
--    متأخراً كل يوم يُكتب متعثّراً كل يوم.
-- ٤. **الإتمام عند قراءة الحال بقفلٍ وفي جملةٍ واحدة**، كإتمام الرصد: لا يقع بين
--    حفظ الخطة وإعادة كتابة يومها، ولا بين فحصٍ وتراجعٍ متزامن.
-- ٥. **التسوية لا تنتظر ولا تُنتظر:** تأخذ قفل المشارك إن كان حرّاً وإلا تتركه
--    لقراءةٍ تالية — فلا تتشابك تسويتان. وقائمة المشرف تسوّي الأقدم أرشيفاً أولاً
--    في ميزانية وقتٍ، فلا يتجاوز تحميلها حدّ المهلة ولو طال الغياب.
-- ٦. نصوص: «لم يحن يومك الأول بعد» لمن التحق بعد البداية، و«لا يومَ».
-- ٧. حذف دوالّ القديم اليتيمة.
--
-- تراجع: نعم.

-- ══ ١ · لحظة البدء ══

alter table public.participants add column judge_from timestamptz;
comment on column public.participants.judge_from is
  'adr/0041 | اللحظة التي يبدأ منها الحكم عليه: الالتحاق، ثم كل تغييرٍ في المسار وكل عودةٍ إلى حالةٍ تتبع الخطة. يضبطها مشغّلٌ وحده.';

update public.participants pa
set judge_from = coalesce(
  (select max(r.decided_at) from public.track_change_requests r
    where r.participant_id = pa.id and r.status = 'approved' and r.to_track_id = pa.track_id),
  pa.joined_at
);
alter table public.participants alter column judge_from set not null;
alter table public.participants alter column judge_from set default now();

/** يضبط لحظة البدء — ولا يقبلها من كاتبٍ مباشر. */
create or replace function public.fn_participant_judge_from()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.judge_from := coalesce(new.joined_at, now());
  elsif new.track_id is distinct from old.track_id
     or (public.fn_follows_plan(new.status) and not public.fn_follows_plan(old.status)) then
    new.judge_from := now();
  else
    new.judge_from := old.judge_from;
  end if;
  return new;
end;
$$;

create trigger trg_participants_judge_from
  before insert or update on public.participants
  for each row execute function public.fn_participant_judge_from();

drop function public.fn_participant_track_moment(uuid);
drop function public.fn_due_days_at(uuid, uuid, date, int, timestamptz);
drop function public.fn_participant_engine(uuid);

/**
 * سياق المحرّك لمشارك: برنامجه ومساره وخطته الفعلية وإعداداته بعد الوراثة،
 * ويومه الأول، وما أتمّه عنده (`base_done`).
 *
 * **يومه الأول** = تاريخ البداية، أو يوم لحظة البدء إن جاءت بعده — ولحظة البدء
 * أحدث الاثنين: `judge_from`، وأول حفظٍ لخطة مساره. ومن بدأ بعد وقت نهاية رصد
 * يومٍ فيومه الأول ما بعده.
 */
create function public.fn_participant_engine(
  p_participant_id uuid,
  out program_id   uuid,
  out track_id     uuid,
  out plan_id      uuid,
  out day_count    int,
  out start_date   date,
  out daily_limit  int,
  out credit       boolean,
  out compensation boolean,
  out measure      public.progress_measure,
  out base_done    int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_judge  timestamptz;
  v_plan   timestamptz;
  v_moment timestamptz;
  v_first  date;
begin
  select pa.program_id, pa.track_id, pa.judge_from into program_id, track_id, v_judge
  from public.participants pa
  where pa.id = p_participant_id and pa.deleted_at is null;
  if track_id is null then
    return;
  end if;
  plan_id := public.fn_track_plan(track_id);
  select p.day_count, coalesce((select min(v.created_at) from public.plan_versions v where v.plan_id = p.id), p.created_at)
  into day_count, v_plan
  from public.plans p where p.id = plan_id;
  select s.start_date, s.daily_limit, s.credit_enabled, s.compensation_enabled, s.progress_measure
  into start_date, daily_limit, credit, compensation, measure
  from public.fn_engine_settings(program_id, track_id) s;

  v_moment := greatest(v_judge, v_plan);
  v_first := public.fn_local_now(v_moment)::date;
  if v_moment >= public.fn_cut_at(program_id, track_id, v_first) then
    v_first := v_first + 1;
  end if;
  start_date := greatest(coalesce(start_date, v_first), v_first);
  base_done := case when plan_id is null then 0
                    else public.fn_done_days_at(p_participant_id, plan_id, track_id, v_moment) end;
end;
$$;

/**
 * موعده: ما أتمّه عند البدء، وأيام البرنامج التي انقضى وقت رصدها بعده —
 * اليوم لا يُحسب قبل وقته. بحدّ أيام الخطة.
 */
create function public.fn_due_days_at(
  p_program_id uuid, p_track_id uuid, p_start date, p_day_count int, p_base int, p_at timestamptz
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
    coalesce(p_base, 0)
    + public.fn_program_days_through(p_program_id, p_track_id, p_start, t.today - 1)
    + case when t.today >= p_start
            and public.fn_is_program_day(p_program_id, p_track_id, t.today)
            and p_at >= public.fn_cut_at(p_program_id, p_track_id, t.today)
           then 1 else 0 end
  ) end
  from t;
$$;

-- ══ ٤ · الإتمام بقفلٍ وفي جملةٍ واحدة ══

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
  perform public.fn_engine_lock(p_participant_id);
  -- كما في الرصد: لا يُكتب إتمامٌ على يومٍ يُعاد كتابته في اللحظة نفسها.
  perform 1 from public.plans p where p.id = p_plan_id for share;

  insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
  select p_participant_id, p_plan_id, p_track_id, p_day, p_at
  where exists (
      select 1 from public.plan_values v
      join public.task_fields f on f.id = v.task_field_id and f.is_required
      where v.plan_id = p_plan_id and v.day_number = p_day and v.deleted_at is null
    )
    and not exists (
      select 1 from public.plan_values v
      join public.task_fields f on f.id = v.task_field_id and f.is_required
      where v.plan_id = p_plan_id and v.day_number = p_day and v.deleted_at is null
        and not exists (
          select 1 from public.field_marks m
          where m.participant_id = p_participant_id and m.plan_id = p_plan_id and m.track_id = p_track_id
            and m.day_number = p_day and m.task_field_id = v.task_field_id
            and m.undone_at is null and m.deleted_at is null
        )
    )
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

  -- المتوقَّع: ما أتمّه عند البدء، وأيام البرنامج بعده حتى اليوم ضمناً.
  v_expected := least(e.day_count,
    e.base_done + public.fn_program_days_through(e.program_id, e.track_id, e.start_date, v_today));

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
    'due_days', public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.base_done, p_at),
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

-- ══ ٦ · نصوص الرصد ══

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
    raise exception 'لم يحن يومك الأول بعد' using errcode = '23514';
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
    raise exception 'لا يومَ أُتمّ اليوم ليُبدأ ما بعده' using errcode = '23514';
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
  -- «بدأ ما بعده» بفتحٍ في يومه التقويمي أو برصدٍ فيه — كما تقرؤه الحال.
  if not (
    p_day = v_current
    or (p_day = v_current - 1
        and not exists (
          select 1 from public.day_openings o
          where o.participant_id = p_participant_id and o.plan_id = e.plan_id and o.track_id = e.track_id
            and o.day_number = v_current and o.deleted_at is null
            and public.fn_local_now(o.opened_at)::date = v_today)
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

-- ══ ٣ · ٥ · التسوية ══

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
  v_prev_cut timestamptz;
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
  -- مشاركٌ تُسوّيه معاملةٌ أخرى الآن يُترك لها: التسوية متكرّرة الأمان، وانتظارها
  -- يُشابك تسويتين تمشيان المشاركين بترتيبين مختلفين.
  if not pg_try_advisory_xact_lock(hashtextextended('engine:' || p_participant_id::text, 0)) then
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

  -- نافذة اليوم تبدأ بعد وقت رصد آخر يومٍ من أيام البرنامج قبله: ما أُتمّ بعد
  -- الوقت يُحسب لما بعده، وما أُتمّ في يوم الراحة يُحسب لأول يومٍ بعدها.
  select max(public.fn_cut_at(e.program_id, e.track_id, g::date)) into v_prev_cut
  from generate_series(v_from - 14, v_from - 1, interval '1 day') g
  where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));
  v_prev_cut := coalesce(v_prev_cut, '-infinity'::timestamptz);

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
      and c.deleted_at is null
      and c.completed_at > v_prev_cut and c.completed_at <= v_cut
      and (c.undone_at is null or c.undone_at > v_cut);
    -- المتوقَّع: ما أتمّه عند البدء، وأيام البرنامج بعده.
    v_expected := least(e.day_count, e.base_done + v_idx);

    v_status := case
      when cardinality(v_on_day) > 0 then 'completed'
      -- أتمّ الخطة قبل هذا اليوم: لا مطالبة عليه — ويُكتب فلا يُحكم عليه إن طالت الخطة بعده.
      when public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, v_prev_cut) >= e.day_count then 'exempt'
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
    v_prev_cut := v_cut;
  end loop;

  return v_written;
end;
$$;

-- ══ اللوحة وقائمة المشرف ══

create or replace function public.fn_my_duties()
returns table (
  participant_id uuid,
  program_id     uuid,
  program_name   text,
  program_status public.program_status,
  track_name     text,
  status         public.participant_status,
  follows_plan   boolean,
  day_count      int,
  done_days      int,
  progress_pct   numeric,
  due_days       int,
  last_marked_at timestamptz,
  proposed_track text,
  contact        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pa.id,
    p.id,
    p.name,
    p.status,
    t.name,
    pa.status,
    public.fn_follows_plan(pa.status),
    coalesce(e.day_count, 0),
    coalesce(pr.done_days, 0),
    coalesce(pr.percent, 0),
    case when e.plan_id is null then 0
         else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.base_done, now()) end,
    (select max(m.marked_at) from public.field_marks m
      where m.participant_id = pa.id and m.undone_at is null and m.deleted_at is null),
    r.to_name,
    p.contact
  from public.participants pa
  join public.programs p on p.id = pa.program_id and p.deleted_at is null
  -- بلا شرط `deleted_at` على المسار بقصد: المؤرشف يبقى اسمه ظاهراً لصاحبه.
  left join public.tracks t on t.id = pa.track_id
  left join lateral public.fn_participant_engine(pa.id) e on true
  -- النسبة من الدالة التي تقرؤها شاشة الرحلة — رقمٌ واحد على الشاشتين.
  left join lateral public.fn_progress_at(pa.id, now()) pr on true
  left join lateral (
    -- طلب النقل تُنشئه الإدارة عن المشارك لا العكس، فالصياغة «تُقترح» لا «طلبك».
    select tt.name as to_name
    from public.track_change_requests cr
    join public.tracks tt on tt.id = cr.to_track_id
    where cr.participant_id = pa.id
      and cr.status = 'pending'
      and cr.deleted_at is null
    limit 1
  ) r on true
  where pa.user_id = (select auth.uid())
    and pa.deleted_at is null
  order by p.name;
$$;

/**
 * المشاركون صفّاً لكل واحد: يوم خطته، وموعده، وتعثّره، وأيامه في مساراتٍ سبقت.
 *
 * **تسوّي قبل أن تعدّ** (`adr/0041`): الأرشيف يُكتب عند قراءة حال المشارك، فمن
 * غاب عن المنصة لا يُكتب تعثّره حتى يُقرأ — والمشرف يقرؤه هنا. **الأقدم أرشيفاً
 * أولاً، في ميزانية ثانيتين**: بعد غيابٍ طويل لا يتجاوز التحميل حدّ المهلة، وكل
 * تحميلٍ يُكمل ما بعده.
 */
create or replace function public.fn_program_participants(p_program_id uuid, p_limit int default 200, p_offset int default 0)
returns table (
  id                  uuid,
  full_name           text,
  track_id            uuid,
  status              public.participant_status,
  joined_at           timestamptz,
  baseline_percentage numeric,
  day_count           int,
  done_days           int,
  due_days            int,
  stumbled_days       int,
  compensated_days    int,
  prior_done_days     int,
  total               bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_started timestamptz := clock_timestamp();
begin
  if not public.fn_has_permission('participants.read', p_program_id) then
    return;
  end if;

  for v_id in
    select pa.id
    from public.participants pa
    left join lateral (
      select max(a.calendar_date) as last from public.commitment_archive a
      where a.participant_id = pa.id and a.deleted_at is null
    ) l on true
    where pa.program_id = p_program_id and pa.deleted_at is null
      and pa.track_id is not null and public.fn_follows_plan(pa.status)
    order by l.last nulls first, pa.id
  loop
    perform public.fn_settle_commitment_at(v_id, now());
    exit when clock_timestamp() - v_started > interval '2 seconds';
  end loop;

  return query
  with roster as (
    select p.id, p.user_id, p.track_id, p.status, p.joined_at, p.baseline_percentage
    from public.participants p
    where p.program_id = p_program_id and p.deleted_at is null
  ),
  eng as (
    select r.id, e.program_id, e.track_id, e.plan_id, e.day_count, e.start_date,
           case when e.plan_id is null then 0
                else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.base_done, now())
           end as due
    from roster r
    cross join lateral public.fn_participant_engine(r.id) e
  ),
  done as (
    select c.participant_id,
           (count(*) filter (where c.plan_id = e.plan_id and c.track_id = e.track_id))::int as cur,
           (count(*) filter (where c.track_id is distinct from e.track_id))::int as prior
    from public.day_completions c
    join eng e on e.id = c.participant_id
    where c.deleted_at is null and c.undone_at is null
    group by c.participant_id
  ),
  stumbles as (
    select a.participant_id,
           (count(*) filter (where a.status = 'stumbled'))::int as n,
           (count(*) filter (where a.status = 'stumbled' and a.compensated_at is not null))::int as comp
    from public.commitment_archive a
    join eng e on e.id = a.participant_id and a.track_id = e.track_id
    where a.deleted_at is null
    group by a.participant_id
  )
  select
    r.id,
    pr.full_name,
    r.track_id,
    r.status,
    r.joined_at,
    r.baseline_percentage,
    coalesce(e.day_count, 0),
    coalesce(d.cur, 0),
    coalesce(e.due, 0),
    coalesce(s.n, 0),
    coalesce(s.comp, 0),
    coalesce(d.prior, 0),
    count(*) over ()
  from roster r
  left join public.profiles pr on pr.user_id = r.user_id
  left join eng e on e.id = r.id
  left join done d on d.participant_id = r.id
  left join stumbles s on s.participant_id = r.id
  order by r.joined_at desc, r.id
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
end;
$$;

-- ══ ٧ · اليتيمة ══

drop function if exists public.fn_guard_plan_day_refs();
drop function if exists public.fn_participant_plan_id(uuid);
drop function if exists public.fn_participant_track_id(uuid);

-- ══ المنح ══

revoke all on function public.fn_participant_judge_from() from public;
revoke all on function public.fn_participant_engine(uuid) from public;
revoke all on function public.fn_due_days_at(uuid, uuid, date, int, int, timestamptz) from public;
