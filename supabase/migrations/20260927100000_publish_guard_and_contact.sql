-- 042 | النشر لا يقع قبل الجاهزية، وللبرنامج جهة تواصل (adr/0029 · adr/0030)
--
-- ١ · **النشر كان بلا شرط ولا خبر:** زرٌّ ينشر البرنامج الفارغ، ونجاحه صامت.
--     ولوحة الجاهزية «وصفٌ لا قيد» فلا تمنع شيئاً. فالمنع هنا — في القاعدة —
--     لأن ما يُفرض في التطبيق وحده غير مفروض (`platform.md §٧`).
--
-- ٢ · **«تواصل مع إدارة البرنامج» بلا وسيلة:** ستّ حالات في رحلة المشارك
--     تقولها (بلا مسار · لا خطة · الخطة بلا أيام · لا واجب · انتهت رحلتك ·
--     لا مادة)، وليس في المنصة موضعٌ لجهة التواصل أصلاً.
--
-- تراجع: نعم — حذف العمود والمشغّل والدالة.

-- ══ ١ · جهة التواصل ══
alter table public.programs add column contact text not null default '';

comment on column public.programs.contact is
  'كيف يصل المشارك إلى إدارة البرنامج: بريد أو رقم أو رابط. يظهر له حين يعترضه ما لا يحلّه بنفسه.';

alter table public.programs
  add constraint chk_programs_contact check (char_length(contact) <= 200);

-- ══ ٢ · حارس النشر ══
/**
 * الانتقال إلى «منشور» يُرفض ما لم تكتمل الأساسيات، **والرسالة تسمّي الناقص**.
 *
 * العدّ هنا لا بـ`fn_program_readiness`: تلك تشترط `programs.read` وتصلح
 * للعرض، وهذا حارسٌ يعمل لأي كاتب — ومنه المشغّل الداخلي والبذرة.
 * والعودة إلى مسوّدة والإغلاق بلا شرط: التراجع لا يُحرَس.
 */
create or replace function public.fn_guard_program_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracks     int;
  v_with_parts int;
  v_with_plan  int;
  v_units      int;
  v_fields     int;
  v_templates  int;
  v_blocks     int;
  v_missing    text[] := '{}';
begin
  if new.status is not distinct from old.status or new.status <> 'published' then
    return new;
  end if;

  select count(*) into v_tracks
  from public.tracks t where t.program_id = new.id and t.deleted_at is null;

  select count(distinct r.track_id) into v_with_parts
  from public.track_content_ranges r
  join public.tracks t on t.id = r.track_id and t.deleted_at is null
  where t.program_id = new.id and r.deleted_at is null;

  select count(distinct pl.track_id) into v_with_plan
  from public.plans pl
  join public.tracks t on t.id = pl.track_id and t.deleted_at is null
  where t.program_id = new.id
    and pl.deleted_at is null
    and exists (select 1 from public.plan_days d where d.plan_id = pl.id and d.deleted_at is null);

  select count(*) into v_units
  from public.content_units u where u.program_id = new.id and u.deleted_at is null;

  select count(*) into v_fields
  from public.task_fields f where f.program_id = new.id and f.deleted_at is null;

  select count(distinct f.day_template_id) into v_templates
  from public.day_template_fields f
  join public.day_templates t on t.id = f.day_template_id and t.deleted_at is null
  where t.program_id = new.id and f.deleted_at is null;

  select count(*) into v_blocks
  from public.page_blocks b where b.program_id = new.id and b.deleted_at is null;

  if v_tracks = 0 then v_missing := v_missing || 'المسارات'; end if;
  if v_units = 0 then v_missing := v_missing || 'المادة'; end if;
  if v_tracks > 0 and v_with_parts < v_tracks then v_missing := v_missing || 'نصيب كل مسار من المادة'; end if;
  if v_fields = 0 then v_missing := v_missing || 'واجبات اليوم'; end if;
  if v_templates = 0 then v_missing := v_missing || 'شكل يوم بواجباته'; end if;
  if v_tracks > 0 and v_with_plan < v_tracks then v_missing := v_missing || 'خطة لكل مسار'; end if;
  if v_blocks = 0 then v_missing := v_missing || 'الصفحة المعلنة'; end if;

  if cardinality(v_missing) > 0 then
    raise exception 'لا يُنشر البرنامج قبل: %', array_to_string(v_missing, ' · ')
      using errcode = '23514',
            hint = 'لوحة الجاهزية في صفحة البرنامج تقول أين يُصلَح كلٌّ منها.';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_guard_program_publish() from public;

create trigger trg_programs_publish_guard
  before update of status on public.programs
  for each row execute function public.fn_guard_program_publish();
