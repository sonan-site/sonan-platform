-- 016 | تحصين الخطة — سباقٌ صامت، واقتران خفيّ، وبدائيّة مكشوفة
--
-- ثلاثة عيوب كشفتها مراجعة محايدة على الهجرة ٠١٤، وكلها صامتة:
--
-- **١ · سباق يترك فجوة دائمة.** `fn_plan_remove_day` كانت تقرأ `day_number`
-- بلا قفل ثم تُزيح به. حاذفان متزامنان: الأول يُزيح فيتغيّر رقم يوم الثاني،
-- والثاني يُزيح بالرقم البائت — فتبقى فجوة لا يكشفها شيء. فهرس التفرّد يمنع
-- التكرار لا الفجوة. والعلاج: **قفل صفّ الخطة ثم إعادة القراءة تحته**.
--
-- **٢ · اقتران خفيّ بين `programs.read` و`programs.write`.** سياسات الكتابة
-- كانت تعبر جداول محمية بأمن الصفوف (`plans` ← `tracks`)، والاستعلام الفرعي
-- داخل السياسة يخضع لسياسة الجدول المقصود. فمن يملك الكتابة دون القراءة
-- ينشئ خطة ثم لا يضيف إليها يوماً — بلا رسالة تشرح. والعلاج: **دوالّ حلّ
-- `security definer`** تُرجع البرنامج بلا مرور بأمن الصفوف. ويُعمَّم على
-- نظائره في الهجرة ٠١٣ (`platform.md §١٢`: العلّة تُعمَّم على أشباهها).
--
-- **٣ · بدائيّة الإزاحة مكشوفة.** `fn_plan_shift_days` كانت ممنوحة لكل
-- مصادَق، ونداؤها مباشرةً يفتح فجوة. الادّعاء بأن «الترقيم متّصل بالبناء»
-- كان أوسع من الحقيقة: كان متّصلاً بانضباط النوّاب الثلاثة وحدهم. والعلاج:
-- **تُحذَف البدائيّة ويُدمَج منطقها في كلٍّ منها.** ثمنه تكرار اثني عشر سطراً
-- ثلاثاً، ومقابله ألا يبقى بابٌ يكسر الاتصال. والبديل المدروس — مشغّل قيدٍ
-- مؤجَّل يفحص الاتصال آخر المعاملة — رُفض لأنه يفحص صفّاً صفّاً، فبناء خطة
-- من ٣٦٦ يوماً يصير ٣٦٦ فحصاً.
--
-- ومعها: حدّ طول الخطة يُفرَض في القاعدة لا في النموذج وحده، والحذف والنقل
-- يُرجعان عدد الصفوف المتأثرة — فالتصفية الصامتة تصير رفضاً معلَناً.
--
-- تراجع: نعم.

-- ══ دوالّ الحلّ — تعبر أمن الصفوف عمداً ══
-- كلها `stable` وتقرأ عموداً واحداً. لا تسرّب: البرنامج معرّفٌ يملكه المستدعي
-- أصلاً أو لا يفيده، والحكم بعدها لـ`fn_has_permission`.

