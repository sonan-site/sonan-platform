-- 099 | قائمة المتأخرين للإدارة (خطة دليل المشارك · الدفعة ب · adr/0053)
--
-- لكل مشاركٍ يتبع الخطة ومتأخرٍ يوماً فأكثر: الاسم · الجوال · المسار · أيام التأخر · آخر يومٍ أنجز فيه
-- واجباً — مرتَّبةً تنازلياً بالتأخر. والتأخر = ما استحقّ من أيام الخطة (fn_due_days_at بـ pace_base)
-- ناقصاً ما أتمّه منها في خطته الحالية — الحساب نفسه الذي تعرضه قائمة المشاركين ورأس شاشة اليوم.
--
-- **الجوال لحامل قراءة مشاركي البرنامج** (قرار الراعي ٢٥ أكتوبر · adr/0053): سياسة profiles تحصره في
-- users.read العام، والدالة security definer تكشفه هنا وحدها لغرض الرصد.
--
-- p_at للاختبار بتواريخ صريحة (الافتراض الآن)، محصورٌ بين سنةٍ مضت وغدٍ — فلا يُطلب عدُّ أيامٍ بلا
-- نهاية (مراجعة ب ٢). وآخر إنجاز من كل المسارات والخطط عن قصد: «آخر ما أنجز» لا «آخر ما أنجز هنا».
--
-- تراجع: نعم — drop function.

create function public.fn_program_late(p_program_id uuid, p_at timestamptz default now())
returns table (
  id             uuid,
  full_name      text,
  phone          text,
  registration_no int,
  track_id       uuid,
  track_name     text,
  due_days       int,
  done_days      int,
  late_days      int,
  last_done_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := least(greatest(coalesce(p_at, now()), now() - interval '1 year'), now() + interval '1 day');
begin
  if not public.fn_has_permission('participants.read', p_program_id) then
    raise exception 'لا صلاحية لك على مشاركي هذا البرنامج' using errcode = '42501';
  end if;

  return query
  with roster as (
    select p.id, p.user_id, p.registration_no, p.track_id
    from public.participants p
    where p.program_id = p_program_id and p.deleted_at is null
      and p.track_id is not null and public.fn_follows_plan(p.status)
  ),
  eng as (
    select r.id, e.plan_id, e.track_id,
           case when e.plan_id is null then 0
                else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.pace_base, v_at)
           end as due
    from roster r
    cross join lateral public.fn_participant_engine(r.id) e
  ),
  done as (
    select c.participant_id,
           (count(*) filter (where c.plan_id = e.plan_id and c.track_id = e.track_id))::int as cur,
           max(c.completed_at) as last_at
    from public.day_completions c
    join eng e on e.id = c.participant_id
    where c.deleted_at is null and c.completed_at <= v_at and (c.undone_at is null or c.undone_at > v_at)
    group by c.participant_id
  )
  select r.id, pr.full_name, pr.phone, r.registration_no, r.track_id, t.name,
         e.due, coalesce(d.cur, 0), e.due - coalesce(d.cur, 0), d.last_at
  from roster r
  join eng e on e.id = r.id
  join public.tracks t on t.id = r.track_id
  left join public.profiles pr on pr.user_id = r.user_id
  left join done d on d.participant_id = r.id
  where e.due - coalesce(d.cur, 0) >= 1
  order by e.due - coalesce(d.cur, 0) desc, d.last_at nulls first, pr.full_name;
end;
$$;

revoke all on function public.fn_program_late(uuid, timestamptz) from public, anon;
grant execute on function public.fn_program_late(uuid, timestamptz) to authenticated;
comment on function public.fn_program_late(uuid, timestamptz) is
  'الهجرة ٠٩٩ | المتأخرون يوماً فأكثر بجوالهم ومسارهم وآخر إتمام — تنازلياً. لحامل participants.read في البرنامج (adr/0053).';
