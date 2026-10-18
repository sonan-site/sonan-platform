-- 095 | الطالب يطّلع على أيامه القادمة — والرصد كما هو (قرار الراعي ١٨ أكتوبر ٢٠٢٦)
--
-- كانت fn_day_tasks لا تُرجع يوماً بعد يومه الحالي، فلا يتنقّل الطالب إلى ما بعده في شاشة اليوم.
-- القرار: يُفتح **العرض** حتى آخر يومٍ في الخطة، ويبقى **الرصد** بحكمه — fn_engine_require_day
-- ودوالّ الرصد لا تُمسّ. ولا كشف جديد: fn_my_plan (الهجرة ٠٩١) تُرجع واجب كل الأيام أصلاً.
-- التغيير الوحيد: شرط الحدّ الأعلى من v_cur إلى e.day_count.

create or replace function public.fn_day_tasks(p_participant_id uuid, p_day int default null)
returns table (
  day_number    int,
  task_field_id uuid,
  label         text,
  kind          public.field_kind,
  is_required   boolean,
  is_material_linked boolean,
  sort_order    int,
  count_unit    text,
  amount        int,
  ord_from      int,
  ord_to        int,
  value         numeric,
  repetition    int,
  count         int,
  marked_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e     record;
  v_day int;
  v_cur int;
begin
  perform public.fn_engine_access(p_participant_id, false);
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null then
    return;
  end if;
  v_cur := least(public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, now()) + 1, e.day_count);
  v_day := coalesce(p_day, v_cur);
  if v_day < 1 or v_day > e.day_count then
    return;
  end if;

  return query
  select v.day_number, f.id, f.label, f.kind, f.is_required, f.is_material_linked, f.sort_order, f.count_unit,
         v.amount,
         case
           when f.kind::text = 'ranged' then coalesce((
             select sum(b.amount)::int from public.plan_values b
             where b.plan_id = e.plan_id and b.task_field_id = f.id and b.deleted_at is null and b.day_number < v_day
           ), 0) + 1
           when f.kind::text = 'explicit' and f.is_material_linked then public.fn_track_ordinal_of(e.track_id, v.from_sequence)
           when f.kind::text = 'explicit' then v.from_sequence
         end,
         case
           when f.kind::text = 'ranged' then coalesce((
             select sum(b.amount)::int from public.plan_values b
             where b.plan_id = e.plan_id and b.task_field_id = f.id and b.deleted_at is null and b.day_number <= v_day
           ), 0)
           when f.kind::text = 'explicit' and f.is_material_linked then public.fn_track_ordinal_of(e.track_id, v.to_sequence)
           when f.kind::text = 'explicit' then v.to_sequence
         end,
         v.value, v.repetition,
         coalesce((
           select c.count from public.field_counts c
           where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
             and c.day_number = v_day and c.task_field_id = f.id and c.deleted_at is null
         ), 0),
         (select m.marked_at from public.field_marks m
           where m.participant_id = p_participant_id and m.plan_id = e.plan_id and m.track_id = e.track_id
             and m.day_number = v_day and m.task_field_id = f.id and m.undone_at is null and m.deleted_at is null)
  from public.plan_values v
  join public.task_fields f on f.id = v.task_field_id
  where v.plan_id = e.plan_id and v.day_number = v_day and v.deleted_at is null
  order by f.sort_order, f.label;
end;
$$;
