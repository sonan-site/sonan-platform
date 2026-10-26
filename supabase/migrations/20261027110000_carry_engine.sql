-- حمل التقدّم عند النقل (ش٢) — ٢/٣: المحرّك.
--
-- الأيام المحتسبة تُشتقّ عند القراءة من الوحدات المحمولة: أكبر يومٍ في خطة الجديد لا يتجاوز
-- تراكمُ حفظه `credited_units` (D) — فتعديل الخطة لا يفسد معناها، والكسر دون يومٍ لا يُحتسب
-- (قرار الراعي). والعائد إلى مسارٍ سبق له: `greatest(D, M) − L` حيث L إتماماته الحيّة فيه قبل
-- النقل وM أكبر أيامها — فلا يُحسب شيءٌ مرتين ولا يصطدم رقم يومٍ بإتمامٍ قائم.
-- وتدخل في `fn_done_days_at` نفسها مقيّدةً بلحظة النقل، فيرثها المحرّك كله.

-- رقّاعٌ محليّ: يبدّل موضعاً فريداً في تعريف دالةٍ قائمة ويعيد إنشاءها كما هي فيما عداه.
create or replace function pg_temp.patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  -- بعض الدوالّ أُنشئت من ملفٍّ بنهايات CRLF: تُوحَّد قبل المطابقة.
  v_def text := replace(pg_get_functiondef(p_fn), chr(13) || chr(10), chr(10));
