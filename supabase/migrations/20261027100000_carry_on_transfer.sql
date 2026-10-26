-- حمل التقدّم عند النقل (ش٢ · خطة ٢٦ أكتوبر) — ١/٣: البيانات والإعداد والحرّاس.
--
-- `programs.carry_on_transfer`: سياسة قبول النقل في البرنامج (لا تُخصَّص للمسار) — مفعّلةً يُحمل
-- للمنقول ما بلغه في مساره القديم إلى الجديد. ولا تمسّ ما مضى، فلا تدخل «التسوية قبل الإعداد».
-- `participants.credited_units` / `credited_at`: ما حُمل له بالوحدات ولحظة قبول نقله. تكتبهما
-- `fn_decide_track_change` وحدها، ويُصفَّران بكل تغيّرٍ للمسار لا تكتبهما فيه.
-- تنبيه تسمية: `credit_enabled` (إعفاء المتقدّم في الأرشيف) شيءٌ آخر.

alter table public.programs
  add column carry_on_transfer boolean not null default false;
comment on column public.programs.carry_on_transfer is
  'حمل التقدّم عند النقل: يُحتسب للمنقول ما بلغه في مساره القديم (بالرتبة، مقصوصاً بنصيب الجديد)، وموعده من بداية البرنامج. يمسّ القبولات القادمة وحدها.';

alter table public.participants
  add column credited_units int,
  add column credited_at timestamptz,
  add constraint chk_participants_credit_pair check ((credited_units is null) = (credited_at is null)),
  add constraint chk_participants_credit_units check (credited_units is null or credited_units >= 0);
comment on column public.participants.credited_units is
  'الوحدات المحمولة من المسار السابق عند قبول نقله — تُشتقّ منها الأيام المحتسبة عند القراءة (fn_credited_days_at). غير credit_enabled.';
-- الحرّاس والقفل يسألون «أعلى هذا المسار منقولٌ محمول؟» — والمحمولون قلّة.
create index idx_participants_credited on public.participants (track_id) where credited_at is not null and deleted_at is null;

comment on column public.participants.credited_at is
  'لحظة قبول النقل المحمول — تساوي judge_from حينها. والمحتسب لا يُقرأ قبلها.';

-- ══ الإعداد يُكتب من شاشته ══
create or replace function public.fn_guard_engine_settings()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
begin
  if current_setting('app.engine_settings', true) is not distinct from 'on' then
    return new;
  end if;
  -- لا اختصار في تقييم PL/pgSQL: حقلٌ غير موجود في الجدول يُفشل الشرط كله،
  -- فيُفحص ما يخصّ جدولاً واحداً في فرعه.
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
  if tg_table_name = 'programs' then
    if new.carry_on_transfer is distinct from old.carry_on_transfer then
      raise exception 'إعدادات التقويم والتقدّم تُكتب من شاشتها: ما يُكتب يُحكم به على أيامٍ مضت'
        using errcode = '23514';
    end if;
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

-- ══ المحتسب لا يُكتب مباشرة ══
create or replace function public.fn_guard_participant_track_change()
returns trigger
language plpgsql set search_path to ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (old.track_id is not null and new.track_id is distinct from old.track_id)
     or new.baseline_percentage is distinct from old.baseline_percentage
     or new.credited_units is distinct from old.credited_units
     or new.credited_at is distinct from old.credited_at then
    raise exception 'تغيير المسار يمرّ بقبول طلب تغييره' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger trg_participants_block_track_change on public.participants;
create trigger trg_participants_block_track_change
  before update of track_id, baseline_percentage, credited_units, credited_at on public.participants
  for each row execute function public.fn_guard_participant_track_change();

-- ══ يُصفَّر بكل نقلٍ لا يكتبه ══ — والمشاركة الجديدة بلا محتسب.
create or replace function public.fn_participant_credit_reset()
returns trigger
language plpgsql set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.credited_units := null;
    new.credited_at := null;
  elsif new.track_id is distinct from old.track_id and new.credited_at is not distinct from old.credited_at then
    new.credited_units := null;
    new.credited_at := null;
  end if;
  return new;
end;
$function$;
comment on function public.fn_participant_credit_reset() is
  'المحتسب لنقلٍ بعينه: نقلٌ لا يكتبه (طريقٌ غير fn_decide_track_change) يمحوه، والمشاركة الجديدة بلا محتسب.';

create trigger trg_participants_credit_reset
  before insert or update of track_id on public.participants
  for each row execute function public.fn_participant_credit_reset();

-- ══ كاتب الإعداد: فرعٌ للبرنامج وحده ══
do $$
declare
  v_def text := replace(pg_get_functiondef('public.fn_set_engine_setting(uuid, uuid, text, jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
  v_old text := $x$  else
    raise exception 'إعداد غير معروف: %', p_key using errcode = '22023';
  end if;$x$;
  v_new text := $x$  elsif p_key = 'carry_on_transfer' then
    -- سياسة قبولٍ للبرنامج كله: لا تُخصَّص للمسار.
    if p_track_id is not null then
      raise exception 'حمل التقدّم عند النقل إعدادٌ للبرنامج كله' using errcode = '22023';
    end if;
    if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'حمل التقدّم عند النقل: نعم أو لا' using errcode = '22023';
    end if;
    update public.programs set carry_on_transfer = (p_value #>> '{}')::boolean where id = p_program_id;

  else
    raise exception 'إعداد غير معروف: %', p_key using errcode = '22023';
  end if;$x$;
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_set_engine_setting: موضع الإدراج غير فريد';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;
