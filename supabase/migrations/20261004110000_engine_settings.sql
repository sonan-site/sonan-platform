-- 057 | إعدادات المحرّك الموروثة: التقويم وقواعد التقدّم (adr/0038)
--
-- كل إعداد يُضبط على البرنامج قيمةً افتراضية يرثها كل مسار، ويُخصَّص لمسار
-- بعينه فيحلّ محلّ الموروث فيه. والقراءة دائماً: قيمة المسار إن وُجدت، وإلا
-- قيمة البرنامج.
--
-- **التقويم يحكم ولا يحرّك** (adr/0036): هذه الإعدادات لا تنقل المشارك بين
-- أيام خطته، بل يُحكم بها على كل يوم تقويمي — بالإتمام أو الإعفاء أو التعثّر.
--
-- **الكتابة من دالة واحدة** (`fn_set_engine_setting`): ما يُكتب هنا يُحكم به
-- على أيام مضت، فتسبقه التسوية متى بُني الأرشيف (adr/0041) — ولا طريق حولها.
--
-- **ووقت نهاية الرصد بتاريخ سريانه:** التغيير يُضيف صفّاً ولا يعدّل ما سبق،
-- فيُحكم على كل يوم بالوقت الذي كان سارياً فيه.
--
-- تراجع: نعم.

-- ══ البنية ══

create type public.progress_measure as enum ('units', 'days');

alter table public.programs
  add column start_date           date,
  add column work_days            smallint[] not null default '{0,1,2,3,4,6}',
  add column daily_limit          int not null default 2,
  add column credit_enabled       boolean not null default true,
  add column compensation_enabled boolean not null default true,
  add column progress_measure     public.progress_measure not null default 'units';

alter table public.programs add constraint chk_programs_work_days
  check (cardinality(work_days) between 1 and 7 and work_days <@ '{0,1,2,3,4,5,6}'::smallint[]);
alter table public.programs add constraint chk_programs_daily_limit
  check (daily_limit between 1 and 20);

comment on column public.programs.work_days is
  'adr/0038 | أيام العمل الأسبوعية: ٠ الأحد … ٦ السبت. الافتراضي الأحد–الخميس والسبت.';
comment on column public.programs.start_date is
  'adr/0038 | تاريخ البداية. فارغ = تقويم كل مشارك يبدأ من يوم التحاقه.';

-- على المسار: الأعمدة نفسها، والفراغ = موروث.
alter table public.tracks
  add column start_date            date,
  add column work_days             smallint[],
  add column daily_limit           int,
  add column credit_enabled        boolean,
  add column compensation_enabled  boolean,
  add column progress_measure      public.progress_measure,
  -- أيام التوقف قائمة، والقائمة الفارغة قيمةٌ لا غياب — فللتخصيص علامة صريحة.
  add column exceptions_overridden boolean not null default false;

alter table public.tracks add constraint chk_tracks_work_days
  check (work_days is null
         or (cardinality(work_days) between 1 and 7 and work_days <@ '{0,1,2,3,4,5,6}'::smallint[]));
alter table public.tracks add constraint chk_tracks_daily_limit
  check (daily_limit is null or daily_limit between 1 and 20);

