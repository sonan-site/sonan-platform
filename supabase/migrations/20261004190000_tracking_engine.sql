-- 065 | الرصد والعدّاد والتسوية — المحرّك عند المشارك (adr/0036 · 0037 · 0041)
--
-- المشارك يقف على يوم خطته (أول يومٍ لم يُتمّه)، ويرصد كل حقلٍ وحده. والحقل
-- الذي له تكرار يُعدّ بالعدّاد، ولا يُرصد قبل أن يبلغ العدد. **ولا ينتقل إلى
-- يوم الخطة التالي إلا بإتمام كل حقلٍ إلزامي في يومه** (`BR-PLAN-01`) — فيبقى
-- الربط والمراجعة على ما حفظه فعلاً.
--
-- **والتقويم يحكم ولا يحرّك** (`BR-PLAN-04`): عند وقت نهاية رصد كل يومٍ من
-- أيام البرنامج يُكتب في أرشيف الالتزام حكمٌ ثابت — أتمّ، أو معفى برصيد
-- التقدّم، أو متعثّر — ولا يُعاد. وتكتبه دالة التسوية عند قراءة حال المشارك
-- وقبل تغيير الإعدادات، لا مجدوِلٌ آلي.
--
-- **الحالة مفتاحها (مشارك، خطة، مسار):** المسارات قد تشترك في الخطة
-- الافتراضية، ومن انتقل إلى مسارٍ آخر يبدأ مادته من أولها (adr/0027) — ومن
-- عاد إلى مسارٍ سبق له يُكمل من موضعه فيه.
--
-- **وللدوالّ الكاتبة نظيرٌ بوقتٍ صريح** (`_at`) لا يُمنح لأحد: الاختبار وحده
-- يكتب بأوقات مضت. والمشارك يرصد بـ«الآن» دائماً.
--
-- تراجع: نعم.

-- ══ البنية ══

create type public.commitment_status as enum ('completed', 'exempt', 'stumbled');

