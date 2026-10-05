-- 064 | مراجعة الهجرة ٠٥٩ — ملاحظات مراجعة محايدة (٤ أكتوبر ٢٠٢٦)
--
-- ١. **الخطة تُكتب مباشرة فتتجاوز قواعدها.** منحة الإدراج والتحديث على `plans`
--    باقية (الإعداد السريع يُدرج بصلاحية المستدعي إلى أن يُعاد بناؤه)، فكان
--    يمكن عبر REST: حذف خطةٍ مخصّصة أتمّ مشاركوها أياماً، أو إنقاص أيامها تحت
--    المقفل بلا نسخة، أو نقلها إلى مسارٍ آخر، أو إنشاء مخصّصةٍ لمسارٍ يسير على
--    الافتراضية. فصار حارسٌ على الجدول يفرض القواعد نفسها أياً كان المدخل.
-- ٢. **الخطة تفسد من خارج حفظها.** تغيير «إلزامي» أو «أساس» أو «مقيَّد» بعد أن
--    أتمّ مشاركون أياماً، أو تعديل نصيب المسار أو إزاحة المادة — كلها تجعل الأيام
--    المقفلة خاطئة، ثم يرفض كلُّ حفظٍ تالٍ لأن الخطأ في يومٍ لا يتغيّر. فصار:
--    الحارس يمنع ما يفسد المقفل، وأخطاء الأيام المقفلة لا تحجب الحفظ.
-- ٣. **حفظان من محرّرين** يُسقط أحدهما الآخر بصمت: صار الحفظ يقبل النسخة التي
--    بدأ منها المحرّر، ويُرفض إن حُفظت بعدها نسخةٌ أحدث.
-- ٤. **الأرقام بلا سقف:** مقدارٌ أو قيمةٌ ضخمة تفيض في الجمع أو التخزين برسالةٍ
--    إنجليزية. صارت محدودة برسالة عربية.
-- ٥. `fn_plan_locked_through` بلا فحص صلاحية، والمشارك يرى خطط المسارات الأخرى.
--
-- تراجع: نعم.

-- ══ ١ · حارس الخطة ══

create or replace function public.fn_guard_plan_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default uuid;
begin
  if tg_op = 'INSERT' then
    -- مخصّصةٌ لمسارٍ يسير على الافتراضية: تبديل خطته ينقله إلى قيمٍ لم يسر عليها.
    if new.track_id is not null then
      select d.id into v_default from public.plans d
      where d.program_id = new.program_id and d.track_id is null and d.deleted_at is null;
      if v_default is not null and exists (
        select 1 from public.day_completions c
        where c.plan_id = v_default and c.track_id = new.track_id
          and c.undone_at is null and c.deleted_at is null
      ) then
        raise exception 'أتمّ مشاركو هذا المسار أياماً من الخطة الافتراضية، فلا تُستبدل خطتهم'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if new.track_id is distinct from old.track_id or new.program_id is distinct from old.program_id then
    raise exception 'لا تنتقل الخطة بين المسارات ولا البرامج' using errcode = '23514';
  end if;

  if new.day_count is distinct from old.day_count
     and current_setting('app.plan_save', true) is distinct from 'on' then
    raise exception 'أيام الخطة تُكتب من محرّرها: الحفظ يفحصها ويحفظ نسخة' using errcode = '23514';
  end if;

  if new.deleted_at is not null and old.deleted_at is null
     and public.fn_plan_locked_through(old.id) > 0 then
    raise exception 'أتمّ مشاركون أياماً من هذه الخطة، فلا تُحذف' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_plans_rules
  before insert or update on public.plans
  for each row execute function public.fn_guard_plan_rules();

-- ══ ٢ · ما يُفسد الأيام المقفلة من خارج الحفظ ══

