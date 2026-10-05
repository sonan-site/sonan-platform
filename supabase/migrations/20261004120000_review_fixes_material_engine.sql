-- 058 | مراجعة الهجرتين ٠٥٦ و٠٥٧ — ستّ ملاحظات من مراجعة محايدة (٤ أكتوبر ٢٠٢٦)
--
-- ١. تاريخ البداية لا يُخصَّص لمسار حين يغيب عن البرنامج: الفراغ كان يعني
--    «موروث» و«بلا تاريخ» معاً. فصار للتخصيص علامة صريحة كأيام التوقف.
-- ٢. قارئات الإعدادات (`fn_engine_settings` · `fn_deadline_at` ·
--    `fn_is_program_day`) كانت ممنوحة لكل مستخدم بلا فحص، فتُقرأ إعدادات أي
--    برنامج بمعرّفه (BR-ISO-01). صارت داخلية: تستدعيها دوالّ المحرّك وحدها.
-- ٣. حارس الأقسام كان يفحص وحدات الأقسام وحدها: وحدةٌ بلا قسم تُلحق بقسم
--    مباشرةً، ووحدةٌ محذوفة تُستعاد، فيخالف القسم حجمه. صار يفحص الاتجاهين.
-- ٤. تغيير وقت نهاية الرصد يسري من اليوم وإن كان وقته قد مضى — فيُحكم على
--    اليوم بوقتٍ فات. صار يسري من الغد متى مضى الوقت القديم أو الجديد.
-- ٥. كتابة أيام التوقف أو الوقت على مسارٍ لم يخصّصهما كانت تُسقط قائمة
--    البرنامج أو سجلّه. صارت تُرفض حتى يُخصَّص الإعداد.
-- ٦. كتابة الأقسام تقرأ القائمة ثم تكتبها: محرّران معاً يحذف أحدهما ما أضافه
--    الآخر. صارت تقبل القائمة التي رآها المحرّر، وتُرفض إن تغيّرت بعدها.
-- ٧. الرقم المتّصل بلا سقف: إزاحة الترقيم تفترض أرقاماً صغيرة. صار ≤ ١٠٠٬٠٠٠.
--
-- تراجع: نعم.

-- ══ ١ · علامة تخصيص تاريخ البداية ══

alter table public.tracks add column start_date_overridden boolean not null default false;
update public.tracks set start_date_overridden = true where start_date is not null;

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
  -- فيُفحص عمودا المسار وحدهما في فرعهما.
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
    if new.exceptions_overridden is distinct from old.exceptions_overridden
       or new.start_date_overridden is distinct from old.start_date_overridden then
      raise exception 'إعدادات التقويم والتقدّم تُكتب من شاشتها: ما يُكتب يُحكم به على أيامٍ مضت'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

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
    case when coalesce(t.start_date_overridden, false) then t.start_date else p.start_date end,
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

-- ══ ٢ · القارئات داخلية ══
revoke execute on function public.fn_engine_settings(uuid, uuid) from authenticated;
revoke execute on function public.fn_deadline_at(uuid, uuid, date) from authenticated;
revoke execute on function public.fn_is_program_day(uuid, uuid, date) from authenticated;

-- ══ ٤ · ٥ · ١ — الكتابة ══

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
  v_now   timestamp := public.fn_local_now();
  v_today date := public.fn_local_now()::date;
  v_from  date;
  v_text  text := case when p_value is null or jsonb_typeof(p_value) = 'null' then null else p_value #>> '{}' end;
  v_days  smallint[];
  v_dates date[];
  v_time  time;
  v_int   int;
