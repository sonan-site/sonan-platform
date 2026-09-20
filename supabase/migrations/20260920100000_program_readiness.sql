-- 041 | جاهزية البرنامج صفٌّ واحد من القاعدة (adr/0029)
--
-- كانت تُجمع بستّة استعلامات في صفحة البرنامج وحدها، فلا تعرفها بقيّة شاشاته.
-- والمعالج يحتاجها في **كل** شاشة ليقول «الخطوة التالية» — فستّة استعلامات في
-- ست شاشات تصير ستّاً وثلاثين.
--
-- `security definer` لأن العدّ يمسّ جداول لكلٍّ سياستها، والشرط واحد:
-- `programs.read` على البرنامج. ومن لا يملكها لا يُرجَع له صفّ.
--
-- تراجع: نعم — حذف الدالة.

create or replace function public.fn_program_readiness(p_program_id uuid)
returns table (
  tracks                int,
  tracks_with_parts     int,
  content_units         int,
  task_fields           int,
  templates_with_fields int,
  tracks_with_plan_days int,
  public_blocks         int,
  participants          int,
  published             boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select p.id, p.status
    from public.programs p
    where p.id = p_program_id
      and p.deleted_at is null
      and public.fn_has_permission('programs.read', p.id)
  ),
  live_tracks as (
    select t.id from public.tracks t
    join scope on scope.id = t.program_id
    where t.deleted_at is null
  )
  select
    (select count(*) from live_tracks)::int,
    (select count(distinct r.track_id)
       from public.track_content_ranges r
       join live_tracks lt on lt.id = r.track_id
      where r.deleted_at is null)::int,
    (select count(*) from public.content_units u
       join scope on scope.id = u.program_id
      where u.deleted_at is null)::int,
    (select count(*) from public.task_fields f
       join scope on scope.id = f.program_id
      where f.deleted_at is null)::int,
    (select count(distinct f.day_template_id)
       from public.day_template_fields f
       join public.day_templates t on t.id = f.day_template_id and t.deleted_at is null
       join scope on scope.id = t.program_id
      where f.deleted_at is null)::int,
    -- الخطة بلا يومٍ حيّ لا تُعَدّ: المشارك لا يبدأ بها.
    (select count(distinct pl.track_id)
       from public.plans pl
       join live_tracks lt on lt.id = pl.track_id
      where pl.deleted_at is null
        and exists (
          select 1 from public.plan_days d
          where d.plan_id = pl.id and d.deleted_at is null
        ))::int,
    (select count(*) from public.page_blocks b
       join scope on scope.id = b.program_id
      where b.deleted_at is null)::int,
    (select count(*) from public.participants pa
       join scope on scope.id = pa.program_id
      where pa.deleted_at is null)::int,
    (select scope.status = 'published' from scope)
  from scope;
$$;

revoke all on function public.fn_program_readiness(uuid) from public;
grant execute on function public.fn_program_readiness(uuid) to authenticated;
