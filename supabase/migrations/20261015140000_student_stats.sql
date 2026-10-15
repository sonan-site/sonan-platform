-- 092 | إحصاءات الطالب لصفحة «إنجازي» (adr/0050 · خطة صفحتي الخطة وإنجازي ش٢)
--
-- دالةٌ واحدة **قراءةٌ فقط** بحارس fn_engine_access. تُحسب في القاعدة لا في الصفحة: حارس
-- `guard-structure` يمنع قراءة `field_counts` من الواجهة، وحدّ الألف صفّ يقطعها بصمت (المراجعة ح١).
--
-- التعريفات (قرارات الراعي، ١٥ أكتوبر · adr/0041):
--   streak       أيام برنامجٍ مُتمّة متتابعة حتى الآن، من أرشيف مساره وخطته. المتعثّر — ولو عُوِّض —
--                يقطعها، والمعفى لا يقطعها ولا يُعدّ. واليوم قبل الحكم عليه يُعدّ إن كان يوم برنامجٍ
--                أُتمّ فيه يومٌ في نافذته (بعد وقت رصد ما قبله).
--   on_time      أيام الخطة المُتمّة **قبل وقت نهاية رصد موعدها المقرَّر** — والمتقدّم في موعده.
--   reps         مجموع التكرار في **الأيام المُتمّة** وحدها، لخطة مساره الحالي ومساره.
--   stumbled_days · compensated_days  أيام التعثّر التقويمية بتصفية الأرشيف نفسها (مساره وخطته).
--
-- تراجع: نعم — حذف الدالة.

create function public.fn_my_stats(p_participant_id uuid)
returns table (streak int, on_time int, reps bigint, stumbled_days int, compensated_days int)
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
  v_streak int := 0;
  v_ontime int := 0;
  v_sched  date[];
  v_prev   date;
  r        record;
begin
  perform public.fn_engine_access(p_participant_id, false);
  select * into e from public.fn_participant_engine(p_participant_id);
  if e.plan_id is null then
    return query select 0, 0, 0::bigint, 0, 0;
    return;
  end if;
  select * into s from public.fn_engine_settings(e.program_id, e.track_id);
  v_done := public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, v_now);

  -- اليوم قبل الحكم عليه: يُعدّ إن كان يوم برنامجٍ أُتمّ فيه يومٌ في نافذته — ما بعد وقت رصد
  -- يوم البرنامج السابق (فما أُتمّ بعد وقت الأمس يتبع اليوم). ويوم الراحة لا يُعدّ (المراجعة م١).
  if extract(dow from v_today)::smallint = any (s.work_days) and not (v_today = any (s.exceptions))
     and not exists (
       select 1 from public.commitment_archive a
       where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
         and a.deleted_at is null and a.calendar_date = v_today
     ) then
    select max(g::date) into v_prev
    from generate_series(v_today - 14, v_today - 1, interval '1 day') g
    where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));
    if exists (
      select 1 from public.day_completions c
      where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
        and c.deleted_at is null and c.undone_at is null
        and c.completed_at <= v_now
        and c.completed_at > coalesce(public.fn_cut_at(e.program_id, e.track_id, v_prev), '-infinity'::timestamptz)
    ) then
      v_streak := 1;
    end if;
  end if;

  for r in
    select a.status from public.commitment_archive a
    where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
      and a.deleted_at is null and a.calendar_date <= v_today
    order by a.calendar_date desc
  loop
    exit when r.status = 'stumbled';
    if r.status = 'completed' then
      v_streak := v_streak + 1;
    end if;
  end loop;

  -- في موعدها: الإتمام قبل وقت نهاية رصد اليوم المقرَّر (المراجعة م٢). وما أُتمّ قبل لحظة البدء
  -- (base_done) في موعده.
  select coalesce(array_agg(g::date order by g), '{}') into v_sched
  from generate_series(e.start_date, greatest(e.start_date, v_today) + (e.day_count * 7 + 120), interval '1 day') g
  where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));
  select count(*)::int into v_ontime
  from public.day_completions c
  where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
    and c.deleted_at is null and c.undone_at is null and c.day_number <= v_done
    and (
      c.day_number <= e.base_done
      or c.completed_at <= public.fn_cut_at(e.program_id, e.track_id, v_sched[c.day_number - e.base_done])
    );

  return query
  select v_streak,
         v_ontime,
         coalesce((
           select sum(c.count) from public.field_counts c
           where c.participant_id = p_participant_id and c.plan_id = e.plan_id and c.track_id = e.track_id
             and c.deleted_at is null and c.day_number <= v_done
         ), 0)::bigint,
         (select count(*)::int from public.commitment_archive a
           where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
             and a.deleted_at is null and a.status = 'stumbled'),
         (select count(*)::int from public.commitment_archive a
           where a.participant_id = p_participant_id and a.track_id = e.track_id and a.plan_id = e.plan_id
             and a.deleted_at is null and a.status = 'stumbled' and a.compensated_at is not null);
end;
$$;

comment on function public.fn_my_stats(uuid) is
  'adr/0050 | إحصاءات «إنجازي»: الأيام المتتالية (المتعثّر يقطعها والمعفى لا) · المُتمّ قبل وقت رصد موعده · مجموع التكرار في الأيام المُتمّة · أيام التعثّر والمعوَّض منها. قراءةٌ فقط.';

revoke all on function public.fn_my_stats(uuid) from public;
grant execute on function public.fn_my_stats(uuid) to authenticated;
