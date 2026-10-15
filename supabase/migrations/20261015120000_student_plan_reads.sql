-- 091 | قراءات الطالب لصفحة «الخطة» (adr/0050 · خطة صفحتي الخطة وإنجازي ش١)
--
-- ثلاث دوالّ **قراءةٍ فقط** — لا تكتب ولا تسوّي ولا تغيّر سلوكاً قائماً:
--   fn_my_plan        كل أيام خطة مساره: واجبُ كل يوم، وموعده المقرَّر، وتاريخه المتوقَّع، ويوم إتمامه، وتعثّره.
--   fn_my_calendar    أيام البرنامج والراحة ووقت نهاية الرصد لنطاقٍ قصير (خريطة الالتزام · شريط الأسبوع).
--   fn_my_milestones  الاختبارات المحدَّدة بتاريخ: عن بعدٍ بموعد فتحه، وشفهيٌّ بموعد جلسته متى أُسند.
--
-- **لماذا دوالّ لا سياسات:** `plan_values` بلا قراءةٍ للمشارك، وقارئات التقويم سُحبت من
-- `authenticated` لأنها تقرأ إعدادات أي برنامج بمعرّفه (BR-ISO-01، الهجرة ٠٥٩). والحارس هنا
-- `fn_engine_access`: صاحب المشاركة، أو من يقرأ المشاركين في برنامجها.
--
-- **التكافؤ:** المدى في fn_my_plan بالمنطق نفسه الذي في fn_day_tasks (الهجرة ٠٨٠): المجموع
-- التراكمي لمقادير الحقل المتدرّج حيّةً، والصريح المرتبط بالمادة برتبته في نصيب المسار.
-- واختبار القاعدة يقارنهما لكل يومٍ من خطةٍ مُتمّة.
--
-- تراجع: نعم — حذف الدوالّ الثلاث.

-- ══ ١ · الخطة كاملة ══