create table public.calendar_exceptions (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  track_id   uuid,
  off_date   date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.calendar_exceptions is
  'adr/0038 | أيام التوقف الاستثنائية. track_id فارغ = للبرنامج، ويُقرأ للمسار متى خصّص قائمته.';

alter table public.calendar_exceptions add constraint fk_calendar_exceptions_track
  foreign key (track_id, program_id) references public.tracks (id, program_id) on delete restrict;
create unique index idx_calendar_exceptions_day
  on public.calendar_exceptions (program_id, track_id, off_date) nulls not distinct
  where deleted_at is null;

create trigger trg_calendar_exceptions_updated_at before update on public.calendar_exceptions
  for each row execute function public.fn_set_updated_at();
alter table public.calendar_exceptions enable row level security;

create table public.deadline_history (
  id             uuid primary key default gen_random_uuid(),
  program_id     uuid not null references public.programs (id) on delete restrict,
  track_id       uuid,
  effective_from date not null,
  deadline       time not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on table public.deadline_history is
  'adr/0041 | وقت نهاية الرصد بتاريخ سريانه. التغيير يُضيف صفّاً ولا يعدّل ما سبق. ووجود صفوفٍ للمسار = خصّصه.';

alter table public.deadline_history add constraint fk_deadline_history_track
  foreign key (track_id, program_id) references public.tracks (id, program_id) on delete restrict;
create unique index idx_deadline_history_day
  on public.deadline_history (program_id, track_id, effective_from) nulls not distinct
  where deleted_at is null;

create trigger trg_deadline_history_updated_at before update on public.deadline_history
  for each row execute function public.fn_set_updated_at();
alter table public.deadline_history enable row level security;

-- ══ الحارس: إعدادات المحرّك لا تُكتب إلا من دالتها ══

create or replace function public.fn_guard_engine_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.engine_settings', true) is not distinct from 'on' then
    return new;
  end if;
  -- لا اختصار في تقييم PL/pgSQL: حقلٌ غير موجود في الجدول يُفشل الشرط كله،
  -- فيُفحص عمود المسار وحده في فرعه.
  if new.start_date is distinct from old.start_date
     or new.work_days is distinct from old.work_days
     or new.daily_limit is distinct from old.daily_limit
     or new.credit_enabled is distinct from old.credit_enabled
     or new.compensation_enabled is distinct from old.compensation_enabled
     or new.progress_measure is distinct from old.progress_measure then
    raise exception 'إعدادات التقويم والتقدّم تُكتب من شاشتها: ما يُكتب يُحكم به على أيامٍ مضت'
      using errcode = '23514';
  end if;
  if tg_table_name = 'tracks' then
    if new.exceptions_overridden is distinct from old.exceptions_overridden then
      raise exception 'إعدادات التقويم والتقدّم تُكتب من شاشتها: ما يُكتب يُحكم به على أيامٍ مضت'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_programs_engine_settings
  before update on public.programs
  for each row execute function public.fn_guard_engine_settings();
create trigger trg_tracks_engine_settings
  before update on public.tracks
  for each row execute function public.fn_guard_engine_settings();

-- ══ القراءة بعد الوراثة ══

/** «الآن» بتوقيت الرياض — مصدر اليوم التقويمي في المحرّك كله. */
create or replace function public.fn_local_now(p_at timestamptz default now())
returns timestamp
language sql
stable
set search_path = ''
as $$
  select p_at at time zone 'Asia/Riyadh';
$$;

/**
 * إعدادات المسار بعد الوراثة — صفٌّ واحد. ومع المسار الفارغ: إعدادات البرنامج.
 */
create or replace function public.fn_engine_settings(p_program_id uuid, p_track_id uuid default null)
returns table (
  start_date           date,
  work_days            smallint[],
  daily_limit          int,
  credit_enabled       boolean,
  compensation_enabled boolean,
  progress_measure     public.progress_measure,
  exceptions           date[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(t.start_date, p.start_date),
    coalesce(t.work_days, p.work_days),
    coalesce(t.daily_limit, p.daily_limit),
    coalesce(t.credit_enabled, p.credit_enabled),
    coalesce(t.compensation_enabled, p.compensation_enabled),
    coalesce(t.progress_measure, p.progress_measure),
    coalesce((
      select array_agg(e.off_date order by e.off_date)
      from public.calendar_exceptions e
      where e.program_id = p.id
        and e.deleted_at is null
        and e.track_id is not distinct from
            (case when coalesce(t.exceptions_overridden, false) then t.id end)
    ), '{}')
  from public.programs p
  left join public.tracks t on t.id = p_track_id and t.program_id = p.id
  where p.id = p_program_id;
$$;

/**
 * وقت نهاية الرصد الساري في يوم: سجلّ المسار إن خصّصه، وإلا سجلّ البرنامج.
 * الصفّ الأحدث الذي سرى قبل اليوم أو فيه — وما قبل أول صفّ يُحكم بأوله.
 * وبلا سجلّ: ٢٣:٠٠.
 */
create or replace function public.fn_deadline_at(p_program_id uuid, p_track_id uuid, p_date date)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select case
      when p_track_id is not null and exists (
        select 1 from public.deadline_history d
        where d.track_id = p_track_id and d.program_id = p_program_id and d.deleted_at is null
      ) then p_track_id
    end as track_id
  ),
  history as (
    select d.effective_from, d.deadline
    from public.deadline_history d, scope
    where d.program_id = p_program_id
      and d.track_id is not distinct from scope.track_id
      and d.deleted_at is null
  )
  select coalesce(
    (select deadline from history where effective_from <= p_date order by effective_from desc limit 1),
    (select deadline from history order by effective_from limit 1),
    time '23:00'
  );
$$;

/** هل اليوم من أيام البرنامج: يوم عمل أسبوعي، وليس يوم توقّف. */
create or replace function public.fn_is_program_day(p_program_id uuid, p_track_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select extract(dow from p_date)::smallint = any (s.work_days)
     and not (p_date = any (s.exceptions))
  from public.fn_engine_settings(p_program_id, p_track_id) s;
$$;

-- ══ الكتابة ══

/** يتحقّق أن المسار من البرنامج ويملك المستدعي كتابته. */
create or replace function public.fn_engine_scope_check(p_program_id uuid, p_track_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على إعدادات هذا البرنامج' using errcode = '42501';
  end if;
  if p_track_id is not null and not exists (
    select 1 from public.tracks t
    where t.id = p_track_id and t.program_id = p_program_id and t.deleted_at is null
  ) then
    raise exception 'المسار ليس من هذا البرنامج' using errcode = '22023';
  end if;
end;
$$;

/**
 * يكتب إعداداً واحداً على البرنامج (`p_track_id` فارغ) أو يخصّصه لمسار.
 *
 * المفاتيح: `start_date` · `work_days` · `exceptions` · `deadline` ·
 * `daily_limit` · `credit_enabled` · `compensation_enabled` · `progress_measure`.
 * والقيمة بصيغتها في JSON: تاريخ نصّاً، وأيام العمل مصفوفة أرقام ٠–٦، وأيام
 * التوقف مصفوفة تواريخ، والوقت «HH:MM».
 */
create or replace function public.fn_set_engine_setting(
  p_program_id uuid,
  p_track_id   uuid,
  p_key        text,
  p_value      jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.fn_local_now()::date;
  v_text  text := case when p_value is null or jsonb_typeof(p_value) = 'null' then null else p_value #>> '{}' end;
  v_days  smallint[];
  v_dates date[];
  v_time  time;
  v_int   int;
begin
  perform public.fn_engine_scope_check(p_program_id, p_track_id);
  perform set_config('app.engine_settings', 'on', true);

  if p_key = 'start_date' then
    if v_text is not null and v_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'تاريخ البداية غير صالح' using errcode = '22023';
    end if;
    if p_track_id is null then
      update public.programs set start_date = v_text::date where id = p_program_id;
    else
      update public.tracks set start_date = v_text::date where id = p_track_id;
    end if;

  elsif p_key = 'work_days' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'أيام العمل قائمة' using errcode = '22023';
    end if;
    select array_agg(distinct d::smallint order by d::smallint) into v_days
    from jsonb_array_elements_text(p_value) d
    where d ~ '^[0-6]$';
    if coalesce(cardinality(v_days), 0) = 0
       or cardinality(v_days) <> jsonb_array_length(p_value) then
      raise exception 'اختر يوم عمل واحداً على الأقل' using errcode = '23514';
    end if;
    if p_track_id is null then
      update public.programs set work_days = v_days where id = p_program_id;
    else
      update public.tracks set work_days = v_days where id = p_track_id;
    end if;

  elsif p_key = 'exceptions' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'أيام التوقف قائمة' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements_text(p_value) d where d !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception 'يوم توقّف بتاريخ غير صالح' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct d::date), '{}') into v_dates
    from jsonb_array_elements_text(p_value) d;

    if p_track_id is not null then
      update public.tracks set exceptions_overridden = true where id = p_track_id;
    end if;
    update public.calendar_exceptions e
    set deleted_at = now()
    where e.program_id = p_program_id
      and e.track_id is not distinct from p_track_id
      and e.deleted_at is null
      and not (e.off_date = any (v_dates));
    insert into public.calendar_exceptions (program_id, track_id, off_date)
    select p_program_id, p_track_id, d
    from unnest(v_dates) d
    where not exists (
      select 1 from public.calendar_exceptions e
      where e.program_id = p_program_id
        and e.track_id is not distinct from p_track_id
        and e.off_date = d
        and e.deleted_at is null
    );

  elsif p_key = 'deadline' then
    if v_text is null or v_text !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'وقت نهاية الرصد بصيغة ساعة ودقيقة' using errcode = '22023';
    end if;
    v_time := v_text::time;
    -- أول تغيير لنطاقٍ بلا سجلّ: يُثبَّت ما كان سارياً أساساً لما مضى، فلا يسري الجديد رجعياً.
    if not exists (
      select 1 from public.deadline_history d
      where d.program_id = p_program_id
        and d.track_id is not distinct from p_track_id
        and d.deleted_at is null
    ) then
      insert into public.deadline_history (program_id, track_id, effective_from, deadline)
      values (p_program_id, p_track_id, date '0001-01-01',
              public.fn_deadline_at(p_program_id, p_track_id, v_today));
    end if;
    update public.deadline_history d
    set deadline = v_time
    where d.program_id = p_program_id
      and d.track_id is not distinct from p_track_id
      and d.effective_from = v_today
      and d.deleted_at is null;
    if not found then
      insert into public.deadline_history (program_id, track_id, effective_from, deadline)
      values (p_program_id, p_track_id, v_today, v_time);
    end if;

  elsif p_key = 'daily_limit' then
    if v_text is null or v_text !~ '^\d{1,2}$' then
      raise exception 'الحد اليومي عدد صحيح' using errcode = '22023';
    end if;
    v_int := v_text::int;
    if v_int < 1 or v_int > 20 then
      raise exception 'الحد اليومي بين ١ و٢٠' using errcode = '23514';
    end if;
    if p_track_id is null then
      update public.programs set daily_limit = v_int where id = p_program_id;
    else
      update public.tracks set daily_limit = v_int where id = p_track_id;
    end if;

  elsif p_key in ('credit_enabled', 'compensation_enabled') then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'القيمة مفعّل أو معطّل' using errcode = '22023';
    end if;
    if p_track_id is null then
      execute format('update public.programs set %I = $1 where id = $2', p_key)
        using (p_value #>> '{}')::boolean, p_program_id;
    else
      execute format('update public.tracks set %I = $1 where id = $2', p_key)
        using (p_value #>> '{}')::boolean, p_track_id;
    end if;

  elsif p_key = 'progress_measure' then
    if v_text is null or v_text not in ('units', 'days') then
      raise exception 'مقياس نسبة الإنجاز بالوحدات أو بالأيام' using errcode = '22023';
    end if;
    if p_track_id is null then
      update public.programs set progress_measure = v_text::public.progress_measure where id = p_program_id;
    else
      update public.tracks set progress_measure = v_text::public.progress_measure where id = p_track_id;
    end if;

  else
    raise exception 'إعداد غير معروف: %', p_key using errcode = '22023';
  end if;

  perform public.fn_write_audit(
    'engine_setting_changed',
    case when p_track_id is null then 'programs' else 'tracks' end,
    coalesce(p_track_id, p_program_id),
    null,
    jsonb_build_object('key', p_key, 'value', p_value)
  );
  perform set_config('app.engine_settings', 'off', true);
end;
$$;

/** يخصّص إعداداً لمسار بنسخ قيمة البرنامج الحالية، فيُعدَّل بعدها وحده. */
create or replace function public.fn_customize_engine_setting(p_track_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  v_value   jsonb;
begin
  select t.program_id into v_program from public.tracks t where t.id = p_track_id and t.deleted_at is null;
  if v_program is null then
    raise exception 'مسار غير معروف' using errcode = '22023';
  end if;
  perform public.fn_engine_scope_check(v_program, p_track_id);

  if p_key = 'deadline' then
    perform set_config('app.engine_settings', 'on', true);
    insert into public.deadline_history (program_id, track_id, effective_from, deadline)
    select v_program, p_track_id, d.effective_from, d.deadline
    from public.deadline_history d
    where d.program_id = v_program and d.track_id is null and d.deleted_at is null
      and not exists (
        select 1 from public.deadline_history x
        where x.track_id = p_track_id and x.deleted_at is null
      );
    if not exists (select 1 from public.deadline_history x where x.track_id = p_track_id and x.deleted_at is null) then
      insert into public.deadline_history (program_id, track_id, effective_from, deadline)
      values (v_program, p_track_id, date '0001-01-01', time '23:00');
    end if;
    perform set_config('app.engine_settings', 'off', true);
    return;
  end if;

  select case p_key
    when 'start_date' then to_jsonb(p.start_date)
    when 'work_days' then to_jsonb(p.work_days)
    when 'exceptions' then coalesce((
      select jsonb_agg(e.off_date order by e.off_date) from public.calendar_exceptions e
      where e.program_id = p.id and e.track_id is null and e.deleted_at is null), '[]'::jsonb)
    when 'daily_limit' then to_jsonb(p.daily_limit)
    when 'credit_enabled' then to_jsonb(p.credit_enabled)
    when 'compensation_enabled' then to_jsonb(p.compensation_enabled)
    when 'progress_measure' then to_jsonb(p.progress_measure::text)
  end into v_value
  from public.programs p where p.id = v_program;

  if p_key not in ('start_date', 'work_days', 'exceptions', 'daily_limit',
                   'credit_enabled', 'compensation_enabled', 'progress_measure') then
    raise exception 'إعداد غير معروف: %', p_key using errcode = '22023';
  end if;
  perform public.fn_set_engine_setting(v_program, p_track_id, p_key, v_value);
end;
$$;

/** يُرجع إعداد المسار إلى الموروث من البرنامج. */
create or replace function public.fn_inherit_engine_setting(p_track_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  select t.program_id into v_program from public.tracks t where t.id = p_track_id and t.deleted_at is null;
  if v_program is null then
    raise exception 'مسار غير معروف' using errcode = '22023';
  end if;
  perform public.fn_engine_scope_check(v_program, p_track_id);
  perform set_config('app.engine_settings', 'on', true);

  if p_key = 'exceptions' then
    update public.tracks set exceptions_overridden = false where id = p_track_id;
    update public.calendar_exceptions set deleted_at = now()
    where track_id = p_track_id and deleted_at is null;
  elsif p_key = 'deadline' then
    update public.deadline_history set deleted_at = now()
    where track_id = p_track_id and deleted_at is null;
  elsif p_key in ('start_date', 'work_days', 'daily_limit', 'credit_enabled',
                  'compensation_enabled', 'progress_measure') then
    execute format('update public.tracks set %I = null where id = $1', p_key) using p_track_id;
  else
    raise exception 'إعداد غير معروف: %', p_key using errcode = '22023';
  end if;

  perform public.fn_write_audit(
    'engine_setting_inherited', 'tracks', p_track_id, null, jsonb_build_object('key', p_key)
  );
  perform set_config('app.engine_settings', 'off', true);
end;
$$;

comment on function public.fn_set_engine_setting(uuid, uuid, text, jsonb) is
  'adr/0038 | المدخل الوحيد لإعدادات التقويم والتقدّم. تسبقه التسوية متى بُني الأرشيف (adr/0041).';

-- ══ السياسات ══

create policy calendar_exceptions_read on public.calendar_exceptions
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));

create policy deadline_history_read on public.deadline_history
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));

-- ══ المنح ══

revoke all on public.calendar_exceptions, public.deadline_history from anon, authenticated, service_role;
grant select on public.calendar_exceptions, public.deadline_history to authenticated;

revoke all on function public.fn_guard_engine_settings() from public;
revoke all on function public.fn_local_now(timestamptz) from public;
revoke all on function public.fn_engine_settings(uuid, uuid) from public;
revoke all on function public.fn_deadline_at(uuid, uuid, date) from public;
revoke all on function public.fn_is_program_day(uuid, uuid, date) from public;
revoke all on function public.fn_engine_scope_check(uuid, uuid) from public;
revoke all on function public.fn_set_engine_setting(uuid, uuid, text, jsonb) from public;
revoke all on function public.fn_customize_engine_setting(uuid, text) from public;
revoke all on function public.fn_inherit_engine_setting(uuid, text) from public;

grant execute on function public.fn_local_now(timestamptz) to authenticated;
grant execute on function public.fn_engine_settings(uuid, uuid) to authenticated;
grant execute on function public.fn_deadline_at(uuid, uuid, date) to authenticated;
grant execute on function public.fn_is_program_day(uuid, uuid, date) to authenticated;
grant execute on function public.fn_set_engine_setting(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.fn_customize_engine_setting(uuid, text) to authenticated;
grant execute on function public.fn_inherit_engine_setting(uuid, text) to authenticated;