-- خصائص الحقل: «إلزامي» و«أساس» و«مقيَّد» تغيّر حكم أيامٍ أتمّها مشاركون.
create or replace function public.fn_guard_task_field_plan_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.kind is distinct from old.kind
      or new.is_material_linked is distinct from old.is_material_linked
      or (new.deleted_at is not null and old.deleted_at is null))
     and exists (
       select 1 from public.plan_values v
       join public.plans p on p.id = v.plan_id and p.deleted_at is null
       where v.task_field_id = old.id and v.deleted_at is null
     ) then
    raise exception 'لـ«%» قيمٌ في خطة: فرّغه من الخطة أولاً، ثم غيّر نوعه أو احذفه', old.label
      using errcode = '23514';
  end if;

  if (new.is_required is distinct from old.is_required
      or new.is_base is distinct from old.is_base
      or new.is_constrained is distinct from old.is_constrained)
     and exists (
       select 1 from public.plans p
       where p.program_id = old.program_id and p.deleted_at is null
         and public.fn_plan_locked_through(p.id) > 0
     ) then
    raise exception 'أتمّ مشاركون أياماً من خطط البرنامج: «إلزامي» و«أساس» و«مقيَّد» لا تتغيّر بعدها'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger trg_task_fields_plan_values on public.task_fields;
create trigger trg_task_fields_plan_values
  before update of kind, is_material_linked, deleted_at, is_required, is_base, is_constrained on public.task_fields
  for each row execute function public.fn_guard_task_field_plan_values();

-- نصيب المسار: يُجمَّد بإتمام يومٍ من خطته كما جُمّد بإرسال يومٍ من المحرّك القديم.
create or replace function public.fn_guard_track_ranges_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_track uuid;
begin
  v_track := coalesce(new.track_id, old.track_id);

  if exists (
    select 1
    from public.achievements a
    join public.plan_days pd on pd.id = a.plan_day_id
    join public.plans pl on pl.id = pd.plan_id
    where pl.track_id = v_track and a.deleted_at is null
  ) or exists (
    select 1 from public.day_completions c
    where c.track_id = v_track and c.deleted_at is null
  ) then
    raise exception 'لهذا المسار مشاركون ذوو إنجاز، فمقاطعه لا تُعدَّل'
      using errcode = '23514',
            hint = 'تعديل المقاطع يُزيح رتب من بعده، فيُسنَد للمشارك محفوظٌ ليس من مساره.';
  end if;

  return coalesce(new, old);
end;
$$;

-- المادة: ما يُزيح رقماً أو يحذف وحدةً بعد أن بُنيت خطةٌ عليها — adr/0039.
-- لا يستثنيه علمُ الترقيم: الإزاحة داخل `fn_set_material_sections` هي ما يُمنع.
create or replace function public.fn_guard_units_under_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null
     and (new.sequence is distinct from old.sequence or new.deleted_at is not null)
     and exists (
       select 1
       from public.plan_values v
       join public.plans p on p.id = v.plan_id and p.deleted_at is null
       join public.task_fields f on f.id = v.task_field_id and f.is_material_linked
       where p.program_id = old.program_id and v.deleted_at is null
     ) then
    raise exception 'للمادة خطةٌ مبنية على أرقامها: ما يُزيح وحدةً أو يحذفها يُفسد نطاقاتها. أضف الباب في آخر المادة'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_content_units_under_plan
  before update of sequence, deleted_at on public.content_units
  for each row execute function public.fn_guard_units_under_plan();

-- ══ ٥ · القراءة ══

