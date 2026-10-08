-- 075 | قائمة المشاركين تحمل رقم التسجيل (adr/0047)
--
-- `fn_program_participants` بتعريفها الحيّ نفسه، ويُضاف عمودٌ واحد. وتغيّر
-- توقيع `returns table` يوجب الحذف ثم الإنشاء، فتُعاد المنحة بعده.
--
-- تراجع: نعم — إعادة التعريف من الهجرة ٠٦٨ (review_fixes_rewire).

drop function public.fn_program_participants(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.fn_program_participants(p_program_id uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, full_name text, registration_no integer, track_id uuid, status participant_status, joined_at timestamp with time zone, baseline_percentage numeric, day_count integer, done_days integer, due_days integer, stumbled_days integer, compensated_days integer, prior_done_days integer, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id      uuid;
  v_started timestamptz := clock_timestamp();
begin
  if not public.fn_has_permission('participants.read', p_program_id) then
    return;
  end if;

  for v_id in
    select pa.id
    from public.participants pa
    left join lateral (
      select max(a.calendar_date) as last from public.commitment_archive a
      where a.participant_id = pa.id and a.deleted_at is null
    ) l on true
    where pa.program_id = p_program_id and pa.deleted_at is null
      and pa.track_id is not null and public.fn_follows_plan(pa.status)
    order by l.last nulls first, pa.id
  loop
    perform public.fn_settle_commitment_at(v_id, now());
    exit when clock_timestamp() - v_started > interval '2 seconds';
  end loop;

  return query
  with roster as (
    select p.id, p.user_id, p.registration_no, p.track_id, p.status, p.joined_at, p.baseline_percentage
    from public.participants p
    where p.program_id = p_program_id and p.deleted_at is null
  ),
  eng as (
    select r.id, e.program_id, e.track_id, e.plan_id, e.day_count, e.start_date,
           case when e.plan_id is null then 0
                else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.base_done, now())
           end as due
    from roster r
    cross join lateral public.fn_participant_engine(r.id) e
  ),
  done as (
    select c.participant_id,
           (count(*) filter (where c.plan_id = e.plan_id and c.track_id = e.track_id))::int as cur,
           (count(*) filter (where c.track_id is distinct from e.track_id))::int as prior
    from public.day_completions c
    join eng e on e.id = c.participant_id
    where c.deleted_at is null and c.undone_at is null
    group by c.participant_id
  ),
  stumbles as (
    select a.participant_id,
           (count(*) filter (where a.status = 'stumbled'))::int as n,
           (count(*) filter (where a.status = 'stumbled' and a.compensated_at is not null))::int as comp
    from public.commitment_archive a
    join eng e on e.id = a.participant_id and a.track_id = e.track_id
    where a.deleted_at is null
    group by a.participant_id
  )
  select
    r.id,
    pr.full_name,
    r.registration_no,
    r.track_id,
    r.status,
    r.joined_at,
    r.baseline_percentage,
    coalesce(e.day_count, 0),
    coalesce(d.cur, 0),
    coalesce(e.due, 0),
    coalesce(s.n, 0),
    coalesce(s.comp, 0),
    coalesce(d.prior, 0),
    count(*) over ()
  from roster r
  left join public.profiles pr on pr.user_id = r.user_id
  left join eng e on e.id = r.id
  left join done d on d.participant_id = r.id
  left join stumbles s on s.participant_id = r.id
  order by r.joined_at desc, r.id
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
end;
$function$;

revoke all on function public.fn_program_participants(uuid, integer, integer) from public;
grant execute on function public.fn_program_participants(uuid, integer, integer) to authenticated;
