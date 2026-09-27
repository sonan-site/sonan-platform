-- 043 | حارس النشر يبني قائمة النواقص بنصوص مصرَّحة
--
-- `v_missing := v_missing || 'المسارات'` يقرأ الحرفَ الحرّ مصفوفةً لا نصّاً،
-- فيفشل بـ«malformed array literal» قبل أن يصل المستخدمَ سببُ المنع. كشفه
-- `lib/programs/publish-guard.db-test.ts` عند أول تشغيل.
--
-- تراجع: نعم.

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
  v_missing    text[] := array[]::text[];
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

  if v_tracks = 0 then v_missing := array_append(v_missing, 'المسارات'); end if;
  if v_units = 0 then v_missing := array_append(v_missing, 'المادة'); end if;
  if v_tracks > 0 and v_with_parts < v_tracks then
    v_missing := array_append(v_missing, 'نصيب كل مسار من المادة');
  end if;
  if v_fields = 0 then v_missing := array_append(v_missing, 'واجبات اليوم'); end if;
  if v_templates = 0 then v_missing := array_append(v_missing, 'شكل يوم بواجباته'); end if;
  if v_tracks > 0 and v_with_plan < v_tracks then
    v_missing := array_append(v_missing, 'خطة لكل مسار');
  end if;
  if v_blocks = 0 then v_missing := array_append(v_missing, 'الصفحة المعلنة'); end if;

  if cardinality(v_missing) > 0 then
    raise exception 'لا يُنشر البرنامج قبل: %', array_to_string(v_missing, ' · ')
      using errcode = '23514',
            hint = 'لوحة الجاهزية في صفحة البرنامج تقول أين يُصلَح كلٌّ منها.';
  end if;

  return new;
end;
$$;