create table public.field_counts (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete restrict,
  plan_id        uuid not null references public.plans (id) on delete restrict,
  track_id       uuid not null references public.tracks (id) on delete restrict,
  day_number     int not null,
  task_field_id  uuid not null references public.task_fields (id) on delete restrict,
  count          int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
comment on table public.field_counts is
  'adr/0037 | عدّاد التكرار — يُكتب بزرّيه أولاً بأول، ويتجمّد ما دام للحقل رصدٌ حيّ.';
alter table public.field_counts add constraint chk_field_counts_count check (count between 0 and 1000);
create unique index idx_field_counts_cell
  on public.field_counts (participant_id, plan_id, track_id, day_number, task_field_id) where deleted_at is null;
create trigger trg_field_counts_updated_at before update on public.field_counts
  for each row execute function public.fn_set_updated_at();
alter table public.field_counts enable row level security;

create table public.field_marks (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete restrict,
  plan_id        uuid not null references public.plans (id) on delete restrict,
  track_id       uuid not null references public.tracks (id) on delete restrict,
  day_number     int not null,
  task_field_id  uuid not null references public.task_fields (id) on delete restrict,
  marked_at      timestamptz not null,
  undone_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
comment on table public.field_marks is
  'adr/0041 | سجلّ الرصد بأوقاته. التراجع وسمٌ (undone_at) لا حذف — فيبقى ما رُصد ثم أُلغي.';
create unique index idx_field_marks_live
  on public.field_marks (participant_id, plan_id, track_id, day_number, task_field_id)
  where undone_at is null and deleted_at is null;
create index idx_field_marks_participant on public.field_marks (participant_id, marked_at desc);
create trigger trg_field_marks_updated_at before update on public.field_marks
  for each row execute function public.fn_set_updated_at();
alter table public.field_marks enable row level security;

create table public.day_openings (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete restrict,
  plan_id        uuid not null references public.plans (id) on delete restrict,
  track_id       uuid not null references public.tracks (id) on delete restrict,
  day_number     int not null,
  opened_at      timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
comment on table public.day_openings is
  'adr/0036 | «بدء واجب اليوم التالي» في اليوم التقويمي نفسه — وبه تُغلق نافذة التراجع على ما قبله.';
create unique index idx_day_openings_day
  on public.day_openings (participant_id, plan_id, track_id, day_number) where deleted_at is null;
create trigger trg_day_openings_updated_at before update on public.day_openings
  for each row execute function public.fn_set_updated_at();
alter table public.day_openings enable row level security;

create table public.commitment_archive (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete restrict,
  track_id       uuid not null references public.tracks (id) on delete restrict,
  plan_id        uuid not null references public.plans (id) on delete restrict,
  calendar_date  date not null,
  deadline       time not null,
  status         public.commitment_status not null,
  plan_day       int not null,
  completed_days int[] not null default '{}',
  compensated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
comment on table public.commitment_archive is
  'adr/0041 | حكم كل يومٍ من أيام البرنامج عند وقت نهاية رصده — واقعةٌ لا يُعاد حسابها. وسم التعويض وحده يُضاف بعدها.';
alter table public.commitment_archive add constraint chk_commitment_compensation
  check (compensated_at is null or status = 'stumbled');
create unique index idx_commitment_archive_day
  on public.commitment_archive (participant_id, calendar_date) where deleted_at is null;
create trigger trg_commitment_archive_updated_at before update on public.commitment_archive
  for each row execute function public.fn_set_updated_at();
alter table public.commitment_archive enable row level security;

-- ══ السياق ══

/** يوم التحاق المشارك بمساره الحالي: آخر قبولٍ نقله إليه، وإلا التحاقه بالبرنامج. */
create or replace function public.fn_participant_track_start(p_participant_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_local_now(coalesce(
    (select max(r.decided_at) from public.track_change_requests r
      where r.participant_id = pa.id and r.status = 'approved' and r.to_track_id = pa.track_id),
    pa.joined_at
  ))::date
  from public.participants pa
  where pa.id = p_participant_id;
$$;

/**
 * سياق المحرّك لمشارك: برنامجه ومساره وخطته الفعلية وإعداداته بعد الوراثة،
 * وتاريخ بداية تقويمه (تاريخ البداية إن ضُبط، وإلا يوم التحاقه بمساره).
 */
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
  start_date := coalesce(start_date, public.fn_participant_track_start(p_participant_id));
end;
$$;

/** وقت نهاية رصد يومٍ تقويمي لحظةً زمنية — بتوقيت الرياض. */
create or replace function public.fn_cut_at(p_program_id uuid, p_track_id uuid, p_date date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (p_date + public.fn_deadline_at(p_program_id, p_track_id, p_date)) at time zone 'Asia/Riyadh';
$$;

/** عدد أيام البرنامج من البداية حتى اليوم ضمناً — ومنه «اليوم المتوقع». */
create or replace function public.fn_program_days_through(p_program_id uuid, p_track_id uuid, p_start date, p_date date)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from generate_series(p_start, p_date, interval '1 day') g
  where p_date >= p_start and public.fn_is_program_day(p_program_id, p_track_id, g::date);
$$;

/** أيام الخطة التي أتمّها المشارك حيّةً عند لحظة — والإتمام متتابع فعدّها موضعه. */
create or replace function public.fn_done_days_at(p_participant_id uuid, p_plan_id uuid, p_track_id uuid, p_at timestamptz)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.day_completions c
  where c.participant_id = p_participant_id and c.plan_id = p_plan_id and c.track_id = p_track_id
    and c.deleted_at is null and c.completed_at <= p_at
    and (c.undone_at is null or c.undone_at > p_at);
$$;

/** يتحقّق أن المستدعي صاحب المشاركة، أو يملك قراءة المشاركين في برنامجها. */
create or replace function public.fn_engine_access(p_participant_id uuid, p_write boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner   uuid;
  v_program uuid;
  v_status  public.participant_status;
begin
  select pa.user_id, pa.program_id, pa.status into v_owner, v_program, v_status
  from public.participants pa where pa.id = p_participant_id and pa.deleted_at is null;
  if v_program is null then
    raise exception 'مشاركة غير معروفة' using errcode = '22023';
  end if;
  -- سياق القاعدة (دالةٌ تستدعي أخرى، أو اتصالٌ مباشر) بلا مستخدم: لا يبلغه أحدٌ من
  -- الواجهة — الدوالّ لا تُمنح لـ`anon`، وطلب `authenticated` يحمل هويته دائماً.
  if (select auth.uid()) is null then
    return;
  end if;
  if v_owner is not null and v_owner = (select auth.uid()) then
    if p_write and not public.fn_is_active() then
      raise exception 'حسابك موقوف' using errcode = '42501';
    end if;
    if p_write and not public.fn_follows_plan(v_status) then
      raise exception 'مشاركتك لا تتبع الخطة الآن' using errcode = '42501';
    end if;
    return;
  end if;
  if not p_write and public.fn_has_permission('participants.read', v_program) then
    return;
  end if;
  raise exception 'لا صلاحية لك على هذه المشاركة' using errcode = '42501';
end;
$$;

-- ══ الحالة ══

/**
 * حال المشارك في لحظة — يومه وحالته وموعده وتعثّره ونسبته. تسوّي ما مضى أولاً.
 *
 * `state`: `no_plan` · `not_started` · `tasks` (يرصد يومه) · `done_today`
 * (أتمّ يوماً اليوم ويستطيع بدء التالي) · `limit` (بلغ الحد اليومي) · `finished`.
 */
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
  v_current := least(v_done + 1, e.day_count + 1);
  select count(*)::int into v_today_n from public.day_completions c
  where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
    and c.deleted_at is null and c.undone_at is null and c.completed_at <= p_at
    and public.fn_local_now(c.completed_at)::date = v_today;
  select c.completed_at into v_prev_at from public.day_completions c
  where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
    and c.day_number = v_current - 1 and c.deleted_at is null and c.undone_at is null;
  v_opened := exists (
    select 1 from public.day_openings o
    where o.participant_id = p_participant_id and o.plan_id = e.plan_id and o.track_id = e.track_id
      and o.day_number = v_current and o.deleted_at is null
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
    'daily_limit', e.daily_limit,
    'start_date', e.start_date,
    'today', v_today,
    'is_program_day', public.fn_is_program_day(e.program_id, e.track_id, v_today),
    'deadline', to_char(v_deadline, 'HH24:MI'),
    'expected_day', v_expected,
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

create or replace function public.fn_journey_state(p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_engine_access(p_participant_id, false);
  return public.fn_journey_state_at(p_participant_id, now());
end;
$$;

/**
 * واجب يوم خطةٍ لمشارك — حقوله ونطاقاتها بالرتبة، والتكرار والعدّاد والرصد.
 * بلا يوم: يومه الحالي. ولا يُعرض يومٌ بعد يومه.
 */
create or replace function public.fn_day_tasks(p_participant_id uuid, p_day int default null)
returns table (
  day_number    int,
  task_field_id uuid,
  label         text,
  kind          public.field_kind,
  is_required   boolean,
  is_material_linked boolean,
  sort_order    int,
  count_unit    text,
  amount        int,
  ord_from      int,
  ord_to        int,
  value         numeric,
  repetition    int,
  count         int,
  marked_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e     record;
  v_day int;
  v_cur int;
begin
  perform public.fn_engine_access(p_participant_id, false);
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null then
    return;
  end if;
  v_cur := least(public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, now()) + 1, e.day_count);
  v_day := coalesce(p_day, v_cur);
  if v_day < 1 or v_day > v_cur then
    return;
  end if;

  return query
  select v.day_number, f.id, f.label, f.kind, f.is_required, f.is_material_linked, f.sort_order, f.count_unit,
         v.amount,
         case
           when f.kind::text = 'ranged' then coalesce((
             select sum(b.amount)::int from public.plan_values b
             where b.plan_id = e.plan_id and b.task_field_id = f.id and b.deleted_at is null and b.day_number < v_day
           ), 0) + 1
           when f.kind::text = 'explicit' and f.is_material_linked then public.fn_track_ordinal_of(e.track_id, v.from_sequence)
           when f.kind::text = 'explicit' then v.from_sequence
         end,
         case
           when f.kind::text = 'ranged' then coalesce((
             select sum(b.amount)::int from public.plan_values b
             where b.plan_id = e.plan_id and b.task_field_id = f.id and b.deleted_at is null and b.day_number <= v_day
           ), 0)
           when f.kind::text = 'explicit' and f.is_material_linked then public.fn_track_ordinal_of(e.track_id, v.to_sequence)
           when f.kind::text = 'explicit' then v.to_sequence
         end,
         v.value, v.repetition,
         coalesce((
           select c.count from public.field_counts c
           where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
             and c.day_number = v_day and c.task_field_id = f.id and c.deleted_at is null
         ), 0),
         (select m.marked_at from public.field_marks m
           where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
             and m.day_number = v_day and m.task_field_id = f.id and m.undone_at is null and m.deleted_at is null)
  from public.plan_values v
  join public.task_fields f on f.id = v.task_field_id
  where v.plan_id = e.plan_id and v.day_number = v_day and v.deleted_at is null
  order by f.sort_order, f.label;
end;
$$;

-- ══ الرصد ══

/** يُرفض ما لا يقع على يوم الخطة الحالي وهو مفتوح للرصد. */
create or replace function public.fn_engine_require_tasks(p_participant_id uuid, p_day int, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
begin
  v_state := public.fn_journey_state_at(p_participant_id, p_at);
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
  if p_day <> (v_state ->> 'current_day')::int then
    raise exception 'يُرصد يوم خطتك الحالي وحده (اليوم %)', public.fn_ar_digits(v_state ->> 'current_day')
      using errcode = '23514';
  end if;
  return v_state;
end;
$$;

/** العدّاد: زائدٌ أو ناقص، بين صفرٍ والعدد المطلوب. ويتجمّد ما دام للحقل رصدٌ حيّ. */
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
  perform public.fn_engine_require_tasks(p_participant_id, p_day, p_at);
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

/**
 * رصد حقلٍ في يوم الخطة الحالي — وبإتمام كل إلزاميٍّ فيه يُكتب إتمام اليوم
 * (`BR-PLAN-01`)، فينتقل المشارك إلى التالي.
 */
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
  -- يُسلسَل مع حفظ الخطة: لا يُكتب إتمامٌ على يومٍ يُعاد كتابته في اللحظة نفسها.
  perform 1 from public.plans p
  where p.id = (select fn.plan_id from public.fn_participant_engine(p_participant_id) fn) for share;
  perform public.fn_engine_require_tasks(p_participant_id, p_day, p_at);
  select * into e from public.fn_participant_engine(p_participant_id);

  select true, v.repetition into v_exists, v_rep from public.plan_values v
  where v.plan_id = e.plan_id and v.day_number = p_day and v.task_field_id = p_field_id and v.deleted_at is null;
  if v_exists is null then
    raise exception 'لا هذا الواجب في يومك' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.field_marks m
    where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
      and m.day_number = p_day and m.task_field_id = p_field_id and m.undone_at is null and m.deleted_at is null
  ) then
    raise exception 'رُصد هذا الواجب سلفاً' using errcode = '23505';
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
  if not exists (
    select 1 from public.plan_values v
    join public.task_fields f on f.id = v.task_field_id and f.is_required
    where v.plan_id = e.plan_id and v.day_number = p_day and v.deleted_at is null
      and not exists (
        select 1 from public.field_marks m
        where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
          and m.day_number = p_day and m.task_field_id = v.task_field_id
          and m.undone_at is null and m.deleted_at is null
      )
  ) then
    insert into public.day_completions (participant_id, plan_id, track_id, day_number, completed_at)
    values (p_participant_id, e.plan_id, e.track_id, p_day, p_at);
  end if;

  return public.fn_journey_state_at(p_participant_id, p_at);
end;
$$;

/**
 * التراجع عن رصد — وسمٌ لا حذف. يُتاح في يومه التقويمي قبل وقت نهاية رصده،
 * ولليوم الحالي، أو للذي قبله ما لم يُبدأ واجب التالي ولم يُرصد فيه شيء.
 */
create or replace function public.fn_undo_mark_at(p_participant_id uuid, p_day int, p_field_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e         record;
  v_mark    public.field_marks%rowtype;
  v_current int;
  v_today   date := public.fn_local_now(p_at)::date;
begin
  select * into e from public.fn_participant_engine(p_participant_id);
  select * into v_mark from public.field_marks m
  where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
    and m.day_number = p_day and m.task_field_id = p_field_id and m.undone_at is null and m.deleted_at is null;
  if v_mark.id is null then
    raise exception 'لا رصد حيّ لهذا الواجب' using errcode = '22023';
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
  update public.day_completions c set undone_at = p_at
  where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
    and c.day_number = p_day and c.undone_at is null and c.deleted_at is null;

  return public.fn_journey_state_at(p_participant_id, p_at);
end;
$$;

/** بدء واجب اليوم التالي — بعد إتمام يومٍ اليوم، في حدود الحد اليومي. */
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
  v_state := public.fn_journey_state_at(p_participant_id, p_at);
  if v_state ->> 'state' = 'limit' then
    raise exception 'بلغت الحد اليومي — يُفتح واجب اليوم التالي غداً' using errcode = '23514';
  end if;
  if v_state ->> 'state' <> 'done_today' then
    raise exception 'لا يومٌ أُتمّ اليوم ليُبدأ ما بعده' using errcode = '23514';
  end if;
  select * into e from public.fn_participant_engine(p_participant_id);
  insert into public.day_openings (participant_id, plan_id, track_id, day_number, opened_at)
  values (p_participant_id, e.plan_id, e.track_id, (v_state ->> 'current_day')::int, p_at);
  return public.fn_journey_state_at(p_participant_id, p_at);
end;
$$;

-- النظائر العامة: «الآن» وحده، وصاحب المشاركة وحده.
create or replace function public.fn_count_repetition(p_participant_id uuid, p_day int, p_field_id uuid, p_delta int)
returns int language plpgsql security definer set search_path = '' as $$
begin
  perform public.fn_engine_access(p_participant_id, true);
  if p_delta not in (-1, 1) then
    raise exception 'العدّاد يزيد واحداً أو ينقص واحداً' using errcode = '22023';
  end if;
  return public.fn_count_repetition_at(p_participant_id, p_day, p_field_id, p_delta, now());
end; $$;

create or replace function public.fn_mark_field(p_participant_id uuid, p_day int, p_field_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.fn_engine_access(p_participant_id, true);
  return public.fn_mark_field_at(p_participant_id, p_day, p_field_id, now());
end; $$;

create or replace function public.fn_undo_mark(p_participant_id uuid, p_day int, p_field_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.fn_engine_access(p_participant_id, true);
  return public.fn_undo_mark_at(p_participant_id, p_day, p_field_id, now());
end; $$;

create or replace function public.fn_open_next_day(p_participant_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.fn_engine_access(p_participant_id, true);
  return public.fn_open_next_day_at(p_participant_id, now());
end; $$;

-- ══ التسوية — adr/0041 ══

/**
 * يكتب حكم كل يومٍ من أيام البرنامج انقضى وقت رصده ولم يُؤرشَف — بأوقات الرصد
 * المسجّلة — ثم يسم التعويض إن استحقّ (`BR-PLAN-04`). تكرارها لا يغيّر نتيجتها.
 */
create or replace function public.fn_settle_commitment_at(p_participant_id uuid, p_until timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e          record;
  v_now      timestamp := public.fn_local_now(p_until);
  v_day      date;
  v_cut      timestamptz;
  v_idx      int := 0;
  v_done     int;
  v_on_day   int[];
  v_expected int;
  v_status   public.commitment_status;
  v_written  int := 0;
begin
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null or coalesce(e.day_count, 0) = 0 or e.start_date is null then
    return 0;
  end if;

  for v_day in
    select g::date from generate_series(e.start_date, v_now::date, interval '1 day') g
  loop
    if not public.fn_is_program_day(e.program_id, e.track_id, v_day) then
      continue;
    end if;
    v_idx := v_idx + 1;
    v_cut := public.fn_cut_at(e.program_id, e.track_id, v_day);
    exit when v_cut >= p_until;  -- لم ينقضِ وقت رصده بعد، ولا ما بعده

    continue when exists (
      select 1 from public.commitment_archive a
      where a.participant_id = p_participant_id and a.calendar_date = v_day and a.deleted_at is null
    );
    -- أتمّ الخطة قبل هذا اليوم: لا مطالبة عليه.
    continue when public.fn_done_days_at(
      p_participant_id, e.plan_id, e.track_id, (v_day::timestamp at time zone 'Asia/Riyadh')
    ) >= e.day_count;

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
      when e.credit and v_done >= v_expected then 'exempt'
      else 'stumbled'
    end::public.commitment_status;

    insert into public.commitment_archive
      (participant_id, track_id, plan_id, calendar_date, deadline, status, plan_day, completed_days)
    values (p_participant_id, e.track_id, e.plan_id, v_day,
            public.fn_deadline_at(e.program_id, e.track_id, v_day), v_status,
            least(v_done + 1, e.day_count), v_on_day);
    v_written := v_written + 1;

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

/** يسوّي مشاركي برنامجٍ أو مسار — قبل تغيير إعداداته، فلا يُحكم على الماضي بإعدادٍ لاحق. */
create or replace function public.fn_settle_scope(p_program_id uuid, p_track_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_total int := 0;
begin
  for v_id in
    select pa.id from public.participants pa
    where pa.program_id = p_program_id and pa.deleted_at is null and pa.track_id is not null
      and public.fn_follows_plan(pa.status)
      and (p_track_id is null or pa.track_id = p_track_id)
  loop
    v_total := v_total + public.fn_settle_commitment_at(v_id, now());
  end loop;
  return v_total;
end;
$$;

/**
 * نسبة إنجاز المشارك في لحظة — من سجلّ الإتمام بأوقاته لا من حالته الحاضرة
 * (`adr/0040`). ومعها آخر وحدةٍ بلغها الأساس: نطاق أسئلته (`BR-EXAM-01`).
 */
create or replace function public.fn_progress_at(p_participant_id uuid, p_at timestamptz)
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
  perform public.fn_engine_access(p_participant_id, false);
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

-- ══ الإعدادات تُسوّي قبل أن تُكتب — adr/0041 ══

create or replace function public.fn_settle_before_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- مرةً لكل معاملة: الإعداد الواحد قد يكتب صفوفاً عدّة.
  if current_setting('app.settled_scope', true) is distinct from coalesce(new.id, old.id)::text then
    perform set_config('app.settled_scope', coalesce(new.id, old.id)::text, true);
    if tg_table_name = 'programs' then
      perform public.fn_settle_scope(new.id, null);
    else
      perform public.fn_settle_scope(new.program_id, new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_programs_settle_first
  before update of start_date, work_days, daily_limit, credit_enabled, compensation_enabled, progress_measure
  on public.programs
  for each row execute function public.fn_settle_before_setting();
create trigger trg_tracks_settle_first
  before update of start_date, start_date_overridden, work_days, daily_limit, credit_enabled,
                   compensation_enabled, progress_measure, exceptions_overridden
  on public.tracks
  for each row execute function public.fn_settle_before_setting();

create or replace function public.fn_settle_before_calendar_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid := coalesce(new.program_id, old.program_id);
  v_track   uuid := coalesce(new.track_id, old.track_id);
begin
  if current_setting('app.settled_scope', true) is distinct from coalesce(v_track, v_program)::text then
    perform set_config('app.settled_scope', coalesce(v_track, v_program)::text, true);
    perform public.fn_settle_scope(v_program, v_track);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_calendar_exceptions_settle_first
  before insert or update on public.calendar_exceptions
  for each row execute function public.fn_settle_before_calendar_row();
create trigger trg_deadline_history_settle_first
  before insert or update on public.deadline_history
  for each row execute function public.fn_settle_before_calendar_row();

-- ══ السياسات ══

create policy field_counts_read on public.field_counts
  for select to authenticated
  using (
    participant_id in (select id from public.participants where user_id = (select auth.uid()))
    or public.fn_has_permission('participants.read', public.fn_plan_program_id(plan_id))
  );
create policy field_marks_read on public.field_marks
  for select to authenticated
  using (
    participant_id in (select id from public.participants where user_id = (select auth.uid()))
    or public.fn_has_permission('participants.read', public.fn_plan_program_id(plan_id))
  );
create policy day_openings_read on public.day_openings
  for select to authenticated
  using (
    participant_id in (select id from public.participants where user_id = (select auth.uid()))
    or public.fn_has_permission('participants.read', public.fn_plan_program_id(plan_id))
  );
create policy commitment_archive_read on public.commitment_archive
  for select to authenticated
  using (
    participant_id in (select id from public.participants where user_id = (select auth.uid()))
    or public.fn_has_permission('participants.read', public.fn_plan_program_id(plan_id))
  );

-- ══ المنح ══

revoke all on public.field_counts, public.field_marks, public.day_openings, public.commitment_archive
  from anon, authenticated, service_role;
grant select on public.field_counts, public.field_marks, public.day_openings, public.commitment_archive
  to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'fn_participant_track_start(uuid)', 'fn_participant_engine(uuid)', 'fn_cut_at(uuid, uuid, date)',
    'fn_program_days_through(uuid, uuid, date, date)', 'fn_done_days_at(uuid, uuid, uuid, timestamptz)',
    'fn_engine_access(uuid, boolean)', 'fn_journey_state_at(uuid, timestamptz)',
    'fn_engine_require_tasks(uuid, int, timestamptz)',
    'fn_count_repetition_at(uuid, int, uuid, int, timestamptz)', 'fn_mark_field_at(uuid, int, uuid, timestamptz)',
    'fn_undo_mark_at(uuid, int, uuid, timestamptz)', 'fn_open_next_day_at(uuid, timestamptz)',
    'fn_settle_commitment_at(uuid, timestamptz)', 'fn_settle_scope(uuid, uuid)',
    'fn_settle_before_setting()', 'fn_settle_before_calendar_row()',
    'fn_journey_state(uuid)', 'fn_day_tasks(uuid, int)', 'fn_count_repetition(uuid, int, uuid, int)',
    'fn_mark_field(uuid, int, uuid)', 'fn_undo_mark(uuid, int, uuid)', 'fn_open_next_day(uuid)',
    'fn_progress_at(uuid, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
  end loop;
end;
$$;

grant execute on function public.fn_journey_state(uuid) to authenticated;
grant execute on function public.fn_day_tasks(uuid, int) to authenticated;
grant execute on function public.fn_count_repetition(uuid, int, uuid, int) to authenticated;
grant execute on function public.fn_mark_field(uuid, int, uuid) to authenticated;
grant execute on function public.fn_undo_mark(uuid, int, uuid) to authenticated;
grant execute on function public.fn_open_next_day(uuid) to authenticated;
grant execute on function public.fn_progress_at(uuid, timestamptz) to authenticated;
