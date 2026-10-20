-- 096 | بداية احتساب الموعد: من التحاق المشارك أو من بداية البرنامج (خطة المدة الثلاثينية · ش١)
--
-- قرار الراعي (٢٠ أكتوبر ٢٠٢٦): إعدادٌ للبرنامج يُخصَّص للمسار — «من يوم التحاق كل مشارك» (الافتراض،
-- السلوك القائم حرفياً) أو «من بداية البرنامج للجميع». في الثاني يُعرض المتأخر في التسجيل متأخراً بما
-- فاته، **ولا تُكتب أيامه قبل التحاقه «متعثّرة»** في الأرشيف.
--
-- المحرّك يُرجع ثلاثاً بدل اثنين:
--   start_date  — بداية الموعد (بداية البرنامج في الثاني، ويومه الأول في الأول).
--   judge_start — بداية الحكم في الأرشيف = start_date القديمة حرفياً.
--   pace_base   — ما يُضاف فوق العدّ: base_done في الأول، وصفرٌ في الثاني — العدّ من بداية البرنامج
--                 يشمل ما أتمّه قبل التحاقه بالمسار، فإضافته فوقه تحسبه مرتين (مراجعة الخطة ح١).
-- ومن يحسب الموعد يقرأ pace_base: الأرشيف · الحال · fn_due_days_at (عبر مستدعيه) · fn_my_plan ·
-- fn_my_stats. والإعداد في مشغّلَي «التسوية قبل الإعداد» فلا يُحكم على الماضي به (مراجعة م٩).
--
-- تراجع: نعم — بإعادة التعريفات السابقة وحذف العمودين.

-- ══ العمودان ══
alter table public.programs add column due_from text not null default 'join';
alter table public.programs add constraint chk_programs_due_from check (due_from in ('join', 'program_start'));
alter table public.tracks add column due_from text;
alter table public.tracks add constraint chk_tracks_due_from check (due_from is null or due_from in ('join', 'program_start'));

comment on column public.programs.due_from is
  'الهجرة ٠٩٦ | بداية احتساب الموعد: join = من يوم التحاق كل مشارك (الافتراض) · program_start = من بداية البرنامج للجميع.';
comment on column public.tracks.due_from is
  'الهجرة ٠٩٦ | فارغ = موروث من البرنامج.';

-- ══ الحارس ══
CREATE OR REPLACE FUNCTION public.fn_guard_engine_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     or new.progress_measure is distinct from old.progress_measure
     or new.due_from is distinct from old.due_from then
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
$function$;

-- ══ مشغّلا التسوية قبل الإعداد: الإعداد الجديد معها ══
drop trigger trg_programs_settle_first on public.programs;
create trigger trg_programs_settle_first
  before update of start_date, work_days, daily_limit, credit_enabled, compensation_enabled, progress_measure, due_from
  on public.programs
  for each row execute function public.fn_settle_before_setting();
drop trigger trg_tracks_settle_first on public.tracks;
create trigger trg_tracks_settle_first
  before update of start_date, start_date_overridden, work_days, daily_limit, credit_enabled,
                   compensation_enabled, progress_measure, exceptions_overridden, due_from
  on public.tracks
  for each row execute function public.fn_settle_before_setting();

-- ══ الإعدادات بعد الوراثة (نوع النتيجة تغيّر فتُسقط وتُعاد) ══
drop function public.fn_engine_settings(uuid, uuid);
CREATE FUNCTION public.fn_engine_settings(p_program_id uuid, p_track_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(start_date date, work_days smallint[], daily_limit integer, credit_enabled boolean, compensation_enabled boolean, progress_measure progress_measure, exceptions date[], due_from text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    ), '{}'),
    coalesce(t.due_from, p.due_from)
  from public.programs p
  left join public.tracks t on t.id = p_track_id and t.program_id = p.id
  where p.id = p_program_id;
$function$;
revoke all on function public.fn_engine_settings(uuid, uuid) from public, anon, authenticated;