begin
  perform public.fn_engine_scope_check(p_program_id, p_track_id);

  -- ما له سجلٌّ أو قائمة لا يُكتب على مسارٍ لم يخصّصه: الكتابة تُسقط ما ورثه.
  if p_track_id is not null and p_key = 'deadline' and not exists (
    select 1 from public.deadline_history d where d.track_id = p_track_id and d.deleted_at is null
  ) then
    raise exception 'خصّص وقت نهاية الرصد لهذا المسار أولاً' using errcode = '23514';
  end if;
  if p_track_id is not null and p_key = 'exceptions' and not exists (
    select 1 from public.tracks t where t.id = p_track_id and t.exceptions_overridden
  ) then
    raise exception 'خصّص أيام التوقف لهذا المسار أولاً' using errcode = '23514';
  end if;

  perform set_config('app.engine_settings', 'on', true);

  if p_key = 'start_date' then
    if v_text is not null and v_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'تاريخ البداية غير صالح' using errcode = '22023';
    end if;
    if p_track_id is null then
      update public.programs set start_date = v_text::date where id = p_program_id;
    else
      update public.tracks set start_date = v_text::date, start_date_overridden = true where id = p_track_id;
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
    -- يسري من اليوم ما دام الوقتان لم يمضيا بعد، وإلا فمن الغد: لا يُحكم على
    -- يومٍ بوقتٍ فات قبل أن يُضبط.
    v_from := case
      when v_now::time < least(v_time, public.fn_deadline_at(p_program_id, p_track_id, v_today)) then v_today
      else v_today + 1
    end;
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
      and d.effective_from = v_from
      and d.deleted_at is null;
    if not found then
      insert into public.deadline_history (program_id, track_id, effective_from, deadline)
      values (p_program_id, p_track_id, v_from, v_time);
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
    if not exists (select 1 from public.deadline_history x where x.track_id = p_track_id and x.deleted_at is null) then
      insert into public.deadline_history (program_id, track_id, effective_from, deadline)
      select v_program, p_track_id, d.effective_from, d.deadline
      from public.deadline_history d
      where d.program_id = v_program and d.track_id is null and d.deleted_at is null;
      if not found then
        insert into public.deadline_history (program_id, track_id, effective_from, deadline)
        values (v_program, p_track_id, date '0001-01-01', time '23:00');
      end if;
    end if;
    perform set_config('app.engine_settings', 'off', true);
    return;
  end if;

  if p_key = 'exceptions' then
    perform set_config('app.engine_settings', 'on', true);
    update public.tracks set exceptions_overridden = true where id = p_track_id;
    perform set_config('app.engine_settings', 'off', true);
  end if;

  if p_key not in ('start_date', 'work_days', 'exceptions', 'daily_limit',
                   'credit_enabled', 'compensation_enabled', 'progress_measure') then
    raise exception 'إعداد غير معروف: %', p_key using errcode = '22023';
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

  perform public.fn_set_engine_setting(v_program, p_track_id, p_key, v_value);
end;
$$;

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
  elsif p_key = 'start_date' then
    update public.tracks set start_date = null, start_date_overridden = false where id = p_track_id;
  elsif p_key in ('work_days', 'daily_limit', 'credit_enabled', 'compensation_enabled', 'progress_measure') then
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

-- ══ ٣ · حارس الأقسام في الاتجاهين ══

create or replace function public.fn_guard_material_layout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.material_layout', true) is not distinct from 'on' then
    return new;
  end if;

  if tg_table_name = 'material_sections' then
    if tg_op = 'INSERT'
       or new.unit_count is distinct from old.unit_count
       or new.sort_order is distinct from old.sort_order
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'الأبواب تُكتب من شاشة المادة: حجم الباب وترتيبه وحذفه يُعيد ترقيم وحداته'
        using errcode = '23514';
    end if;
  else
    if new.deleted_at is null and new.sequence > 100000 then
      raise exception 'رقم الوحدة ١٠٠٬٠٠٠ على الأكثر' using errcode = '23514';
    end if;
    -- وحدة الباب — قبل التعديل أو بعده — لا يتغيّر قسمها ولا رقمها ولا حذفها
    -- في أي اتجاه: كل ذلك يخالف حجم الباب حتى يُعاد الترقيم.
    if (tg_op = 'INSERT' and new.section_id is not null)
       or (tg_op = 'UPDATE'
           and (old.section_id is not null or new.section_id is not null)
           and (new.section_id is distinct from old.section_id
                or new.sequence is distinct from old.sequence
                or new.deleted_at is distinct from old.deleted_at)) then
      raise exception 'وحدات الباب تتبع عدده: غيّر عدد وحدات الباب بدل إضافة وحدة أو حذفها'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- ══ ٦ · كتابة الأقسام بما رآه المحرّر ══