create function public.fn_my_plan(p_participant_id uuid)
returns table (
  day_number     int,
  scheduled_date date,
  expected_date  date,
  completed_on   date,
  stumbled       boolean,
  compensated    boolean,
  tasks          jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e        record;
  s        record;
  v_now    timestamptz := now();
  v_today  date := public.fn_local_now()::date;
  v_done   int;
  v_slot   date;
  v_sched  date[];
  v_exp    date[];
  v_until  date;
begin
  perform public.fn_engine_access(p_participant_id, false);
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null or coalesce(e.day_count, 0) = 0 then
    return;
  end if;
  select * into s from public.fn_engine_settings(e.program_id, e.track_id);
  v_done := public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, v_now);

  -- أيام البرنامج: يومُ عملٍ أسبوعي ليس يومَ توقّف. والإعدادات تُقرأ مرّة لا لكل يوم.
  -- والمدى يكفي أطول خطة (٣٦٦ يوماً) بيوم عملٍ واحد في الأسبوع، وما بعده من توقّف.
  v_until := greatest(e.start_date, v_today) + (e.day_count * 7 + 120);
  select coalesce(array_agg(g::date order by g), '{}') into v_sched
  from generate_series(e.start_date, v_until, interval '1 day') g
  where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));

  -- أول موعدٍ متوقَّع لما بقي: قبل البداية يومُها الأول؛ واليوم إن كان يوم برنامجٍ لم يمضِ
  -- وقته ولم يُتمّ فيه يوماً — أو أتمّ وفتح التالي بنفسه فهو فيه الآن؛ وإلا يوم البرنامج التالي.
  if v_today < e.start_date then
    v_slot := e.start_date;
  elsif v_today = any (v_sched)
        and v_now < public.fn_cut_at(e.program_id, e.track_id, v_today)
        and (not exists (
          select 1 from public.day_completions c
          where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
            and c.deleted_at is null and c.undone_at is null
            and public.fn_local_now(c.completed_at)::date = v_today
        ) or exists (
          select 1 from public.day_openings o
          where o.participant_id = p_participant_id and o.plan_id = e.plan_id and o.track_id = e.track_id
            and o.day_number = v_done + 1 and o.deleted_at is null
            and public.fn_local_now(o.opened_at)::date = v_today
        )) then
    v_slot := v_today;
  else
    v_slot := v_today + 1;
  end if;
  select coalesce(array_agg(d order by d), '{}') into v_exp from unnest(v_sched) d where d >= v_slot;

  return query
  with segs as (
    -- مقاطع نصيب المسار مرّةً — برتبها كما في fn_track_ordinal_of، لا استدعاءٌ لكل صفّ (المراجعة م٤).
    select r.from_sequence, r.to_sequence,
           coalesce(sum(r.to_sequence - r.from_sequence + 1) over (
             order by r.sort_order, r.from_sequence rows between unbounded preceding and 1 preceding
           ), 0) as preceding_units
    from public.track_content_ranges r
    where r.track_id = e.track_id and r.deleted_at is null
  ),
  vals as (
    select v.day_number, v.task_field_id, v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition,
           f.label, f.kind, f.is_required, f.is_material_linked, f.sort_order, f.count_unit,
           sum(v.amount) over (
             partition by v.task_field_id order by v.day_number
             rows between unbounded preceding and current row
           ) as cum
    from public.plan_values v
    join public.task_fields f on f.id = v.task_field_id
    where v.plan_id = e.plan_id and v.deleted_at is null
  ),
  days as (
    select vals.day_number,
           jsonb_agg(jsonb_build_object(
             'field_id', vals.task_field_id,
             'label', vals.label,
             'kind', vals.kind,
             'is_required', vals.is_required,
             'is_material_linked', vals.is_material_linked,
             'count_unit', vals.count_unit,
             'amount', vals.amount,
             'ord_from', case
               when vals.kind::text = 'ranged' then (vals.cum - vals.amount + 1)::int
               when vals.kind::text = 'explicit' and vals.is_material_linked then (
               select (sg.preceding_units + (vals.from_sequence - sg.from_sequence + 1))::int
               from segs sg where vals.from_sequence between sg.from_sequence and sg.to_sequence limit 1)
               when vals.kind::text = 'explicit' then vals.from_sequence
             end,
             'ord_to', case
               when vals.kind::text = 'ranged' then vals.cum::int
               when vals.kind::text = 'explicit' and vals.is_material_linked then (
               select (sg.preceding_units + (vals.to_sequence - sg.from_sequence + 1))::int
               from segs sg where vals.to_sequence between sg.from_sequence and sg.to_sequence limit 1)
               when vals.kind::text = 'explicit' then vals.to_sequence
             end,
             'value', vals.value,
             'repetition', vals.repetition
           ) order by vals.sort_order, vals.label) as tasks
    from vals
    group by vals.day_number
  ),
  done as (
    select c.day_number, min(public.fn_local_now(c.completed_at)::date) as on_date
    from public.day_completions c
    where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
      and c.deleted_at is null and c.undone_at is null
    group by c.day_number
  ),
  slips as (
    -- المتعثَّر عليه: يومُ خطةٍ له صفُّ تعثّرٍ في أرشيف مساره **وخطته** (adr/0041).
    select a.plan_day,
           bool_and(a.compensated_at is not null) as all_comp
    from public.commitment_archive a
    where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
      and a.deleted_at is null and a.status = 'stumbled' and a.plan_day is not null
    group by a.plan_day
  )
  select g.n::int,
         case when g.n > e.base_done then v_sched[g.n - e.base_done] end,
         case when g.n > v_done then v_exp[g.n - v_done] end,
         case when g.n <= v_done then done.on_date end,
         slips.plan_day is not null,
         coalesce(slips.all_comp, false),
         coalesce(days.tasks, '[]'::jsonb)
  from generate_series(1, e.day_count) g(n)
  left join days on days.day_number = g.n
  left join done on done.day_number = g.n
  left join slips on slips.plan_day = g.n
  order by g.n;
end;
$$;

