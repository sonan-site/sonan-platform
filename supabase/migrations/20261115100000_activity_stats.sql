-- إحصاءات النشاط والدخول (adr/0061 · خطة ١٣–١٥ نوفمبر المعتمدة): كم شخصاً يستخدم المنصة في كل ساعة.
--
-- **التسجيل:** سطرٌ واحد لكل حساب في كل ساعةٍ نشِط فيها، تكتبه البوّابة (`proxy.ts`) بعد الرد بـ
-- `fn_activity_touch` — للداخل نفسه وحده. و«الداخل» (من بدأ جلسة) من `auth.sessions` لا من نقاط الدخول.
-- **الحفظ (قرار ٣):** السطور ٦٠ يوماً، ثم تُجمَّع ليلاً أعداداً بلا هوية في `activity_counts` وتُحذف.
-- **القراءة:** أعدادٌ مجمّعة لا أسماء، بنطاق `stats.read` — العام يرى الكل، والمحصور طلاب برنامجه.
-- **الفترات (قرار ٢):** ساعة · ٣ ساعات · ٦ ساعات · يوم — بحدودٍ ثابتة بتوقيت الرياض.

-- ══ الصلاحية لدور النظام ══ (والكتالوج في config/permissions.ts، والبذرة في seed.sql)
insert into public.role_permissions (role_id, permission_code)
select r.id, 'stats.read' from public.roles r
where r.is_system = true and r.deleted_at is null
on conflict do nothing;

-- ══ ساعات النشاط ══
create table public.activity_hours (
  id         uuid primary key default gen_random_uuid(),
  -- محو صاحبه (`fn_purge_account` يحذف `auth.users`) يمحو ساعاته.
  user_id    uuid not null references auth.users (id) on delete cascade,
  hour       timestamptz not null,
  -- بدأ جلسة دخولٍ جديدة في هذه الساعة.
  signed_in  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_activity_hours_hour check ((hour at time zone 'UTC') = date_trunc('hour', hour at time zone 'UTC'))
);
comment on table public.activity_hours is
  'ساعات نشاط كل حساب — سطرٌ لكل ساعة (adr/0061). ٦٠ يوماً ثم تُجمَّع بلا هوية. بلا منفذٍ مباشر: كل قراءةٍ وكتابة بدوالّ.';

create unique index idx_activity_hours_user_hour on public.activity_hours (user_id, hour);
create index idx_activity_hours_hour on public.activity_hours (hour);
create trigger trg_activity_hours_updated_at before update on public.activity_hours
  for each row execute function public.fn_set_updated_at();
alter table public.activity_hours enable row level security;
revoke all on public.activity_hours from anon, authenticated, service_role;
-- قراءةٌ ممنوحة بسياسةٍ لا تُرجع صفّاً — فلا جدول بلا سياسة ولا سياسة بلا منحة (`grants.db-test`).
grant select on public.activity_hours to authenticated;
create policy activity_hours_functions_only on public.activity_hours
  for select to authenticated using (false);

-- ══ الأعداد المجمَّعة بلا هوية ══ — لكل فترة من الأربع، بعددٍ مميّز حُسب وقت التجميع (مراجعة ح٤).
create table public.activity_counts (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  period_start timestamptz not null,
  audience     text not null,
  level        text not null,
  program_id   uuid references public.programs (id) on delete cascade,
  track_id     uuid references public.tracks (id) on delete cascade,
  active       integer not null,
  signed_in    integer not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint chk_activity_counts_bucket check (bucket in ('hour', '3h', '6h', 'day')),
  constraint chk_activity_counts_audience check (audience in ('student', 'staff', 'all')),
  -- المستوى صريح لا مستنتج من الفراغ (مراجعة ح٥): الإجمالي لا يلتبس بتفصيلٍ مساره فارغ.
  constraint chk_activity_counts_level check (
    (level = 'total' and program_id is null and track_id is null)
    or (level = 'program' and program_id is not null and track_id is null)
    or (level = 'track' and program_id is not null and track_id is not null)
  ),
  -- الفريق و«الكل» بلا برنامج ولا مسار.
  constraint chk_activity_counts_audience_level check (audience = 'student' or level = 'total'),
  constraint chk_activity_counts_values check (active >= 0 and signed_in between 0 and active)
);
comment on table public.activity_counts is
  'أعداد النشاط بعد ٦٠ يوماً — بلا هوية، لكل (فترة × فئة × مستوى) (adr/0061). يكتبها fn_activity_rollup وحدها.';

create unique index idx_activity_counts_key
  on public.activity_counts (bucket, period_start, audience, level, program_id, track_id) nulls not distinct;