drop function public.fn_set_material_sections(uuid, jsonb);

create or replace function public.fn_set_material_sections(
  p_program_id uuid,
  p_sections   jsonb,
  p_expected   uuid[] default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_offset constant int := 10000000;
  v_item   jsonb;
  v_index  bigint;
  v_id     uuid;
  v_new    uuid[] := '{}';
  v_kept   uuid[] := '{}';
  v_total  bigint := 0;
  v_name   text;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على مادة هذا البرنامج' using errcode = '42501';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'قائمة الأبواب غير صالحة' using errcode = '22023';
  end if;

  -- ── التحقّق قبل أي كتابة ──
  for v_item, v_index in select e, i from jsonb_array_elements(p_sections) with ordinality as t(e, i) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    if v_name = '' then
      raise exception 'الباب %: اسمه مطلوب', v_index using errcode = '23514';
    end if;
    -- CASE لا OR: ترتيب تقييم OR غير مضمون، فقد يُحوَّل النصّ رقماً قبل فحصه.
    -- وبين قوسين: شرط IF يُقرأ حتى أول THEN، وللـCASE نفسه THEN.
    if (case when coalesce(v_item ->> 'count', '') ~ '^[0-9]{1,6}$'
             then (v_item ->> 'count')::int else 0 end) < 1 then
      raise exception 'الباب «%»: عدد وحداته عدد صحيح موجب', v_name using errcode = '23514';
    end if;
    v_total := v_total + (v_item ->> 'count')::int;
    if v_item ? 'id' and jsonb_typeof(v_item -> 'id') = 'string' then
      if not exists (
        select 1 from public.material_sections s
        where s.id = (v_item ->> 'id')::uuid
          and s.program_id = p_program_id
          and s.deleted_at is null
      ) then
        raise exception 'الباب «%» غير موجود في هذه المادة', v_name using errcode = '22023';
      end if;
      v_kept := v_kept || (v_item ->> 'id')::uuid;
    end if;
  end loop;

  if v_total > 100000 then
    raise exception 'المادة أكبر من ١٠٠٬٠٠٠ وحدة' using errcode = '23514';
  end if;

  select btrim(e ->> 'name') into v_name
  from jsonb_array_elements(p_sections) e
  group by btrim(e ->> 'name')
  having count(*) > 1
  limit 1;
  if v_name is not null then
    raise exception 'اسم الباب «%» مكرر', v_name using errcode = '23514';
  end if;

  if cardinality(v_kept) <> (select count(distinct k) from unnest(v_kept) k) then
    raise exception 'الباب الواحد ورد مرتين في القائمة' using errcode = '22023';
  end if;

  -- ── الكتابة ──
  perform pg_advisory_xact_lock(hashtextextended('material:' || p_program_id::text, 0));

  -- القائمة التي رآها المحرّر — إن تغيّرت بعدها فالكتابة تُسقط ما لم يره.
  if p_expected is not null and (
    select coalesce(array_agg(s.id order by s.id), '{}')
    from public.material_sections s
    where s.program_id = p_program_id and s.deleted_at is null
  ) is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(p_expected) x) then
    raise exception 'تغيّرت الأبواب منذ فتحت الشاشة. حدّث الصفحة ثم أعد التعديل' using errcode = '40001';
  end if;

  perform set_config('app.material_layout', 'on', true);

  update public.material_sections s
  set name = s.id::text
  where s.program_id = p_program_id and s.deleted_at is null and s.id = any (v_kept);

  update public.material_sections s
  set deleted_at = now()
  where s.program_id = p_program_id and s.deleted_at is null and not (s.id = any (v_kept));

  for v_item, v_index in select e, i from jsonb_array_elements(p_sections) with ordinality as t(e, i) loop
    if v_item ? 'id' and jsonb_typeof(v_item -> 'id') = 'string' then
      update public.material_sections
      set name = btrim(v_item ->> 'name'),
          unit_count = (v_item ->> 'count')::int,
          sort_order = v_index::int
      where id = (v_item ->> 'id')::uuid;
    else
      insert into public.material_sections (program_id, name, sort_order, unit_count)
      values (p_program_id, btrim(v_item ->> 'name'), v_index::int, (v_item ->> 'count')::int)
      returning id into v_id;
      v_new := v_new || v_id;
    end if;
  end loop;

  foreach v_id in array v_new loop
    update public.content_units u
    set section_id = v_id
    where u.id in (
      select c.id from public.content_units c
      where c.program_id = p_program_id and c.deleted_at is null and c.section_id is null
      order by c.sequence
      limit (select s.unit_count from public.material_sections s where s.id = v_id)
    );
  end loop;

  update public.content_units u
  set deleted_at = now()
  from public.material_sections s
  where u.section_id = s.id
    and s.deleted_at is not null
    and u.program_id = p_program_id
    and u.deleted_at is null;

  with ranked as (
    select u.id,
           row_number() over (partition by u.section_id order by u.sequence) as rn,
           s.unit_count
    from public.content_units u
    join public.material_sections s on s.id = u.section_id and s.deleted_at is null
    where u.program_id = p_program_id and u.deleted_at is null
  )
  update public.content_units u
  set deleted_at = now()
  from ranked r
  where u.id = r.id and r.rn > r.unit_count;

  with secs as (
    select s.id,
           coalesce(sum(s.unit_count) over (
             order by s.sort_order, s.created_at
             rows between unbounded preceding and 1 preceding), 0)::int as base
    from public.material_sections s
    where s.program_id = p_program_id and s.deleted_at is null
  ),
  total as (
    select coalesce(sum(s.unit_count), 0)::int as units
    from public.material_sections s
    where s.program_id = p_program_id and s.deleted_at is null
  ),
  targets as (
    select u.id,
           (sc.base + row_number() over (partition by u.section_id order by u.sequence))::int as target
    from public.content_units u
    join secs sc on sc.id = u.section_id
    where u.program_id = p_program_id and u.deleted_at is null
    union all
    select u.id,
           ((select units from total) + row_number() over (order by u.sequence))::int
    from public.content_units u
    where u.program_id = p_program_id and u.deleted_at is null and u.section_id is null
  )
  update public.content_units u
  set sequence = t.target + v_offset
  from targets t
  where u.id = t.id and u.sequence <> t.target;

  update public.content_units u
  set sequence = u.sequence - v_offset
  where u.program_id = p_program_id and u.deleted_at is null and u.sequence > v_offset;

  with secs as (
    select s.id, s.unit_count,
           coalesce(sum(s.unit_count) over (
             order by s.sort_order, s.created_at
             rows between unbounded preceding and 1 preceding), 0)::int as base
    from public.material_sections s
    where s.program_id = p_program_id and s.deleted_at is null
  )
  insert into public.content_units (program_id, section_id, sequence)
  select p_program_id, sc.id, sc.base + g
  from secs sc
  cross join lateral generate_series(1, sc.unit_count) g
  where not exists (
    select 1 from public.content_units u
    where u.program_id = p_program_id
      and u.deleted_at is null
      and u.sequence = sc.base + g
  );

  perform set_config('app.material_layout', 'off', true);
end;
$$;

comment on function public.fn_set_material_sections(uuid, jsonb, uuid[]) is
  'adr/0039 | يضبط أقسام المادة بالقائمة كاملة ثم يعيد ترقيم الوحدات. p_expected: معرّفات الأقسام التي رآها المحرّر — تُرفض الكتابة إن تغيّرت.';

revoke all on function public.fn_set_material_sections(uuid, jsonb, uuid[]) from public;
grant execute on function public.fn_set_material_sections(uuid, jsonb, uuid[]) to authenticated;

-- ══ ٧ · سقف الرقم المتّصل — في الحارس لا قيداً ══
-- القيد يُفحص صفّاً صفّاً، وإعادة الترقيم تمرّ بأرقامٍ فوق الإزاحة مؤقتاً —
-- فيُفرض خارج دالة الترقيم وحدها (الحارس أعلاه).