create or replace function public.fn_track_program_id(p_track_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select program_id from public.tracks where id = p_track_id and deleted_at is null;
$$;

create or replace function public.fn_plan_program_id(p_plan_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select t.program_id
  from public.plans p
  join public.tracks t on t.id = p.track_id
  where p.id = p_plan_id and p.deleted_at is null and t.deleted_at is null;
$$;

create or replace function public.fn_day_template_program_id(p_template_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select program_id from public.day_templates where id = p_template_id and deleted_at is null;
$$;

comment on function public.fn_track_program_id(uuid) is
  'برنامج المسار — تعبر أمن الصفوف لتُستعمَل داخل السياسات بلا اقتران بسياسة أخرى.';
comment on function public.fn_plan_program_id(uuid) is
  'برنامج الخطة عبر مسارها. تُستعمَل في سياسات plan_days.';
comment on function public.fn_day_template_program_id(uuid) is
  'برنامج القالب. تُستعمَل في سياسات day_template_fields.';

revoke all on function public.fn_track_program_id(uuid) from public;
revoke all on function public.fn_plan_program_id(uuid) from public;
revoke all on function public.fn_day_template_program_id(uuid) from public;
grant execute on function public.fn_track_program_id(uuid) to authenticated;
grant execute on function public.fn_plan_program_id(uuid) to authenticated;
grant execute on function public.fn_day_template_program_id(uuid) to authenticated;

-- ══ إعادة كتابة السياسات المقترنة ══

drop policy plans_read   on public.plans;
drop policy plans_insert on public.plans;
drop policy plans_update on public.plans;

create policy plans_read on public.plans
  for select to authenticated
  using (public.fn_has_permission('programs.read', public.fn_track_program_id(track_id)));
create policy plans_insert on public.plans
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', public.fn_track_program_id(track_id)));
create policy plans_update on public.plans
  for update to authenticated
  using (public.fn_has_permission('programs.write', public.fn_track_program_id(track_id)))
  with check (public.fn_has_permission('programs.write', public.fn_track_program_id(track_id)));

drop policy plan_days_read   on public.plan_days;
drop policy plan_days_insert on public.plan_days;
drop policy plan_days_update on public.plan_days;

create policy plan_days_read on public.plan_days
  for select to authenticated
  using (public.fn_has_permission('programs.read', public.fn_plan_program_id(plan_id)));
create policy plan_days_insert on public.plan_days
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', public.fn_plan_program_id(plan_id)));
create policy plan_days_update on public.plan_days
  for update to authenticated
  using (public.fn_has_permission('programs.write', public.fn_plan_program_id(plan_id)))
  with check (public.fn_has_permission('programs.write', public.fn_plan_program_id(plan_id)));

-- نظائرها في الهجرة ٠١٣ — العلّة نفسها فالعلاج نفسه.
drop policy track_ranges_read   on public.track_content_ranges;
drop policy track_ranges_insert on public.track_content_ranges;
drop policy track_ranges_update on public.track_content_ranges;

create policy track_ranges_read on public.track_content_ranges
  for select to authenticated
  using (public.fn_has_permission('programs.read', public.fn_track_program_id(track_id)));
create policy track_ranges_insert on public.track_content_ranges
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', public.fn_track_program_id(track_id)));
create policy track_ranges_update on public.track_content_ranges
  for update to authenticated
  using (public.fn_has_permission('programs.write', public.fn_track_program_id(track_id)))
  with check (public.fn_has_permission('programs.write', public.fn_track_program_id(track_id)));

drop policy day_template_fields_read   on public.day_template_fields;
drop policy day_template_fields_insert on public.day_template_fields;
drop policy day_template_fields_update on public.day_template_fields;

create policy day_template_fields_read on public.day_template_fields
  for select to authenticated
  using (
    public.fn_has_permission('programs.read', public.fn_day_template_program_id(day_template_id))
  );
create policy day_template_fields_insert on public.day_template_fields
  for insert to authenticated
  with check (
    public.fn_has_permission('programs.write', public.fn_day_template_program_id(day_template_id))
  );
create policy day_template_fields_update on public.day_template_fields
  for update to authenticated
  using (
    public.fn_has_permission('programs.write', public.fn_day_template_program_id(day_template_id))
  )
  with check (
    public.fn_has_permission('programs.write', public.fn_day_template_program_id(day_template_id))
  );

-- ══ الفهرس المكرَّر ══
-- `idx_plan_days_plan` نسخة طبق الأصل من فهرس التفرّد. والإزاحة تُحدِّث كل
-- صفوف المدى مرّتين، فكل فهرس زائد يُضاعف كلفتها.
drop index if exists public.idx_plan_days_plan;

-- ══ دوالّ الترقيم — تُكتب من جديد ══
drop function if exists public.fn_plan_shift_days(uuid, int, int, int);
drop function if exists public.fn_plan_insert_day(uuid, int, public.day_type, uuid, numeric, uuid);
drop function if exists public.fn_plan_remove_day(uuid);
drop function if exists public.fn_plan_move_day(uuid, int);

/** أطول خطة مقبولة. سنة كاملة — وأطول من ذلك خطأُ لصقٍ لا خطة. */
create or replace function public.fn_plan_max_days()
returns int language sql immutable set search_path = '' as $$ select 366 $$;

/**
 * إدراج يوم في موضعه وإزاحة ما بعده.
 *
 * **القفل أولاً.** `for update` على صفّ الخطة يُسلسِل كل عمليات ترقيمها،
 * فلا يقرأ اثنان الترتيب نفسه ويكتبان فوقه. وهو أيضاً بوّابة الصلاحية: الدالة
 * `security invoker`، فسياسة `plans_update` تُصفّي الصفّ لمن لا يملك الكتابة
 * فيعود فارغاً — والدالة تُرجع `null` بدل أن تعمل بلا أثر.
 *
 * الإزاحة مدموجة هنا لا في دالة مستقلة: بدائيّةٌ مكشوفة تُنادى مباشرةً تفتح
 * فجوة، والاتصال يجب أن يُحفَظ بالبناء لا بانضباط المستدعي.
 */
create or replace function public.fn_plan_insert_day(
  p_plan_id           uuid,
  p_at_number         int,
  p_day_type          public.day_type,
  p_day_template_id   uuid    default null,
  p_amount_multiplier numeric default 1,
  p_exam_id           uuid    default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_locked uuid;
  v_count  int;
  v_at     int;
  v_offset int;
  v_id     uuid;
begin
  select id into v_locked from public.plans
  where id = p_plan_id and deleted_at is null for update;
  if v_locked is null then
    return null;
  end if;

  select count(*)::int into v_count
  from public.plan_days where plan_id = p_plan_id and deleted_at is null;

  if v_count >= public.fn_plan_max_days() then
    raise exception 'الخطة بلغت الحدّ الأقصى % يوماً', public.fn_plan_max_days()
      using errcode = '23514';
  end if;

  v_at := least(greatest(coalesce(p_at_number, v_count + 1), 1), v_count + 1);

  -- إزاحة ما بعد الموضع مرحلتين — فهرس التفرّد يُفحَص صفاً صفاً.
  select coalesce(max(day_number), 0) + 1000 into v_offset
  from public.plan_days where plan_id = p_plan_id and deleted_at is null;

  update public.plan_days set day_number = day_number + v_offset
  where plan_id = p_plan_id and deleted_at is null and day_number >= v_at;

  update public.plan_days set day_number = day_number - v_offset + 1
  where plan_id = p_plan_id and deleted_at is null and day_number > v_offset;

  insert into public.plan_days
    (plan_id, day_number, day_type, day_template_id, amount_multiplier, exam_id)
  values
    (p_plan_id, v_at, p_day_type, p_day_template_id, coalesce(p_amount_multiplier, 1), p_exam_id)
  returning id into v_id;

  return v_id;
end;
$$;

/** حذف يوم وسحب ما بعده. تُرجع عدد ما حُذف — صفرٌ رفضٌ لا نجاح صامت. */
create or replace function public.fn_plan_remove_day(p_plan_day_id uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_number  int;
  v_offset  int;
  v_done    int;
begin
  select plan_id into v_plan_id
  from public.plan_days where id = p_plan_day_id and deleted_at is null;
  if v_plan_id is null then
    return 0;
  end if;

  perform 1 from public.plans where id = v_plan_id and deleted_at is null for update;
  if not found then
    return 0;
  end if;

  -- **إعادة القراءة تحت القفل**: الرقم قد يكون تغيّر بين القراءة الأولى وأخذ
  -- القفل. الإزاحة بالرقم البائت تترك فجوة دائمة.
  select day_number into v_number
  from public.plan_days where id = p_plan_day_id and deleted_at is null;
  if v_number is null then
    return 0;
  end if;

  update public.plan_days set deleted_at = now()
  where id = p_plan_day_id and deleted_at is null;
  get diagnostics v_done = row_count;
  if v_done = 0 then
    return 0;
  end if;

  select coalesce(max(day_number), 0) + 1000 into v_offset
  from public.plan_days where plan_id = v_plan_id and deleted_at is null;

  update public.plan_days set day_number = day_number + v_offset
  where plan_id = v_plan_id and deleted_at is null and day_number > v_number;

  update public.plan_days set day_number = day_number - v_offset - 1
  where plan_id = v_plan_id and deleted_at is null and day_number > v_offset;

  return v_done;
end;
$$;

/** نقل يوم داخل خطته. تُرجع ١ إن نُقل و٠ إن لم يُنقل. */
create or replace function public.fn_plan_move_day(p_plan_day_id uuid, p_to_number int)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_from    int;
  v_to      int;
  v_last    int;
  v_park    int;
  v_offset  int;
  v_done    int;
begin
  select plan_id into v_plan_id
  from public.plan_days where id = p_plan_day_id and deleted_at is null;
  if v_plan_id is null then
    return 0;
  end if;

  perform 1 from public.plans where id = v_plan_id and deleted_at is null for update;
  if not found then
    return 0;
  end if;

  select day_number into v_from
  from public.plan_days where id = p_plan_day_id and deleted_at is null;
  if v_from is null then
    return 0;
  end if;

  select max(day_number) into v_last
  from public.plan_days where plan_id = v_plan_id and deleted_at is null;

  v_to := least(greatest(coalesce(p_to_number, v_from), 1), v_last);
  if v_to = v_from then
    return 0;
  end if;

  -- الركن أعلى من كل رقم حيّ فلا يدخل مدى الإزاحة.
  v_park := v_last + 1;
  update public.plan_days set day_number = v_park where id = p_plan_day_id;
  get diagnostics v_done = row_count;
  if v_done = 0 then
    return 0;
  end if;

  select coalesce(max(day_number), 0) + 1000 into v_offset
  from public.plan_days where plan_id = v_plan_id and deleted_at is null;

  if v_to > v_from then
    update public.plan_days set day_number = day_number + v_offset
    where plan_id = v_plan_id and deleted_at is null
      and day_number between v_from + 1 and v_to;

    update public.plan_days set day_number = day_number - v_offset - 1
    where plan_id = v_plan_id and deleted_at is null and day_number > v_offset;
  else
    update public.plan_days set day_number = day_number + v_offset
    where plan_id = v_plan_id and deleted_at is null
      and day_number between v_to and v_from - 1;

    update public.plan_days set day_number = day_number - v_offset + 1
    where plan_id = v_plan_id and deleted_at is null and day_number > v_offset;
  end if;

  update public.plan_days set day_number = v_to where id = p_plan_day_id;
  return 1;
end;
$$;

comment on function public.fn_plan_insert_day(uuid, int, public.day_type, uuid, numeric, uuid) is
  'إدراج يوم مع إزاحة ما بعده تحت قفل الخطة. فارغ = رُفض.';
comment on function public.fn_plan_remove_day(uuid) is
  'حذف ليّن مع سحب ما بعده تحت قفل الخطة. صفر = رُفض أو لا شيء ليُحذف.';
comment on function public.fn_plan_move_day(uuid, int) is
  'نقل يوم تحت قفل الخطة. صفر = رُفض أو لا حركة.';

revoke all on function public.fn_plan_max_days() from public;
revoke all on function public.fn_plan_insert_day(uuid, int, public.day_type, uuid, numeric, uuid) from public;
revoke all on function public.fn_plan_remove_day(uuid) from public;
revoke all on function public.fn_plan_move_day(uuid, int) from public;
grant execute on function public.fn_plan_max_days() to authenticated;
grant execute on function public.fn_plan_insert_day(uuid, int, public.day_type, uuid, numeric, uuid) to authenticated;
grant execute on function public.fn_plan_remove_day(uuid) to authenticated;
grant execute on function public.fn_plan_move_day(uuid, int) to authenticated;