create trigger trg_activity_counts_updated_at before update on public.activity_counts
  for each row execute function public.fn_set_updated_at();
alter table public.activity_counts enable row level security;
revoke all on public.activity_counts from anon, authenticated, service_role;
grant select on public.activity_counts to authenticated;
create policy activity_counts_functions_only on public.activity_counts
  for select to authenticated using (false);

-- ══ بداية الفترة بتوقيت الرياض ══ — الرياض بلا توقيتٍ صيفي وفرقها ساعاتٌ كاملة، فتنطبق الحدود.
create or replace function public.fn_activity_bucket(p_at timestamptz, p_bucket text)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (case p_bucket
    when 'hour' then date_trunc('hour', p_at at time zone 'Asia/Riyadh')
    when '3h' then date_trunc('day', p_at at time zone 'Asia/Riyadh')
      + make_interval(hours => (extract(hour from p_at at time zone 'Asia/Riyadh')::int / 3) * 3)
    when '6h' then date_trunc('day', p_at at time zone 'Asia/Riyadh')
      + make_interval(hours => (extract(hour from p_at at time zone 'Asia/Riyadh')::int / 6) * 6)
    when 'day' then date_trunc('day', p_at at time zone 'Asia/Riyadh')
  end) at time zone 'Asia/Riyadh';
$$;

comment on function public.fn_activity_bucket(timestamptz, text) is
  'بداية فترة الإحصاء (ساعة · 3h · 6h · يوم) بتوقيت الرياض — مساعدٌ داخلي (adr/0061).';

revoke all on function public.fn_activity_bucket(timestamptz, text) from public, anon, authenticated;

-- ══ التسجيل ══ — تناديها البوّابة لكل جلسةٍ مرّةً في الساعة. بلا وسائط: تكتب عن صاحبها وحده.
create or replace function public.fn_activity_touch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session text := (select auth.jwt()) ->> 'session_id';
  v_started timestamptz;
begin
  if v_uid is null then
    return;
  end if;
  -- الموقوف لا يُعدّ: بابه مغلق، وما يصل منه طلبٌ لا استعمال.
  if exists (select 1 from public.profiles p where p.user_id = v_uid and p.deleted_at is not null) then
    return;
  end if;

  insert into public.activity_hours (user_id, hour)
  values (v_uid, date_trunc('hour', now(), 'UTC'))
  on conflict (user_id, hour) do nothing;

  -- «الداخل» من بدء الجلسة نفسها (مراجعة م٣): كل أبواب الدخول بلا مسّ نقاطها. وساعتان تلحقان من
  -- دخل في آخر ساعةٍ ولم يصل طلبه التالي إلا في التي بعدها.
  if v_session ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select s.created_at into v_started
    from auth.sessions s
    where s.id = v_session::uuid and s.user_id = v_uid;
  end if;

  if v_started is not null and v_started > now() - interval '2 hours' and v_started <= now() then
    insert into public.activity_hours (user_id, hour, signed_in)
    values (v_uid, date_trunc('hour', v_started, 'UTC'), true)
    on conflict (user_id, hour) do update set signed_in = true
      where not public.activity_hours.signed_in;
  end if;
end;
$$;

comment on function public.fn_activity_touch() is
  'تسجّل ساعة نشاط المستدعي، وعلامة الدخول إن بدأت جلسته قريباً — للبوّابة، عن صاحبها وحده (adr/0061).';

revoke all on function public.fn_activity_touch() from public, anon;
grant execute on function public.fn_activity_touch() to authenticated;

-- ══ القراءة ══ — أعدادٌ لكل فترة، من الحيّ والمجمَّع معاً، والفترات الفارغة صفر.
create or replace function public.fn_activity_stats(
  p_from     date,
  p_to       date,
  p_bucket   text,
  p_audience text,
  p_program  uuid default null,
  p_track    uuid default null
)
returns table (period_start timestamptz, active integer, signed_in integer)
language plpgsql
stable
security definer
set search_path = ''
-- خطوة اليوم في `generate_series` لا تتبع إعداد الجلسة (مراجعة الكود ملاحظة ٥).
set timezone = 'UTC'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end   timestamptz;
  v_step  interval;
  v_level text;