-- ══ الكتابة والتخصيص والوراثة ══
CREATE OR REPLACE FUNCTION public.fn_set_engine_setting(p_program_id uuid, p_track_id uuid, p_key text, p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      raise exception 'الحد اليومي بين 1 و20' using errcode = '23514';
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

  elsif p_key = 'due_from' then
    if v_text is null or v_text not in ('join', 'program_start') then
      raise exception 'بداية احتساب الموعد: من التحاق المشارك أو من بداية البرنامج' using errcode = '22023';
    end if;
    if p_track_id is null then
      update public.programs set due_from = v_text where id = p_program_id;
    else
      update public.tracks set due_from = v_text where id = p_track_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_customize_engine_setting(p_track_id uuid, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                   'credit_enabled', 'compensation_enabled', 'progress_measure', 'due_from') then
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
    when 'due_from' then to_jsonb(p.due_from)
  end into v_value
  from public.programs p where p.id = v_program;

  perform public.fn_set_engine_setting(v_program, p_track_id, p_key, v_value);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_inherit_engine_setting(p_track_id uuid, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  elsif p_key in ('work_days', 'daily_limit', 'credit_enabled', 'compensation_enabled', 'progress_measure', 'due_from') then
    execute format('update public.tracks set %I = null where id = $1', p_key) using p_track_id;
  else
    raise exception 'إعداد غير معروف: %', p_key using errcode = '22023';
  end if;

  perform public.fn_write_audit(
    'engine_setting_inherited', 'tracks', p_track_id, null, jsonb_build_object('key', p_key)
  );
  perform set_config('app.engine_settings', 'off', true);
end;
$function$;

-- ══ المحرّك ══
drop function public.fn_participant_engine(uuid);
CREATE FUNCTION public.fn_participant_engine(p_participant_id uuid, OUT program_id uuid, OUT track_id uuid, OUT plan_id uuid, OUT day_count integer, OUT start_date date, OUT daily_limit integer, OUT credit boolean, OUT compensation boolean, OUT measure progress_measure, OUT base_done integer, OUT judge_start date, OUT pace_base integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_judge  timestamptz;
  v_plan   timestamptz;
  v_moment timestamptz;
  v_first  date;
  v_due    text;
  v_set    date;
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
  select s.start_date, s.daily_limit, s.credit_enabled, s.compensation_enabled, s.progress_measure, s.due_from
  into start_date, daily_limit, credit, compensation, measure, v_due
  from public.fn_engine_settings(program_id, track_id) s;

  v_moment := greatest(v_judge, v_plan);
  v_first := public.fn_local_now(v_moment)::date;
  if v_moment >= public.fn_cut_at(program_id, track_id, v_first) then
    v_first := v_first + 1;
  end if;
  v_set := start_date;
  -- بداية الحكم: يومه الأول ولا يومَ قبل البداية — لا يُكتب يومٌ قبل التحاقه أو نقله في الأرشيف.
  judge_start := greatest(coalesce(v_set, v_first), v_first);
  base_done := case when plan_id is null then 0
                    else public.fn_done_days_at(p_participant_id, plan_id, track_id, v_moment) end;
  -- بداية الموعد: من بداية البرنامج للجميع إن ضُبط ذلك (الهجرة ٠٩٦) — والعدّ من البداية يشمل ما
  -- أتمّه قبل التحاقه بالمسار، فلا يُضاف base_done فوقه (مراجعة الخطة ح١). وإلا فمن يومه الأول.
  if v_due = 'program_start' and v_set is not null then
    -- ولا يُطالَب بيومٍ قبل أن تكون لمساره خطة (مراجعة ش١ ٢): الأبعد من البداية وأول حفظٍ للخطة.
    start_date := greatest(v_set, public.fn_local_now(v_plan)::date);
    pace_base := 0;
  else
    start_date := judge_start;
    pace_base := base_done;
  end if;
end;
$function$;
revoke all on function public.fn_participant_engine(uuid) from public, anon, authenticated;

-- ══ من يحسب الموعد ══
CREATE OR REPLACE FUNCTION public.fn_settle_commitment_at(p_participant_id uuid, p_until timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select greatest(e.judge_start, coalesce(max(a.calendar_date) + 1, e.judge_start)) into v_from
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
    -- المتوقَّع: pace_base (ما أتمّه عند البدء، أو صفرٌ حين يُحسب من بداية البرنامج)، وأيام البرنامج بعده.
    v_expected := least(e.day_count, e.pace_base + v_idx);

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
$function$;

CREATE OR REPLACE FUNCTION public.fn_journey_state_at(p_participant_id uuid, p_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- المتوقَّع: pace_base (ما أتمّه عند البدء، أو صفرٌ حين يُحسب من بداية البرنامج)، وأيام البرنامج بعده حتى اليوم ضمناً.
  v_expected := least(e.day_count,
    e.pace_base + public.fn_program_days_through(e.program_id, e.track_id, e.start_date, v_today));

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
    'judge_start', e.judge_start,
    'today', v_today,
    'is_program_day', public.fn_is_program_day(e.program_id, e.track_id, v_today),
    'deadline', to_char(v_deadline, 'HH24:MI'),
    'expected_day', v_expected,
    'due_days', public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.pace_base, p_at),
    'progress_pct', v_pct,
    'progress_units', v_units,
    'share_size', v_size,
    'measure', e.measure,
    'stumbled', v_stumbled,
    'compensated', v_comp,
    'carried', v_carried
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_my_duties()
 RETURNS TABLE(participant_id uuid, program_id uuid, program_name text, program_status program_status, track_name text, status participant_status, follows_plan boolean, day_count integer, done_days integer, progress_pct numeric, due_days integer, last_marked_at timestamp with time zone, proposed_track text, contact text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.pace_base, now()) end,
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_program_participants(p_program_id uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, full_name text, registration_no integer, track_id uuid, status participant_status, joined_at timestamp with time zone, baseline_percentage numeric, day_count integer, done_days integer, due_days integer, stumbled_days integer, compensated_days integer, prior_done_days integer, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select p.id, p.user_id, p.registration_no, p.track_id, p.status, p.joined_at, p.baseline_percentage
    from public.participants p
    where p.program_id = p_program_id and p.deleted_at is null
  ),
  eng as (
    select r.id, e.program_id, e.track_id, e.plan_id, e.day_count, e.start_date,
           case when e.plan_id is null then 0
                else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.pace_base, now())
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
    r.registration_no,
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_my_plan(p_participant_id uuid)
 RETURNS TABLE(day_number integer, scheduled_date date, expected_date date, completed_on date, stumbled boolean, compensated boolean, tasks jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e        record;
  s        record;
  v_now    timestamptz := now();
  v_today  date := public.fn_local_now()::date;
  v_done   int;
  v_slot   date;
  v_sched  date[];
  v_exp    date[];
  v_until  date;
begin
  perform public.fn_engine_access(p_participant_id, false);
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null or coalesce(e.day_count, 0) = 0 then
    return;
  end if;
  select * into s from public.fn_engine_settings(e.program_id, e.track_id);
  v_done := public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, v_now);

  -- أيام البرنامج: يومُ عملٍ أسبوعي ليس يومَ توقّف. والإعدادات تُقرأ مرّة لا لكل يوم.
  -- والمدى يكفي أطول خطة (٣٦٦ يوماً) بيوم عملٍ واحد في الأسبوع، وما بعده من توقّف.
  v_until := greatest(e.start_date, v_today) + (e.day_count * 7 + 120);
  select coalesce(array_agg(g::date order by g), '{}') into v_sched
  from generate_series(e.start_date, v_until, interval '1 day') g
  where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));

  -- أول موعدٍ متوقَّع لما بقي: قبل البداية يومُها الأول؛ واليوم إن كان يوم برنامجٍ لم يمضِ
  -- وقته ولم يُتمّ فيه يوماً — أو أتمّ وفتح التالي بنفسه فهو فيه الآن؛ وإلا يوم البرنامج التالي.
  if v_today < e.start_date then
    v_slot := e.start_date;
  elsif v_today = any (v_sched)
        and v_now < public.fn_cut_at(e.program_id, e.track_id, v_today)
        and (not exists (
          select 1 from public.day_completions c
          where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
            and c.deleted_at is null and c.undone_at is null
            and public.fn_local_now(c.completed_at)::date = v_today
        ) or exists (
          select 1 from public.day_openings o
          where o.participant_id = p_participant_id and o.plan_id = e.plan_id and o.track_id = e.track_id
            and o.day_number = v_done + 1 and o.deleted_at is null
            and public.fn_local_now(o.opened_at)::date = v_today
        )) then
    v_slot := v_today;
  else
    v_slot := v_today + 1;
  end if;
  select coalesce(array_agg(d order by d), '{}') into v_exp from unnest(v_sched) d where d >= v_slot;

  return query
  with segs as (
    -- مقاطع نصيب المسار مرّةً — برتبها كما في fn_track_ordinal_of، لا استدعاءٌ لكل صفّ (المراجعة م٤).
    select r.from_sequence, r.to_sequence,
           coalesce(sum(r.to_sequence - r.from_sequence + 1) over (
             order by r.sort_order, r.from_sequence rows between unbounded preceding and 1 preceding
           ), 0) as preceding_units
    from public.track_content_ranges r
    where r.track_id = e.track_id and r.deleted_at is null
  ),
  vals as (
    select v.day_number, v.task_field_id, v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition,
           f.label, f.kind, f.is_required, f.is_material_linked, f.sort_order, f.count_unit,
           sum(v.amount) over (
             partition by v.task_field_id order by v.day_number
             rows between unbounded preceding and current row
           ) as cum
    from public.plan_values v
    join public.task_fields f on f.id = v.task_field_id
    where v.plan_id = e.plan_id and v.deleted_at is null
  ),
  days as (
    select vals.day_number,
           jsonb_agg(jsonb_build_object(
             'field_id', vals.task_field_id,
             'label', vals.label,
             'kind', vals.kind,
             'is_required', vals.is_required,
             'is_material_linked', vals.is_material_linked,
             'count_unit', vals.count_unit,
             'amount', vals.amount,
             'ord_from', case
               when vals.kind::text = 'ranged' then (vals.cum - vals.amount + 1)::int
               when vals.kind::text = 'explicit' and vals.is_material_linked then (
               select (sg.preceding_units + (vals.from_sequence - sg.from_sequence + 1))::int
               from segs sg where vals.from_sequence between sg.from_sequence and sg.to_sequence limit 1)
               when vals.kind::text = 'explicit' then vals.from_sequence
             end,
             'ord_to', case
               when vals.kind::text = 'ranged' then vals.cum::int
               when vals.kind::text = 'explicit' and vals.is_material_linked then (
               select (sg.preceding_units + (vals.to_sequence - sg.from_sequence + 1))::int
               from segs sg where vals.to_sequence between sg.from_sequence and sg.to_sequence limit 1)
               when vals.kind::text = 'explicit' then vals.to_sequence
             end,
             'value', vals.value,
             'repetition', vals.repetition
           ) order by vals.sort_order, vals.label) as tasks
    from vals
    group by vals.day_number
  ),
  done as (
    select c.day_number, min(public.fn_local_now(c.completed_at)::date) as on_date
    from public.day_completions c
    where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
      and c.deleted_at is null and c.undone_at is null
    group by c.day_number
  ),
  slips as (
    -- المتعثَّر عليه: يومُ خطةٍ له صفُّ تعثّرٍ في أرشيف مساره **وخطته** (adr/0041).
    select a.plan_day,
           bool_and(a.compensated_at is not null) as all_comp
    from public.commitment_archive a
    where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
      and a.deleted_at is null and a.status = 'stumbled' and a.plan_day is not null
    group by a.plan_day
  )
  select g.n::int,
         case when g.n > e.pace_base then v_sched[g.n - e.pace_base] end,
         case when g.n > v_done then v_exp[g.n - v_done] end,
         case when g.n <= v_done then done.on_date end,
         slips.plan_day is not null,
         coalesce(slips.all_comp, false),
         coalesce(days.tasks, '[]'::jsonb)
  from generate_series(1, e.day_count) g(n)
  left join days on days.day_number = g.n
  left join done on done.day_number = g.n
  left join slips on slips.plan_day = g.n
  order by g.n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_my_stats(p_participant_id uuid)
 RETURNS TABLE(streak integer, on_time integer, reps bigint, stumbled_days integer, compensated_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e        record;
  s        record;
  v_now    timestamptz := now();
  v_today  date := public.fn_local_now()::date;
  v_done   int;
  v_streak int := 0;
  v_ontime int := 0;
  v_sched  date[];
  v_prev   date;
  r        record;
begin
  perform public.fn_engine_access(p_participant_id, false);
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null then
    return query select 0, 0, 0::bigint, 0, 0;
    return;
  end if;
  select * into s from public.fn_engine_settings(e.program_id, e.track_id);
  v_done := public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, v_now);

  -- اليوم قبل الحكم عليه: يُعدّ إن كان يوم برنامجٍ أُتمّ فيه يومٌ في نافذته — ما بعد وقت رصد
  -- يوم البرنامج السابق (فما أُتمّ بعد وقت الأمس يتبع اليوم). ويوم الراحة لا يُعدّ (المراجعة م١).
  if extract(dow from v_today)::smallint = any (s.work_days) and not (v_today = any (s.exceptions))
     and not exists (
       select 1 from public.commitment_archive a
       where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
         and a.deleted_at is null and a.calendar_date = v_today
     ) then
    select max(g::date) into v_prev
    from generate_series(v_today - 14, v_today - 1, interval '1 day') g
    where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));
    if exists (
      select 1 from public.day_completions c
      where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
        and c.deleted_at is null and c.undone_at is null
        and c.completed_at <= v_now
        and c.completed_at > coalesce(public.fn_cut_at(e.program_id, e.track_id, v_prev), '-infinity'::timestamptz)
    ) then
      v_streak := 1;
    end if;
  end if;

  for r in
    select a.status from public.commitment_archive a
    where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
      and a.deleted_at is null and a.calendar_date <= v_today
    order by a.calendar_date desc
  loop
    exit when r.status = 'stumbled';
    if r.status = 'completed' then
      v_streak := v_streak + 1;
    end if;
  end loop;

  -- في موعدها: الإتمام قبل وقت نهاية رصد اليوم المقرَّر (المراجعة م٢). وما أُتمّ قبل لحظة البدء
  -- (pace_base) في موعده — وصفرٌ حين يُحسب الموعد من بداية البرنامج.
  select coalesce(array_agg(g::date order by g), '{}') into v_sched
  from generate_series(e.start_date, greatest(e.start_date, v_today) + (e.day_count * 7 + 120), interval '1 day') g
  where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));
  select count(*)::int into v_ontime
  from public.day_completions c
  where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
    and c.deleted_at is null and c.undone_at is null and c.day_number <= v_done
    and (
      c.day_number <= e.pace_base
      or c.completed_at <= public.fn_cut_at(e.program_id, e.track_id, v_sched[c.day_number - e.pace_base])
    );

  return query
  select v_streak,
         v_ontime,
         coalesce((
           select sum(c.count) from public.field_counts c
           where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
             and c.deleted_at is null and c.day_number <= v_done
         ), 0)::bigint,
         (select count(*)::int from public.commitment_archive a
           where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
             and a.deleted_at is null and a.status = 'stumbled'),
         (select count(*)::int from public.commitment_archive a
           where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
             and a.deleted_at is null and a.status = 'stumbled' and a.compensated_at is not null);
end;
$function$;