begin
  if (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: موضع التبديل غير فريد أو مفقود', p_fn;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- ══ الأيام التي تغطيها وحدات ══
create or replace function public.fn_credit_span(p_plan_id uuid, p_units int)
returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days    int;
  v_program uuid;
  v_base    uuid;
begin
  if coalesce(p_units, 0) <= 0 then
    return 0;
  end if;
  select p.day_count, p.program_id into v_days, v_program from public.plans p where p.id = p_plan_id;
  select f.id into v_base from public.task_fields f
  where f.program_id = v_program and f.is_base and f.deleted_at is null;
  if coalesce(v_days, 0) = 0 or v_base is null then
    return 0;
  end if;
  return coalesce((
    select max(x.n) from (
      select g.n, sum(coalesce(v.amount, 0)) over (order by g.n) as cum
      from generate_series(1, v_days) g(n)
      left join public.plan_values v
        on v.plan_id = p_plan_id and v.task_field_id = v_base and v.deleted_at is null and v.day_number = g.n
    ) x
    where x.cum <= p_units
  ), 0)::int;
end;
$$;
comment on function public.fn_credit_span(uuid, int) is
  'أكبر يومٍ في الخطة لا يتجاوز تراكمُ مقادير الحقل الأساس فيه الوحدات المعطاة — داخلية.';
revoke all on function public.fn_credit_span(uuid, int) from public, anon, authenticated;

-- ══ الأيام المحتسبة عند لحظة ══
create or replace function public.fn_credited_days_at(p_participant_id uuid, p_plan_id uuid, p_track_id uuid, p_at timestamptz)
returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_units int;
  v_at    timestamptz;
  v_track uuid;
  v_span  int;
  v_live  int;
  v_max   int;
begin
  select pa.credited_units, pa.credited_at, pa.track_id into v_units, v_at, v_track
  from public.participants pa where pa.id = p_participant_id;
  -- المحتسب لمساره الحالي ومن لحظة نقله: ما قبلها حُكم عليه بلا محتسب.
  if v_at is null or p_at < v_at or v_track is distinct from p_track_id then
    return 0;
  end if;
  v_span := public.fn_credit_span(p_plan_id, v_units);
  -- إتماماته الحيّة في هذا المسار قبل النقل (عائدٌ إليه): لا تُحسب مرتين.
  select count(*)::int, coalesce(max(c.day_number), 0)::int into v_live, v_max
  from public.day_completions c
  where c.participant_id = p_participant_id and c.plan_id = p_plan_id and c.track_id = p_track_id
    and c.deleted_at is null and c.completed_at <= v_at
    and (c.undone_at is null or c.undone_at > p_at);
  return greatest(v_span, v_max) - v_live;
end;
$$;
comment on function public.fn_credited_days_at(uuid, uuid, uuid, timestamptz) is
  'الأيام المحتسبة للمنقول عند لحظة: greatest(D, M) − L — داخلية، تجمعها fn_done_days_at إلى الحيّ.';
revoke all on function public.fn_credited_days_at(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;

-- ══ المتمّ = الحيّ + المحتسب ══ — ومن لا محتسب له لا يكلّف شيئاً.
create or replace function public.fn_done_days_at(p_participant_id uuid, p_plan_id uuid, p_track_id uuid, p_at timestamptz)
returns integer
language sql stable security definer set search_path to ''
as $function$
  select (
    select count(*)::int from public.day_completions c
    where c.participant_id = p_participant_id and c.plan_id = p_plan_id and c.track_id = p_track_id
      and c.deleted_at is null and c.completed_at <= p_at
      and (c.undone_at is null or c.undone_at > p_at)
  ) + case
    when exists (select 1 from public.participants pa where pa.id = p_participant_id and pa.credited_at is not null)
      then public.fn_credited_days_at(p_participant_id, p_plan_id, p_track_id, p_at)
    else 0
  end;
$function$;

-- ══ الموعد: المنقول المحمول من بداية البرنامج ══
select pg_temp.patch('public.fn_participant_engine(uuid)'::regprocedure,
$o$  v_joined timestamptz;
begin
  select pa.program_id, pa.track_id, pa.judge_from, pa.joined_at into program_id, track_id, v_judge, v_joined$o$,
$n$  v_joined timestamptz;
  v_credit timestamptz;
begin
  select pa.program_id, pa.track_id, pa.judge_from, pa.joined_at, pa.credited_at
  into program_id, track_id, v_judge, v_joined, v_credit$n$);

select pg_temp.patch('public.fn_participant_engine(uuid)'::regprocedure,
$o$  if v_due = 'program_start' and v_set is not null and v_judge <= coalesce(v_joined, v_judge) then$o$,
$n$  -- والمنقول المحمول (ش٢): لحظة حكمه لحظة قبول نقله نفسها (`now()` واحدةٌ في معاملة القبول) — فيُحسب
  -- من البداية، و`done` يشمل محتسبه فلا ازدواج. وإن تجدّدت لحظته بعدُ (إيقافٌ ثم عودة) سقط إلى ما بعده.
  if v_due = 'program_start' and v_set is not null
     and (v_judge <= coalesce(v_joined, v_judge) or v_judge = v_credit) then$n$);

-- ══ الأرشيف: أول يومٍ بعد النقل يرى المحتسب ══ (مراجعة الخطة م٤)
select pg_temp.patch('public.fn_settle_commitment_at(uuid, timestamptz)'::regprocedure,
$o$      when public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id, v_prev_cut) >= e.day_count then 'exempt'$o$,
$n$      -- عند لحظة النقل إن كانت بعد وقت اليوم السابق: المحتسب لا يُقرأ قبلها، فبدونه يُكتب يوم النقل متعثّراً
      -- على من حُمل له نصيب مساره كله.
      when public.fn_done_days_at(p_participant_id, e.plan_id, e.track_id,
             greatest(v_prev_cut, (select pa.credited_at from public.participants pa where pa.id = p_participant_id)))
           >= e.day_count then 'exempt'$n$);

-- ══ الوحدات المحمولة ══ — دالةٌ واحدة للقبول ومعاينته.
-- ما بلغه في القديم (يشمل محتسبه السابق، فالسلسلة أ ← ب ← ج تعمل)، ثم أكبر k تكون رتب الجديد ١..k
-- كلها من محفوظه — صحيحٌ لأي مقاطع، ويساوي least(بلغه، نصيب الجديد) في البادئات المتداخلة.
create or replace function public.fn_carry_units(p_participant_id uuid, p_to_track_id uuid)
returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_from  uuid;
  v_units int;
  v_share int;
  v_first int;
begin
  select pa.track_id into v_from from public.participants pa where pa.id = p_participant_id;
  select least(coalesce(r.units, 0), public.fn_track_unit_count(v_from)) into v_units
  from public.fn_progress_at_unchecked(p_participant_id, now()) r;
  v_units := coalesce(v_units, 0);  -- لا صفّ (لا خطة): لا محفوظ
  v_share := public.fn_track_unit_count(p_to_track_id);
  if v_units <= 0 or v_share <= 0 then
    return 0;
  end if;
  select min(n.i) into v_first
  from generate_series(1, v_share) n(i)
  where not exists (
    select 1 from generate_series(1, v_units) o(j)
    where public.fn_track_unit_at(v_from, o.j) = public.fn_track_unit_at(p_to_track_id, n.i)
  );
  return coalesce(v_first - 1, v_share);
end;
$$;
comment on function public.fn_carry_units(uuid, uuid) is
  'الوحدات التي تُحمل للمشارك إلى مسارٍ آخر الآن — داخلية، يستدعيها القبول ومعاينته.';
revoke all on function public.fn_carry_units(uuid, uuid) from public, anon, authenticated;

-- ══ القبول ══
-- رصدٌ متزامن ينتظر القبول: لا يقع إتمامٌ في القديم بعد حساب ما يُحمل منه (مراجعة الخطة م٦). وقفل المحرّك
-- **قبل** قفل الصفّ، بترتيب دوال الرصد نفسه — وإلا تشابكا (مراجعة الترحيلات م١).
select pg_temp.patch('public.fn_decide_track_change(uuid, uuid, text)'::regprocedure,
$o$  if found then
    select * into v_participant$o$,
$n$  if found then
    perform public.fn_engine_lock(v_request.participant_id);
    select * into v_participant$n$);

select pg_temp.patch('public.fn_decide_track_change(uuid, uuid, text)'::regprocedure,
$o$  v_record_days int;
begin$o$,
$n$  v_record_days int;
  v_carry       boolean;
  v_units       int;
begin$n$);

select pg_temp.patch('public.fn_decide_track_change(uuid, uuid, text)'::regprocedure,
$o$    perform public.fn_settle_commitment_at(v_participant.id, now());$o$,
$n$    perform public.fn_settle_commitment_at(v_participant.id, now());

    select p.carry_on_transfer into v_carry from public.programs p where p.id = v_participant.program_id;
    if v_carry then
      v_units := public.fn_carry_units(v_participant.id, v_request.to_track_id);
    end if;$n$);

select pg_temp.patch('public.fn_decide_track_change(uuid, uuid, text)'::regprocedure,
$o$    set track_id = v_request.to_track_id,
        baseline_percentage = v_request.baseline_percentage
    where id = v_participant.id;$o$,
$n$    set track_id = v_request.to_track_id,
        baseline_percentage = v_request.baseline_percentage,
        -- المحمول يُكتب ولو صفراً: علامة «نقلٍ محمول» تجعل موعده من بداية البرنامج.
        credited_units = case when v_carry then v_units end,
        credited_at = case when v_carry then now() end
    where id = v_participant.id;$n$);

select pg_temp.patch('public.fn_decide_track_change(uuid, uuid, text)'::regprocedure,
$o$        'record_days', v_record_days
      )$o$,
$n$        'record_days', v_record_days,
        'credited_units', case when v_carry then v_units end,
        'credited_days', case when v_carry then public.fn_credited_days_at(
          v_participant.id, public.fn_track_plan(v_request.to_track_id), v_request.to_track_id, now()) end
      )$n$);

