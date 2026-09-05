-- 022 | الإعداد السريع — أحد عشر مفهوماً تصير خمسة أسئلة
--
-- قال الراعي إن الشاشات «غير مفهومة من قوة التعقيد». وأحد وجهي العلّة أن
-- تشغيل برنامج واحد كان يمرّ على أحد عشر مفهوماً: قسم ← برنامج ← مسار ←
-- وحدة محتوى ← نصيب المسار ← واجب ← نوعه ← شكل يوم ← مقدار ← خطة ← ضِعف.
--
-- والذي يحتاجه المُعِدّ فعلاً خمسة: **المادة · نصيب المسارات · الواجبات ·
-- مدّة الخطة · إيقاع الراحة**. والستة الباقية افتراضاتٌ معقولة.
--
-- **لماذا في القاعدة لا في التطبيق:** العملية تكتب في ستّ جداول. ونصفُ
-- إعدادٍ أسوأ من لا إعداد — مادةٌ بلا نصيب، أو خطةٌ بلا شكل يوم، تترك
-- البرنامج في حالة لا تُفهَم ولا تُصلَح بزرّ. فإما الكلّ أو لا شيء.
--
-- **وعلى برنامج فارغ وحده.** الإعداد السريع بداية لا تصحيح: من بدأ يدوياً
-- يُكمل يدوياً، ولا يُمحى عمله بافتراضات.
--
-- تراجع: نعم.

create or replace function public.fn_quick_setup(
  p_program_id uuid,
  p_lines      text[],
  p_fields     jsonb,
  p_day_count  int,
  p_rest_every int
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_units    int;
  v_tracks   int := 0;
  v_template uuid;
  v_track    record;
  v_field    jsonb;
  v_field_id uuid;
  v_order    int := 0;
  v_plan     uuid;
  v_days     int := 0;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على هذا البرنامج' using errcode = '42501';
  end if;

  -- ══ برنامج فارغ وحده ══
  if exists (
    select 1 from public.content_units
    where program_id = p_program_id and deleted_at is null
  ) or exists (
    select 1 from public.task_fields
    where program_id = p_program_id and deleted_at is null
  ) or exists (
    select 1 from public.day_templates
    where program_id = p_program_id and deleted_at is null
  ) then
    raise exception 'البرنامج ليس فارغاً — الإعداد السريع بداية لا تصحيح'
      using errcode = '23505';
  end if;

  v_units := coalesce(array_length(p_lines, 1), 0);
  if v_units = 0 then
    raise exception 'المادة مطلوبة — سطر لكل عنصر' using errcode = '23514';
  end if;

  if p_day_count < 1 or p_day_count > public.fn_plan_max_days() then
    raise exception 'مدّة الخطة بين ١ و%', public.fn_plan_max_days() using errcode = '23514';
  end if;

  if jsonb_array_length(coalesce(p_fields, '[]'::jsonb)) = 0 then
    raise exception 'واجب واحد على الأقل مطلوب' using errcode = '23514';
  end if;

  -- ══ ١ · المادة ══
  insert into public.content_units (program_id, sequence, label)
  select p_program_id, ordinality::int, btrim(line)
  from unnest(p_lines) with ordinality as t(line, ordinality)
  where btrim(line) <> '';

  get diagnostics v_units = row_count;

  -- ══ ٢ · نصيب كل مسار: المادة كاملة ══
  -- الافتراض المعقول. ومن أراد التفريق يعدّله في شاشة المادة بعدها.
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

  -- ══ ٣ · شكل اليوم وواجباته ══
  insert into public.day_templates (program_id, name)
  values (p_program_id, 'اليوم المعتاد')
  returning id into v_template;

  for v_field in select * from jsonb_array_elements(p_fields)
  loop
    insert into public.task_fields (program_id, label, kind, sort_order)
    values (
      p_program_id,
      btrim(v_field ->> 'label'),
      (v_field ->> 'kind')::public.field_kind,
      v_order
    )
    returning id into v_field_id;

    insert into public.day_template_fields
      (day_template_id, task_field_id, base_amount, sort_order)
    values (v_template, v_field_id, (v_field ->> 'amount')::numeric, v_order);

    v_order := v_order + 1;
  end loop;

  -- ══ ٤ · خطة لكل مسار ══
  for v_track in
    select id, name from public.tracks
    where program_id = p_program_id and deleted_at is null
    order by sort_order
  loop
    insert into public.plans (track_id, name)
    values (v_track.id, 'خطة ' || v_track.name)
    returning id into v_plan;

    insert into public.plan_days (plan_id, day_number, day_type, day_template_id)
    select
      v_plan,
      g,
      case when p_rest_every > 0 and g % p_rest_every = 0
           then 'rest'::public.day_type
           else 'normal'::public.day_type end,
      case when p_rest_every > 0 and g % p_rest_every = 0
           then null else v_template end
    from generate_series(1, p_day_count) as g;

    v_days := v_days + p_day_count;
  end loop;

  return jsonb_build_object(
    'units', v_units,
    'tracks', v_tracks,
    'fields', v_order,
    'days', v_days
  );
end;
$$;

comment on function public.fn_quick_setup(uuid, text[], jsonb, int, int) is
  'إعداد برنامج فارغ دفعة واحدة: مادة ونصيب ومواضع وشكل يوم وخطة لكل مسار. إما الكلّ أو لا شيء.';

revoke all on function public.fn_quick_setup(uuid, text[], jsonb, int, int) from public;
grant execute on function public.fn_quick_setup(uuid, text[], jsonb, int, int) to authenticated;
