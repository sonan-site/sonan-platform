-- 033 | المُعِدّ يصحّح أخطاءه — والحدّ في القاعدة
--
-- الشاشات كانت تُضيف ولا تُعدّل ولا تحذف: خطأٌ مطبعي في واجب، أو شكل يومٍ
-- زائد، يبقى إلى الأبد إلا بتدخّل في القاعدة. والتعديل يُفتح الآن — **وكل ما
-- يُتلف عمل مشاركين أو يُفسد أياماً قائمة يُمنع هنا** برسالة بلغة المُعِدّ،
-- على نمط `fn_guard_track_ranges_frozen`. فالشاشة تُخفي ما لا يجوز، والقاعدة
-- ترفضه ولو وصلها طلبٌ مباشر.
--
-- **لا جدول جديد** ولا سياسات جديدة: سياسات التحديث بـ`programs.write` قائمة،
-- والحذف ليّن (`deleted_at`) فيمرّ بها.
--
-- تراجع: نعم.

-- ══ ١ · وحدة المادة ══
/**
 * الوحدة داخل نصيب مسار لا تُحذف ولا يتغيّر رقمها.
 *
 * الرتبة تُحسب من أرقام النصيب لا من وجود الوحدات، فحذفها لا يُزيح أحداً —
 * لكنه يترك في واجب المشارك رقماً بلا نصّ. وتغيير رقمها يُخرجها من نصيبها
 * بصمت. فالمُعِدّ يُخرجها من النصيب أولاً (ما دام مسموحاً)، ثم يحذفها.
 * وتعديل النصّ مفتوح دائماً: تصحيح خطأ لا يغيّر ما حُفظ.
 */
create or replace function public.fn_guard_content_unit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.deleted_at is not null and old.deleted_at is null)
     or new.sequence is distinct from old.sequence then
    if exists (
      select 1
      from public.track_content_ranges r
      join public.tracks t on t.id = r.track_id and t.deleted_at is null
      where t.program_id = old.program_id
        and r.deleted_at is null
        and old.sequence between r.from_sequence and r.to_sequence
    ) then
      raise exception 'هذه الوحدة داخل نصيب مسار. أخرجها من نصيب المسار أولاً'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_content_units_change
  before update of deleted_at, sequence on public.content_units
  for each row execute function public.fn_guard_content_unit_change();

-- ══ ٢ · الواجب ══
/**
 * نوع الواجب لا يتغيّر بعد أن يُرسَل عليه: «من… إلى…» يحمل سلسلةً، والعددي لا
 * يحملها، والتحويل بينهما يقطعها. والحذف يُمنع ما دام في شكل يوم، أو له إرسال.
 * والاسم مفتوح.
 */
create or replace function public.fn_guard_task_field_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submitted boolean := exists (
    select 1 from public.achievements
    where task_field_id = old.id and deleted_at is null
  );
begin
  if new.kind is distinct from old.kind and v_submitted then
    raise exception 'أرسل مشاركون على هذا الواجب، فنوعه لا يُغيَّر'
      using errcode = '23514';
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1
      from public.day_template_fields f
      join public.day_templates d on d.id = f.day_template_id and d.deleted_at is null
      where f.task_field_id = old.id and f.deleted_at is null
    ) then
      raise exception 'هذا الواجب مستعمَل في شكل يوم. أزِله منه أولاً'
        using errcode = '23514';
    end if;
    if v_submitted then
      raise exception 'أرسل مشاركون على هذا الواجب، فلا يُحذف'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_task_fields_change
  before update of kind, deleted_at on public.task_fields
  for each row execute function public.fn_guard_task_field_change();

-- ══ ٣ · شكل اليوم ══
create or replace function public.fn_guard_day_template_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and exists (
    select 1
    from public.plan_days pd
    join public.plans p on p.id = pd.plan_id and p.deleted_at is null
    where pd.day_template_id = old.id and pd.deleted_at is null
  ) then
    raise exception 'شكل اليوم مستعمَل في خطة. غيّر أيامها إلى شكل آخر أولاً'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_day_templates_delete
  before update of deleted_at on public.day_templates
  for each row execute function public.fn_guard_day_template_delete();

-- ══ ٤ · واجبٌ داخل شكل اليوم ══
/**
 * آخر واجب في شكلٍ مستعمَل في خطة لا يُزال: بدونه تصير أيامها بلا عمل،
 * فتُتخطّى كالراحة ويختلّ عدّ أيام الخطة. والمقدار والترتيب مفتوحان: أثرهما
 * على الأيام التي لم تُرسَل وحدها (`BR-GEN-02`).
 */
create or replace function public.fn_guard_template_field_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and not exists (
       select 1 from public.day_template_fields
       where day_template_id = old.day_template_id
         and deleted_at is null
         and id <> old.id
     )
     and exists (
       select 1
       from public.plan_days pd
       join public.plans p on p.id = pd.plan_id and p.deleted_at is null
       where pd.day_template_id = old.day_template_id and pd.deleted_at is null
     ) then
    raise exception 'هذا آخر واجب في شكل يومٍ مستعمَل في خطة، وبدونه تصير أيامها بلا واجب'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_day_template_fields_delete
  before update of deleted_at on public.day_template_fields
  for each row execute function public.fn_guard_template_field_delete();

-- ══ ٥ · رابط البرنامج ══
/**
 * الرابط لا يتغيّر بعد نشره: من حفظه أو شاركه يصل إلى صفحة غير موجودة.
 * وقبل النشر حرّ — لم يره أحد.
 */
create or replace function public.fn_guard_program_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug and old.status <> 'draft' then
    raise exception 'رابط البرنامج لا يتغيّر بعد نشره — من حفظه يصل إلى صفحة غير موجودة'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_programs_slug
  before update of slug on public.programs
  for each row execute function public.fn_guard_program_slug();

revoke all on function public.fn_guard_content_unit_change() from public;
revoke all on function public.fn_guard_task_field_change() from public;
revoke all on function public.fn_guard_day_template_delete() from public;
revoke all on function public.fn_guard_template_field_delete() from public;
revoke all on function public.fn_guard_program_slug() from public;