-- ══ معاينة القبول ══ — ما يُحمل لو قُبل الطلب الآن.
create or replace function public.fn_track_change_carry_preview(p_request_id uuid)
returns table (carry boolean, credited_units int, credited_days int, day_count int)
language plpgsql stable security definer set search_path = ''
as $$
declare
  q      record;
  v_plan uuid;
begin
  select r.participant_id, r.to_track_id, pa.program_id into q
  from public.track_change_requests r
  join public.participants pa on pa.id = r.participant_id
  where r.id = p_request_id and r.deleted_at is null and r.status = 'pending';
  if q.participant_id is null or not public.fn_has_permission('participants.read', q.program_id) then
    return;
  end if;
  select p.carry_on_transfer into carry from public.programs p where p.id = q.program_id;
  if not carry then
    return next;
    return;
  end if;
  credited_units := public.fn_carry_units(q.participant_id, q.to_track_id);
  v_plan := public.fn_track_plan(q.to_track_id);
  select p.day_count into day_count from public.plans p where p.id = v_plan;
  -- تقديرٌ بلا عائدٍ إلى مسارٍ سابق: D وحده (والقبول يطرح إتماماته فيه إن كان عائداً).
  credited_days := case when v_plan is null then 0 else public.fn_credit_span(v_plan, credited_units) end;
  return next;
end;
$$;
comment on function public.fn_track_change_carry_preview(uuid) is
  'معاينة ما يُحمل للمنقول لو قُبل طلبه الآن — لقارئ مشاركي البرنامج.';
revoke all on function public.fn_track_change_carry_preview(uuid) from public, anon;
grant execute on function public.fn_track_change_carry_preview(uuid) to authenticated;