create or replace function public.fn_plan_locked_through(p_plan_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  select p.program_id into v_program from public.plans p where p.id = p_plan_id;
  -- الحرّاس يستدعونها بلا مستخدم (auth.uid() فارغ في سياق القاعدة) — فلا فحص حينها.
  if (select auth.uid()) is not null and v_program is not null
     and not (public.fn_has_permission('programs.read', v_program)
              or public.fn_has_permission('programs.write', v_program)) then
    raise exception 'لا صلاحية لك على خطط هذا البرنامج' using errcode = '42501';
  end if;
  return (
    select coalesce(max(c.day_number), 0)::int
    from public.day_completions c
    where c.plan_id = p_plan_id and c.undone_at is null and c.deleted_at is null
  );
end;
$$;

drop policy plans_read_participant on public.plans;
create policy plans_read_participant on public.plans
  for select to authenticated
  using (
    exists (
      select 1 from public.participants pa
      where pa.user_id = (select auth.uid())
        and pa.program_id = plans.program_id
        and public.fn_follows_plan(pa.status)
        and pa.deleted_at is null
        and (plans.track_id is null or plans.track_id = pa.track_id)
    )
  );

-- ══ ٢ · ٣ · ٤ — الحفظ ══

drop function public.fn_save_plan(uuid, jsonb, text);

/**
 * **المدخل الوحيد لكتابة الخطة** — الحفظ اليدوي والاستيراد والتعبئة والرجوع لنسخة.
 *
 * `p_payload`: `{ day_count, values: [{ day, field_id, amount? | from?, to? | value?, repetition? }] }`.
 * `p_base_version`: النسخة التي بدأ منها المحرّر — يُرفض الحفظ إن حُفظت بعدها أحدث.
 *
 * - `BR-PLAN-02` يوم الخطة الذي أتمّه مشاركٌ واحد لا يتغيّر، ولا تقلّ الأيام عنه.
 * - ثم تُفحص الخطة المكتوبة بـ`fn_plan_issues`، وأي خطأٍ **في يومٍ غير مقفل**
 *   يُرجع الحفظ كله. وخطأ المقفل لا يحجبه: لا يملك الحفظ تصحيحه.
 * - ثم نسخةٌ برقمها، وسطرٌ في التدقيق.
 */
create or replace function public.fn_save_plan(
  p_plan_id      uuid,
  p_payload      jsonb,
  p_note         text default null,
  p_base_version int  default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception 'عدد أيام الخطة بين ١ و٣٦٦' using errcode = '23514';
  end if;
  if jsonb_array_length(p_payload -> 'values') > 366 * 20 then
    raise exception 'الخطة أكبر من الحدّ: ٢٠ حقلاً في كل يوم على الأكثر' using errcode = '23514';
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
    raise exception 'في الخطة رقمٌ غير صالح: المقدار و«من/إلى» والتكرار أعداد صحيحة، والقيمة عددٌ دون ١٠٬٠٠٠٬٠٠٠'
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

  select format('قيمة في اليوم %s خارج أيام الخطة (١–%s)',
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
    raise exception 'التكرار بين ١ و١٠٠٠' using errcode = '23514';
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
    raise exception 'الأيام ١–% أتمّها مشاركون، فلا تتغيّر', public.fn_ar_digits(v_locked::text)
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
$$;

-- `fn_create_plan` يكتب أيام المخصّصة المنسوخة: يرفع العلَم ليمرّ حارس الأيام.
create or replace function public.fn_create_plan(p_program_id uuid, p_track_id uuid, p_copy boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default uuid;
  v_track   text;
  v_id      uuid;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على خطط هذا البرنامج' using errcode = '42501';
  end if;

  select d.id into v_default from public.plans d
  where d.program_id = p_program_id and d.track_id is null and d.deleted_at is null;

  if p_track_id is null then
    if v_default is not null then
      raise exception 'للبرنامج خطة افتراضية' using errcode = '23505';
    end if;
    insert into public.plans (program_id, track_id, name, day_count)
    values (p_program_id, null, 'الخطة الافتراضية', 0)
    returning id into v_id;
  else
    select t.name into v_track from public.tracks t
    where t.id = p_track_id and t.program_id = p_program_id and t.deleted_at is null;
    if v_track is null then
      raise exception 'المسار ليس من هذا البرنامج' using errcode = '22023';
    end if;
    if exists (select 1 from public.plans c where c.track_id = p_track_id and c.deleted_at is null) then
      raise exception 'للمسار خطة مخصّصة' using errcode = '23505';
    end if;

    -- حارس الإدراج يرفض مسارًا يسير على الافتراضية — برسالته.
    insert into public.plans (program_id, track_id, name, day_count)
    values (p_program_id, p_track_id, 'خطة ' || v_track, 0)
    returning id into v_id;

    if p_copy and v_default is not null then
      insert into public.plan_values
        (plan_id, day_number, task_field_id, amount, from_sequence, to_sequence, value, repetition)
      select v_id, v.day_number, v.task_field_id, v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition
      from public.plan_values v
      where v.plan_id = v_default and v.deleted_at is null;
      perform set_config('app.plan_save', 'on', true);
      update public.plans set day_count = (select day_count from public.plans where id = v_default) where id = v_id;
      perform set_config('app.plan_save', 'off', true);
    end if;
  end if;

  perform public.fn_write_audit(
    'plan_created', 'plans', v_id, null,
    jsonb_build_object('track_id', p_track_id, 'copied', p_copy)
  );
  return v_id;
end;
$$;

revoke all on function public.fn_guard_plan_rules() from public;
revoke all on function public.fn_guard_units_under_plan() from public;
revoke all on function public.fn_save_plan(uuid, jsonb, text, int) from public;
grant execute on function public.fn_save_plan(uuid, jsonb, text, int) to authenticated;
