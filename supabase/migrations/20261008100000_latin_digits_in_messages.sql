-- 070 | الأرقام اللاتينية في رسائل القاعدة (adr/0046)
--
-- الواجهة صارت تعرض الأرقام لاتينية، ورسائل الدوال كانت تكتبها هندية — بنصٍّ
-- ثابت («بين ١ و٣٦٦») أو بـ`fn_ar_digits`. فتختلط الصيغتان في جملةٍ واحدة.
--
-- `fn_ar_digits` تصير هويةً (تُبقي اسمها كي لا تُعاد كتابة كل من يناديها)،
-- والدوال الستّ التي تحمل رقماً ثابتاً في رسائلها تُعاد بتعريفها الحيّ نفسه
-- مع تحويل أرقام الرسائل وحدها. لا منطق يتغيّر.
--
-- تراجع: نعم — إعادة تعريفاتها من الهجرات السابقة.

create or replace function public.fn_ar_digits(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_value;
$$;

-- ══ fn_guard_material_layout ══
CREATE OR REPLACE FUNCTION public.fn_guard_material_layout()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      raise exception 'رقم الوحدة 100,000 على الأكثر' using errcode = '23514';
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
$function$;

-- ══ fn_quick_setup ══
CREATE OR REPLACE FUNCTION public.fn_quick_setup(p_program_id uuid, p_lines text[], p_fields jsonb, p_day_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_units    int;
  v_tracks   int := 0;
  v_template uuid;
  v_track    record;
  v_field    jsonb;
  v_field_id uuid;
  v_kind     public.field_kind;
  v_amount   numeric;
  v_order    int := 0;
  v_base     boolean := false;
  v_plan     uuid;
  v_days     int := 0;
  v_counted  boolean := false;
  v_fields   jsonb := '[]'::jsonb;
  v_values   jsonb := '[]'::jsonb;
  f          jsonb;
  d          int;
  v_left     int;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على هذا البرنامج' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.content_units
    where program_id = p_program_id and deleted_at is null
  ) or exists (
    select 1 from public.task_fields
    where program_id = p_program_id and deleted_at is null
  ) or exists (
    select 1 from public.day_templates
    where program_id = p_program_id and deleted_at is null
  ) or exists (
    select 1 from public.plans
    where program_id = p_program_id and deleted_at is null
  ) then
    raise exception 'البرنامج ليس فارغاً — الإعداد السريع بداية لا تصحيح'
      using errcode = '23505';
  end if;

  if coalesce(array_length(p_lines, 1), 0) = 0 then
    raise exception 'المادة مطلوبة — سطر لكل عنصر' using errcode = '23514';
  end if;

  if p_day_count is null or p_day_count < 1 or p_day_count > 366 then
    raise exception 'مدّة الخطة بين 1 و366' using errcode = '23514';
  end if;

  if jsonb_array_length(coalesce(p_fields, '[]'::jsonb)) = 0 then
    raise exception 'حقلٌ واحد على الأقل مطلوب' using errcode = '23514';
  end if;

  -- ══ 1 · المادة — تُرشَّح ثم تُرقَّم ══
  insert into public.content_units (program_id, sequence, label)
  select p_program_id, (row_number() over (order by t.ord))::int, btrim(t.line)
  from unnest(p_lines) with ordinality as t(line, ord)
  where btrim(t.line) <> '';

  get diagnostics v_units = row_count;

  if v_units = 0 then
    raise exception 'المادة مطلوبة — سطر لكل عنصر' using errcode = '23514';
  end if;

  -- ══ 2 · نصيب كل مسار: المادة كاملة ══
  for v_track in
    select id from public.tracks
    where program_id = p_program_id and deleted_at is null
    order by sort_order
  loop
    insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
    values (v_track.id, 1, v_units, 0);
    v_tracks := v_tracks + 1;
  end loop;

  if v_tracks = 0 then
    raise exception 'لا مسارات في هذا البرنامج — أضِف مساراً أولاً' using errcode = '23514';
  end if;

  -- ══ 3 · حقول الخطة، وشكل يومٍ بها أداةً للتعبئة ══
  insert into public.day_templates (program_id, name)
  values (p_program_id, 'اليوم المعتاد')
  returning id into v_template;

  for v_field in select * from jsonb_array_elements(p_fields)
  loop
    v_kind := (v_field ->> 'kind')::public.field_kind;
    v_amount := (v_field ->> 'amount')::numeric;
    if v_kind::text not in ('ranged', 'counted') then
      raise exception 'الإعداد السريع يقبل الحقل التراكمي والعددي وحدهما' using errcode = '23514';
    end if;
    if v_amount is null or v_amount <= 0 or (v_kind::text = 'ranged' and v_amount <> trunc(v_amount)) then
      raise exception 'مقدار «%» عددٌ موجب، وصحيحٌ في التراكمي', btrim(v_field ->> 'label') using errcode = '23514';
    end if;

    insert into public.task_fields (program_id, label, kind, sort_order, is_base)
    values (
      p_program_id,
      btrim(v_field ->> 'label'),
      v_kind,
      v_order,
      v_kind::text = 'ranged' and not v_base
    )
    returning id into v_field_id;
    v_base := v_base or v_kind::text = 'ranged';
    v_counted := v_counted or v_kind::text = 'counted';

    insert into public.day_template_fields
      (day_template_id, task_field_id, base_amount, sort_order)
    values (v_template, v_field_id, v_amount, v_order);

    v_fields := v_fields || jsonb_build_object('id', v_field_id, 'kind', v_kind::text, 'amount', v_amount);
    v_order := v_order + 1;
  end loop;

  -- ══ 4 · الخطة الافتراضية ══
  -- أيامٌ بعد نفاد المادة بلا حقلٍ عددي تبقى بلا نشاط — فتقصر الخطة عندها.
  v_days := case when v_counted then p_day_count else least(p_day_count, (
    select max(ceil(v_units / (x ->> 'amount')::numeric))::int
    from jsonb_array_elements(v_fields) x where x ->> 'kind' = 'ranged'
  )) end;

  for d in 1 .. v_days loop
    for f in select * from jsonb_array_elements(v_fields)
    loop
      if f ->> 'kind' = 'counted' then
        v_values := v_values || jsonb_build_object('day', d, 'field_id', f ->> 'id', 'value', (f ->> 'amount')::numeric);
      else
        v_left := v_units - ((f ->> 'amount')::int * (d - 1));
        if v_left > 0 then
          v_values := v_values || jsonb_build_object(
            'day', d, 'field_id', f ->> 'id', 'amount', least((f ->> 'amount')::int, v_left));
        end if;
      end if;
    end loop;
  end loop;

  v_plan := public.fn_create_plan(p_program_id, null, false);
  perform public.fn_save_plan(
    v_plan, jsonb_build_object('day_count', v_days, 'values', v_values), 'الإعداد السريع'
  );

  return jsonb_build_object(
    'units', v_units,
    'tracks', v_tracks,
    'fields', v_order,
    'days', v_days
  );
end;
$function$;

-- ══ fn_register ══
CREATE OR REPLACE FUNCTION public.fn_register(p_program_id uuid, p_track_id uuid, p_answers jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid         uuid := (select auth.uid());
  v_answers     jsonb := coalesce(p_answers, '{}'::jsonb);
  v_missing     text;
  v_participant uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;

  if p_track_id is null and exists (
    select 1 from public.tracks where program_id = p_program_id and deleted_at is null
  ) then
    raise exception 'اختر مسارك في البرنامج' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_each_text(v_answers) where char_length(value) > 2000
  ) then
    raise exception 'إحدى الإجابات أطول من المسموح (2000 حرف)' using errcode = '23514';
  end if;

  -- الأسئلة التي تخصّه: العامّة وأسئلة مساره.
  select string_agg(q.question, ' · ' order by q.sort_order)
  into v_missing
  from public.admission_questions q
  where q.program_id = p_program_id
    and q.deleted_at is null
    and q.is_required
    and (q.track_id is null or q.track_id = p_track_id)
    and btrim(coalesce(v_answers ->> q.id::text, '')) = '';

  if v_missing is not null then
    raise exception 'أجب عن الأسئلة الإلزامية: %', v_missing using errcode = '23514';
  end if;

  insert into public.participants (user_id, program_id, track_id)
  values (v_uid, p_program_id, p_track_id)
  returning id into v_participant;

  insert into public.admission_answers (participant_id, question_id, answer)
  select v_participant, q.id, btrim(v_answers ->> q.id::text)
  from public.admission_questions q
  where q.program_id = p_program_id
    and q.deleted_at is null
    and (q.track_id is null or q.track_id = p_track_id)
    and btrim(coalesce(v_answers ->> q.id::text, '')) <> '';

  perform public.fn_write_audit(
    'participant_registered', 'participants', v_participant, null,
    jsonb_build_object('program_id', p_program_id, 'track_id', p_track_id)
  );

  return v_participant;
end;
$function$;

-- ══ fn_save_plan ══
CREATE OR REPLACE FUNCTION public.fn_save_plan(p_plan_id uuid, p_payload jsonb, p_note text DEFAULT NULL::text, p_base_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan    public.plans%rowtype;
  v_days    int;
  v_locked  int;
  v_bad     text;
  v_errors  text;
  v_version int;
  v_latest  int;
begin
  select * into v_plan from public.plans p where p.id = p_plan_id and p.deleted_at is null for update;
  if not found then
    raise exception 'الخطة غير موجودة' using errcode = '22023';
  end if;
  if not public.fn_has_permission('programs.write', v_plan.program_id) then
    raise exception 'لا صلاحية لك على خطط هذا البرنامج' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload -> 'values') is distinct from 'array' then
    raise exception 'صيغة الخطة غير صالحة' using errcode = '22023';
  end if;

  select coalesce(max(n.version_number), 0) into v_latest
  from public.plan_versions n where n.plan_id = p_plan_id and n.deleted_at is null;
  if p_base_version is not null and p_base_version <> v_latest then
    raise exception 'حُفظت نسخةٌ أحدث (%) منذ فتحت المحرّر. حدّث الصفحة ثم أعد تعديلك', public.fn_ar_digits(v_latest::text)
      using errcode = '40001';
  end if;

  v_days := case when (p_payload ->> 'day_count') ~ '^[0-9]{1,3}$' then (p_payload ->> 'day_count')::int end;
  if v_days is null or v_days < 1 or v_days > 366 then
    raise exception 'عدد أيام الخطة بين 1 و366' using errcode = '23514';
  end if;
  if jsonb_array_length(p_payload -> 'values') > 366 * 20 then
    raise exception 'الخطة أكبر من الحدّ: 20 حقلاً في كل يوم على الأكثر' using errcode = '23514';
  end if;

  v_locked := public.fn_plan_locked_through(p_plan_id);
  if v_days < v_locked then
    raise exception 'أتمّ مشاركون % يوماً من الخطة، فلا تقلّ أيامها عنها', public.fn_ar_digits(v_locked::text)
      using errcode = '23514';
  end if;

  -- الأعداد نصّاً ثم فحصاً: الرقم الضخم يفيض في `int` برسالة إنجليزية قبل أي فحص.
  if exists (
    select 1 from jsonb_array_elements(p_payload -> 'values') e,
      lateral (values (e ->> 'amount'), (e ->> 'from'), (e ->> 'to'), (e ->> 'repetition'), (e ->> 'day')) as k(v)
    where k.v is not null and k.v !~ '^[0-9]{1,6}$'
  ) or exists (
    select 1 from jsonb_array_elements(p_payload -> 'values') e
    where e ->> 'value' is not null and e ->> 'value' !~ '^[0-9]{1,7}(\.[0-9]+)?$'
  ) then
    raise exception 'في الخطة رقمٌ غير صالح: المقدار و«من/إلى» والتكرار أعداد صحيحة، والقيمة عددٌ دون 10,000,000'
      using errcode = '23514';
  end if;

  drop table if exists pg_temp.plan_payload;
  create temp table plan_payload on commit drop as
  select x.day, x.field_id, x.amount, x."from", x."to", round(x.value, 2) as value, x.repetition
  from jsonb_to_recordset(p_payload -> 'values')
    as x(day int, field_id uuid, amount int, "from" int, "to" int, value numeric, repetition int);

  -- ── الصيغة قبل الكتابة ──
  if exists (
    select 1 from pg_temp.plan_payload x
    where x.field_id is null or not exists (
      select 1 from public.task_fields f
      where f.id = x.field_id and f.program_id = v_plan.program_id and f.deleted_at is null
    )
  ) then
    raise exception 'في الخطة حقلٌ ليس من حقول هذا البرنامج' using errcode = '22023';
  end if;

  select format('قيمة في اليوم %s خارج أيام الخطة (1–%s)',
                public.fn_ar_digits(coalesce(x.day, 0)::text), public.fn_ar_digits(v_days::text))
  into v_bad
  from pg_temp.plan_payload x
  where x.day is null or x.day < 1 or x.day > v_days
  limit 1;
  if v_bad is not null then
    raise exception '%', v_bad using errcode = '23514';
  end if;

  select format('اليوم %s: «%s» مكرّر', public.fn_ar_digits(x.day::text), f.label)
  into v_bad
  from pg_temp.plan_payload x
  join public.task_fields f on f.id = x.field_id
  group by x.day, x.field_id, f.label
  having count(*) > 1
  limit 1;
  if v_bad is not null then
    raise exception '%', v_bad using errcode = '23514';
  end if;

  select format('اليوم %s: «%s» %s', public.fn_ar_digits(x.day::text), f.label,
    case f.kind::text
      when 'ranged' then 'يحتاج مقداراً موجباً وحده'
      when 'explicit' then 'يحتاج «من» و«إلى» موجبين، والبداية لا تزيد على النهاية'
      else 'يحتاج قيمة موجبة وحدها'
    end)
  into v_bad
  from pg_temp.plan_payload x
  join public.task_fields f on f.id = x.field_id
  -- `is not true` لا `not`: القيمة الغائبة تجعل الشرط فارغاً لا كاذباً، والفارغ خطأ أيضاً.
  where (
    case f.kind::text
      when 'ranged' then x.amount > 0 and x."from" is null and x."to" is null and x.value is null
      when 'explicit' then x."from" > 0 and x."to" >= x."from" and x.amount is null and x.value is null
      else x.value > 0 and x.amount is null and x."from" is null and x."to" is null
    end
  ) is not true
  limit 1;
  if v_bad is not null then
    raise exception '%', v_bad using errcode = '23514';
  end if;

  if exists (
    select 1 from pg_temp.plan_payload x where x.repetition is not null and (x.repetition < 1 or x.repetition > 1000)
  ) then
    raise exception 'التكرار بين 1 و1000' using errcode = '23514';
  end if;

  -- ── BR-PLAN-02: الأيام المقفلة كما هي ──
  if v_locked > 0 and exists (
    (select v.day_number, v.task_field_id, v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition
       from public.plan_values v
      where v.plan_id = p_plan_id and v.deleted_at is null and v.day_number <= v_locked
     except
     select x.day, x.field_id, x.amount, x."from", x."to", x.value, x.repetition
       from pg_temp.plan_payload x where x.day <= v_locked)
    union all
    (select x.day, x.field_id, x.amount, x."from", x."to", x.value, x.repetition
       from pg_temp.plan_payload x where x.day <= v_locked
     except
     select v.day_number, v.task_field_id, v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition
       from public.plan_values v
      where v.plan_id = p_plan_id and v.deleted_at is null and v.day_number <= v_locked)
  ) then
    raise exception 'الأيام 1–% أتمّها مشاركون، فلا تتغيّر', public.fn_ar_digits(v_locked::text)
      using errcode = '23514';
  end if;

  -- ── الكتابة فوق المقفل ──
  update public.plan_values v
  set deleted_at = now()
  where v.plan_id = p_plan_id
    and v.deleted_at is null
    and v.day_number > v_locked
    and not exists (
      select 1 from pg_temp.plan_payload x
      where x.day = v.day_number and x.field_id = v.task_field_id
    );

  update public.plan_values v
  set amount = x.amount, from_sequence = x."from", to_sequence = x."to",
      value = x.value, repetition = x.repetition
  from pg_temp.plan_payload x
  where v.plan_id = p_plan_id
    and v.deleted_at is null
    and v.day_number > v_locked
    and x.day = v.day_number
    and x.field_id = v.task_field_id
    and (v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition)
        is distinct from (x.amount, x."from", x."to", x.value, x.repetition);

  insert into public.plan_values
    (plan_id, day_number, task_field_id, amount, from_sequence, to_sequence, value, repetition)
  select p_plan_id, x.day, x.field_id, x.amount, x."from", x."to", x.value, x.repetition
  from pg_temp.plan_payload x
  where x.day > v_locked
    and not exists (
      select 1 from public.plan_values v
      where v.plan_id = p_plan_id and v.deleted_at is null
        and v.day_number = x.day and v.task_field_id = x.field_id
    );

  perform set_config('app.plan_save', 'on', true);
  update public.plans set day_count = v_days where id = p_plan_id;
  perform set_config('app.plan_save', 'off', true);

  -- ── الفحص على المكتوب: خطأٌ في يومٍ غير مقفل يُرجع الحفظ كله ──
  select string_agg(i.message, ' · ') into v_errors
  from (
    select message from public.fn_plan_issues(p_plan_id)
    where severity = 'error' and (day_number is null or day_number > v_locked)
    limit 5
  ) i;
  if v_errors is not null then
    raise exception 'لا تُحفظ الخطة: %', v_errors using errcode = '23514';
  end if;

  v_version := v_latest + 1;
  insert into public.plan_versions (plan_id, version_number, snapshot, note, created_by)
  values (p_plan_id, v_version, public.fn_plan_snapshot(p_plan_id),
          coalesce(nullif(btrim(p_note), ''), 'حفظ'), (select auth.uid()));

  perform public.fn_write_audit(
    'plan_saved', 'plans', p_plan_id, null,
    jsonb_build_object('version', v_version, 'day_count', v_days, 'note', p_note)
  );
  return v_version;
end;
$function$;

-- ══ fn_set_engine_setting ══
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

-- ══ fn_set_material_sections ══
CREATE OR REPLACE FUNCTION public.fn_set_material_sections(p_program_id uuid, p_sections jsonb, p_expected uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    raise exception 'المادة أكبر من 100,000 وحدة' using errcode = '23514';
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
$function$;