begin
  -- ── النطاق (مراجعة ح٣): العام يرى الكل، والمحصور طلاب برنامجه وحده ──
  if not public.fn_has_permission('stats.read', null) then
    if p_audience is distinct from 'student' or p_program is null
       or not public.fn_has_permission('stats.read', p_program) then
      raise exception 'لا تملك هذه الإحصاءات.' using errcode = '42501';
    end if;
  end if;

  -- ── المدخلات: قوائم مغلقة ومدى محدود ──
  v_step := case p_bucket
    when 'hour' then interval '1 hour'
    when '3h' then interval '3 hours'
    when '6h' then interval '6 hours'
    when 'day' then interval '1 day'
  end;
  if v_step is null then
    raise exception 'فترة التجميع غير معروفة.' using errcode = '23514';
  end if;
  if p_audience is null or p_audience not in ('student', 'staff', 'all') then
    raise exception 'الفئة غير معروفة.' using errcode = '23514';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365 then
    raise exception 'المدى غير صالح — من يومٍ إلى سنة.' using errcode = '23514';
  end if;
  -- البرنامج والمسار للطلاب وحدهم، والمسار من برنامجه.
  if p_program is not null and p_audience <> 'student' then
    raise exception 'التصفية بالبرنامج للطلاب وحدهم.' using errcode = '23514';
  end if;
  if p_track is not null and (p_program is null or not exists (
    select 1 from public.tracks t where t.id = p_track and t.program_id = p_program
  )) then
    raise exception 'المسار ليس من هذا البرنامج.' using errcode = '23514';
  end if;

  v_start := p_from::timestamp at time zone 'Asia/Riyadh';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Riyadh';
  v_level := case when p_track is not null then 'track' when p_program is not null then 'program' else 'total' end;

  return query
  with live as (
    select public.fn_activity_bucket(h.hour, p_bucket) as period,
           count(distinct h.user_id)::int as active,
           (count(distinct h.user_id) filter (where h.signed_in))::int as signed_in
    from public.activity_hours h
    where h.hour >= v_start and h.hour < v_end
      and case p_audience
        when 'all' then true
        when 'staff' then exists (
          select 1 from public.user_roles ur where ur.user_id = h.user_id and ur.deleted_at is null
        )
        else exists (
          select 1 from public.participants pa
          where pa.user_id = h.user_id and pa.deleted_at is null
            and (p_program is null or pa.program_id = p_program)
            and (p_track is null or pa.track_id = p_track)
        )
      end
    group by 1
  ),
  rolled as (
    -- المجمَّع يُقطع على أيامٍ كاملة، فلا تشترك فترةٌ بينه وبين الحيّ.
    select c.period_start as period, c.active, c.signed_in
    from public.activity_counts c
    where c.bucket = p_bucket and c.audience = p_audience and c.level = v_level
      and c.program_id is not distinct from p_program
      and c.track_id is not distinct from p_track
      and c.period_start >= v_start and c.period_start < v_end
      and c.deleted_at is null
  ),
  counted as (
    select period, sum(x.active)::int as active, sum(x.signed_in)::int as signed_in
    from (select * from live union all select * from rolled) x
    group by period
  )
  select s.period, coalesce(c.active, 0), coalesce(c.signed_in, 0)
  from generate_series(v_start, v_end - v_step, v_step) as s(period)
  left join counted c on c.period = s.period
  order by s.period;
end;
$$;

comment on function public.fn_activity_stats(date, date, text, text, uuid, uuid) is
  'أعداد النشطين والداخلين لكل فترة بتوقيت الرياض — مجمّعة لا أسماء، بنطاق stats.read (adr/0061).';

revoke all on function public.fn_activity_stats(date, date, text, text, uuid, uuid) from public, anon;
grant execute on function public.fn_activity_stats(date, date, text, text, uuid, uuid) to authenticated;

