-- 097 | «من بداية البرنامج» للالتحاق الأول وحده (adr/0052 · قرار الراعي ٢٠ أكتوبر ٢٠٢٦)
--
-- من أوقفته الإدارة ثم أعادته إلى حالةٍ تتبع الخطة، ومن نُقل بين المسارات، تتجدّد لحظة الحكم عليه
-- (judge_from). فيُحسب موعده من لحظته المتجدّدة بما أتمّه — كالسلوك القائم — لا من بداية البرنامج:
-- مدة التوقّف لا تُحسب تأخراً، والمنقول لا يُكتب متعثّراً على مسارٍ لم يكن فيه (حتى يُبنى حمل التقدّم).
-- والتجدّد = judge_from بعد joined_at (يُضبطان معاً عند الالتحاق).
--
-- تراجع: نعم — بإعادة تعريف الهجرة ٠٩٦.

CREATE OR REPLACE FUNCTION public.fn_participant_engine(p_participant_id uuid, OUT program_id uuid, OUT track_id uuid, OUT plan_id uuid, OUT day_count integer, OUT start_date date, OUT daily_limit integer, OUT credit boolean, OUT compensation boolean, OUT measure progress_measure, OUT base_done integer, OUT judge_start date, OUT pace_base integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_judge  timestamptz;
  v_plan   timestamptz;
  v_moment timestamptz;
  v_first  date;
  v_due    text;
  v_set    date;
  v_joined timestamptz;
begin
  select pa.program_id, pa.track_id, pa.judge_from, pa.joined_at into program_id, track_id, v_judge, v_joined
  from public.participants pa
  where pa.id = p_participant_id and pa.deleted_at is null;
  if track_id is null then
    return;
  end if;
  plan_id := public.fn_track_plan(track_id);
  select p.day_count, coalesce((select min(v.created_at) from public.plan_versions v where v.plan_id = p.id), p.created_at)
  into day_count, v_plan
  from public.plans p where p.id = plan_id;
  select s.start_date, s.daily_limit, s.credit_enabled, s.compensation_enabled, s.progress_measure, s.due_from
  into start_date, daily_limit, credit, compensation, measure, v_due
  from public.fn_engine_settings(program_id, track_id) s;

  v_moment := greatest(v_judge, v_plan);
  v_first := public.fn_local_now(v_moment)::date;
  if v_moment >= public.fn_cut_at(program_id, track_id, v_first) then
    v_first := v_first + 1;
  end if;
  v_set := start_date;
  -- بداية الحكم: يومه الأول ولا يومَ قبل البداية — لا يُكتب يومٌ قبل التحاقه أو نقله في الأرشيف.
  judge_start := greatest(coalesce(v_set, v_first), v_first);
  base_done := case when plan_id is null then 0
                    else public.fn_done_days_at(p_participant_id, plan_id, track_id, v_moment) end;
  -- بداية الموعد: من بداية البرنامج للجميع إن ضُبط ذلك (الهجرة ٠٩٦) — والعدّ من البداية يشمل ما
  -- أتمّه قبل التحاقه بالمسار، فلا يُضاف base_done فوقه (مراجعة الخطة ح١). وإلا فمن يومه الأول.
  -- للالتحاق الأول وحده (قرار الراعي ٢٠ أكتوبر): لحظة الحكم تتجدّد عند العودة إلى حالةٍ تتبع الخطة
  -- وعند النقل (fn_participant_judge_from)، فمن تجدّدت لحظته يُحسب منها بما أتمّه — مدة التوقّف لا
  -- تُحسب تأخراً، والمنقول لا يُكتب متعثّراً على مسارٍ لم يكن فيه.
  if v_due = 'program_start' and v_set is not null and v_judge <= coalesce(v_joined, v_judge) then
    -- ولا يُطالَب بيومٍ قبل أن تكون لمساره خطة (مراجعة ش١ ٢): الأبعد من البداية وأول حفظٍ للخطة.
    start_date := greatest(v_set, public.fn_local_now(v_plan)::date);
    pace_base := 0;
  else
    start_date := judge_start;
    pace_base := base_done;
  end if;
end;
$function$;