comment on function public.fn_my_plan(uuid) is
  'adr/0050 | كل أيام خطة المشارك للعرض: الواجب بالمدى التراكمي (تكافؤ fn_day_tasks)، والموعد المقرَّر، والتاريخ المتوقَّع لما بقي، ويوم الإتمام، والتعثّر. قراءةٌ فقط — الرصد لا يتجاوز يومه.';

-- ══ ٢ · التقويم لنطاقٍ قصير ══

create function public.fn_my_calendar(p_participant_id uuid, p_from date, p_to date)
returns table (calendar_date date, is_program_day boolean, deadline time)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
  s record;
begin
  perform public.fn_engine_access(p_participant_id, false);
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'نطاق التقويم غير صالح' using errcode = '22023';
  end if;
  if p_to - p_from > 62 then
    raise exception 'نطاق التقويم أطول من ٦٣ يوماً' using errcode = '22023';
  end if;
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.program_id is null or e.track_id is null then
    return;
  end if;
  select * into s from public.fn_engine_settings(e.program_id, e.track_id);

  return query
  select g::date,
         extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions)),
         public.fn_deadline_at(e.program_id, e.track_id, g::date)
  from generate_series(p_from, p_to, interval '1 day') g
  order by g;
end;
$$;

comment on function public.fn_my_calendar(uuid, date, date) is
  'adr/0050 | أيام البرنامج والراحة ووقت نهاية الرصد لمسار المشارك — نطاقٌ حتى ٦٣ يوماً. غلافٌ محروس لقارئاتٍ داخلية (BR-ISO-01).';

-- ══ ٣ · محطات الاختبار ══

create function public.fn_my_milestones(p_participant_id uuid)
returns table (exam_id uuid, name text, stage public.exam_stage, exam_type public.exam_type, at timestamptz, location text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pa record;
begin
  perform public.fn_engine_access(p_participant_id, false);
  select p.id, p.program_id, p.track_id into pa
  from public.participants p where p.id = p_participant_id and p.deleted_at is null;

  -- قرار الراعي (١٥ أكتوبر): كل اختبارٍ محدَّدٍ بتاريخ يظهر — اسمه ومرحلته ونوعه وموعده ومكان جلسته،
  -- بلا بوابةٍ ولا محاولات (فذلك fn_my_exams بحدّ أسبوعه). وما لا تاريخ له لا يظهر.
  return query
    select x.exam_id, x.name, x.stage, x.exam_type, x.at, x.location
    from (
      select ex.id as exam_id, ex.name, ex.stage, ex.exam_type, ex.opens_at as at, ''::text as location
      from public.exams ex
      where ex.program_id = pa.program_id and ex.deleted_at is null and ex.exam_type = 'remote'
        and (ex.track_id is null or ex.track_id = pa.track_id)
        and ex.opens_at is not null
      union all
      select ex.id, ex.name, ex.stage, ex.exam_type, se.scheduled_at, se.location
      from public.session_participants sp
      join public.exam_sessions se on se.id = sp.session_id and se.deleted_at is null
      join public.exams ex on ex.id = se.exam_id and ex.deleted_at is null and ex.program_id = pa.program_id
      where sp.participant_id = pa.id and sp.deleted_at is null
    ) x
    order by x.at;
end;
$$;

comment on function public.fn_my_milestones(uuid) is
  'adr/0050 | الاختبارات المحدَّدة بتاريخ لمسار المشارك: عن بعدٍ بموعد فتحه، وشفهيٌّ بموعد جلسته المسندة ومكانها. بلا بوابةٍ ولا محاولات.';

revoke all on function public.fn_my_plan(uuid) from public;
revoke all on function public.fn_my_calendar(uuid, date, date) from public;
revoke all on function public.fn_my_milestones(uuid) from public;
grant execute on function public.fn_my_plan(uuid) to authenticated;
grant execute on function public.fn_my_calendar(uuid, date, date) to authenticated;
grant execute on function public.fn_my_milestones(uuid) to authenticated;