-- ══ خريطة الذروة ══ — متوسط النشطين لكل (يوم أسبوع × ساعة)، والساعات الصفرية في المقام.
-- فوق `fn_activity_stats` نفسها: النطاق والمدخلات يُفحصان مرّةً في موضعٍ واحد.
create or replace function public.fn_activity_heatmap(
  p_from     date,
  p_to       date,
  p_audience text,
  p_program  uuid default null,
  p_track    uuid default null
)
returns table (weekday integer, hour integer, average numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select extract(dow from s.period_start at time zone 'Asia/Riyadh')::int,
         extract(hour from s.period_start at time zone 'Asia/Riyadh')::int,
         round(avg(s.active), 1)
  from public.fn_activity_stats(p_from, p_to, 'hour', p_audience, p_program, p_track) s
  group by 1, 2
  order by 1, 2;
$$;

comment on function public.fn_activity_heatmap(date, date, text, uuid, uuid) is
  'متوسط النشطين لكل يوم أسبوع × ساعة (الأحد = ٠) — بنطاق fn_activity_stats ومدخلاتها (adr/0061).';

revoke all on function public.fn_activity_heatmap(date, date, text, uuid, uuid) from public, anon;
grant execute on function public.fn_activity_heatmap(date, date, text, uuid, uuid) to authenticated;

-- ══ التجميع بعد ٦٠ يوماً (قرار ٣) ══ — كل يوم رياضٍ كامل أقدم من الستين: عددٌ مميّز لكل فترة من
-- الأربع ولكل (فئة × مستوى)، ثم تُحذف سطوره. وهذا الاستثناء الثاني للحذف الصلب بعد محو الحساب:
-- السطور بيانات شخصية لا يُبقيها القرار، والمجمَّع بلا هوية يخلفها.
create or replace function public.fn_activity_rollup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz :=
    (date_trunc('day', now() at time zone 'Asia/Riyadh') - interval '60 days') at time zone 'Asia/Riyadh';
  v_deleted integer;
begin
  -- تشغيلان متزامنان لا يتداخلان: الثاني ينصرف، والقادم يلحق.
  if not pg_try_advisory_xact_lock(hashtext('activity-rollup')) then
    return 0;
  end if;

  with src as (
    select h.user_id, h.hour, h.signed_in from public.activity_hours h where h.hour < v_cutoff
  ),
  spans as (
    select s.user_id, s.signed_in, b.bucket, public.fn_activity_bucket(s.hour, b.bucket) as period
    from src s
    cross join unnest(array['hour', '3h', '6h', 'day']) as b(bucket)
  ),
  enrolled as (
    select distinct pa.user_id, pa.program_id, pa.track_id
    from public.participants pa
    where pa.deleted_at is null and pa.user_id in (select distinct user_id from src)
  ),
  counts as (
    -- الكل
    select sp.bucket, sp.period, 'all' as audience, 'total' as level, null::uuid as program_id, null::uuid as track_id,
           count(distinct sp.user_id) as active, count(distinct sp.user_id) filter (where sp.signed_in) as signed_in
    from spans sp group by sp.bucket, sp.period
    union all
    -- الفريق
    select sp.bucket, sp.period, 'staff', 'total', null, null,
           count(distinct sp.user_id), count(distinct sp.user_id) filter (where sp.signed_in)
    from spans sp
    where exists (select 1 from public.user_roles ur where ur.user_id = sp.user_id and ur.deleted_at is null)
    group by sp.bucket, sp.period
    union all
    -- الطلاب إجمالاً — من شارك في برنامجين مرّةً واحدة
    select sp.bucket, sp.period, 'student', 'total', null, null,
           count(distinct sp.user_id), count(distinct sp.user_id) filter (where sp.signed_in)
    from spans sp
    where exists (select 1 from enrolled e where e.user_id = sp.user_id)
    group by sp.bucket, sp.period
    union all
    -- لكل برنامج
    select sp.bucket, sp.period, 'student', 'program', e.program_id, null,
           count(distinct sp.user_id), count(distinct sp.user_id) filter (where sp.signed_in)
    from spans sp
    join (select distinct user_id, program_id from enrolled) e on e.user_id = sp.user_id
    group by sp.bucket, sp.period, e.program_id
    union all
    -- لكل مسار
    select sp.bucket, sp.period, 'student', 'track', e.program_id, e.track_id,
           count(distinct sp.user_id), count(distinct sp.user_id) filter (where sp.signed_in)
    from spans sp
    join enrolled e on e.user_id = sp.user_id and e.track_id is not null
    group by sp.bucket, sp.period, e.program_id, e.track_id
  )
  insert into public.activity_counts (bucket, period_start, audience, level, program_id, track_id, active, signed_in)
  select c.bucket, c.period, c.audience, c.level, c.program_id, c.track_id, c.active::int, c.signed_in::int
  from counts c
  -- تكرار التشغيل آمن: ما جُمّع لا يُجمَّع ثانيةً.
  on conflict do nothing;

  delete from public.activity_hours where hour < v_cutoff;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.fn_activity_rollup() is
  'يجمّع ساعات النشاط الأقدم من ٦٠ يوماً أعداداً بلا هوية ثم يحذفها — للمجدوِل وحده (adr/0061).';

revoke all on function public.fn_activity_rollup() from public, anon, authenticated;

-- المجدوِل: كل ليلة ٣:١٧ بتوقيت الرياض = ٠٠:١٧ UTC (pg_cron بتوقيت UTC). وحيث لا يتاح الامتداد
-- (قاعدة اختبار محلّية) تبقى الدالّة وتُختبر وحدها.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('activity-rollup', '17 0 * * *', 'select public.fn_activity_rollup()');
  end if;
end;
$$;
