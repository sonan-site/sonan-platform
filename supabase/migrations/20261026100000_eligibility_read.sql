-- حالة التأهل للمشارك (خطة دليل المشارك · هـ · ت٢).
--
-- المعادلة واحدة: `fn_eligibility_eval` تحسب إنجاز المشارك عند لحظةٍ واجتيازَه الشرطَ السابق،
-- فتستدعيها `fn_compute_eligibility` (الفرز) و`fn_my_eligibility` (قراءة المشارك) — لا نسختان
-- تفترقان. والقراءة تعرض **القرار المسجَّل إن وُجد، وإلا المحسوب «مبدئياً»** بعد لحظة الأهلية
-- وقبل حسم الفرز؛ وبعد الحسم تحلّ محلّها بطاقة النهائي (`fn_my_final`).

-- ══ المعادلة ══
create or replace function public.fn_eligibility_eval(p_exam_id uuid, p_participant_id uuid, p_at timestamptz)
returns table (percent numeric, units int, prerequisite_passed boolean, eligible boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  e record;
  p record;
begin
  select x.entry_percentage, x.prerequisite_exam_id into e from public.exams x where x.id = p_exam_id;
  select * into p from public.fn_progress_at_unchecked(p_participant_id, p_at);
  percent := coalesce(p.percent, 0);
  units := coalesce(p.units, 0);
  prerequisite_passed := e.prerequisite_exam_id is null
    or coalesce((select b.passed from public.fn_exam_best(e.prerequisite_exam_id, p_participant_id) b), false);
  eligible := percent >= coalesce(e.entry_percentage, 0) and prerequisite_passed;
  return next;
end;
$$;
comment on function public.fn_eligibility_eval(uuid, uuid, timestamptz) is
  'معادلة الأهلية الواحدة — داخلية بلا منح: تستدعيها fn_compute_eligibility وfn_my_eligibility بعد حارسيهما.';
revoke all on function public.fn_eligibility_eval(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ══ الفرز يستدعي المعادلة ══ (السلوك كما هو؛ التغيير موضع الحساب وحده)
create or replace function public.fn_compute_eligibility(p_exam_id uuid, p_offset integer, p_limit integer default 40)
returns table(computed integer, total integer)
language plpgsql security definer set search_path to ''
as $function$
declare
  e     record;
  v_at  timestamptz;
  v_n   int := 0;
  r     record;
  p     record;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or e.exam_type <> 'oral' then
    raise exception 'الفرز للاختبار الشفهي وحده' using errcode = '22023';
  end if;
  if not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;
  if e.sorted_at is not null then
    raise exception 'حُسم الفرز — التصحيح فرديٌّ بسبب' using errcode = '23514';
  end if;
  if e.prerequisite_exam_id is not null then
    perform public.fn_seal_expired_attempts(e.prerequisite_exam_id);
  end if;
  v_at := least(now(), coalesce(e.eligibility_at, now()));

  for r in
    select s.participant_id from public.fn_eligibility_scope(p_exam_id) s
    where s.n > greatest(p_offset, 0) and s.n <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 100)
    order by s.n
  loop
    select * into p from public.fn_eligibility_eval(p_exam_id, r.participant_id, v_at);
    insert into public.exam_eligibility (exam_id, participant_id, percent, units, prerequisite_passed, eligible, computed_at)
    values (p_exam_id, r.participant_id, p.percent, p.units, p.prerequisite_passed, p.eligible, now())
    on conflict (exam_id, participant_id) where deleted_at is null do update
      set percent = excluded.percent, units = excluded.units, prerequisite_passed = excluded.prerequisite_passed,
          eligible = excluded.eligible, computed_at = excluded.computed_at;
    v_n := v_n + 1;
  end loop;

  computed := v_n;
  total := (select count(*)::int from public.fn_eligibility_scope(p_exam_id));
  return next;
end;
$function$;

-- ══ قراءة المشارك ══
-- الاختبارات الشفهية في برنامجه ومساره، بعد لحظة أهليتها وقبل حسم فرزها، ولمن في نطاق الفرز.
-- `decided` = قرارٌ مسجَّل (تجاوزٌ أو تصحيح قبل الحسم) يُعرض كما هو؛ وإلا المحسوب الآن مبدئياً.
create or replace function public.fn_my_eligibility(p_participant_id uuid)
returns table (
  exam_id uuid, exam_name text, eligible boolean, decided boolean,
  percent numeric, entry_percentage numeric, prerequisite_name text, prerequisite_passed boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  pa record;
  e  record;
  x  record;
  v  record;
begin
  perform public.fn_engine_access(p_participant_id, false);
  select * into pa from public.participants where id = p_participant_id and deleted_at is null;
  if pa.status not in ('registered', 'memorizing', 'qualified', 'not_qualified') then
    return;
  end if;

  for e in
    select ex.id, ex.name, ex.entry_percentage, ex.eligibility_at, pre.name as pre_name
    from public.exams ex
    left join public.exams pre on pre.id = ex.prerequisite_exam_id
    where ex.program_id = pa.program_id and ex.deleted_at is null and ex.exam_type = 'oral'
      and (ex.track_id is null or ex.track_id = pa.track_id)
      and ex.eligibility_at is not null and ex.eligibility_at <= now()
      and ex.sorted_at is null
    order by ex.created_at
  loop
    select el.decision into x from public.exam_eligibility el
    where el.exam_id = e.id and el.participant_id = pa.id and el.deleted_at is null;
    select * into v from public.fn_eligibility_eval(e.id, pa.id, e.eligibility_at);

    exam_id := e.id;
    exam_name := e.name;
    decided := x.decision is not null;
    eligible := coalesce(x.decision, v.eligible);
    percent := v.percent;
    entry_percentage := e.entry_percentage;
    prerequisite_name := e.pre_name;
    prerequisite_passed := v.prerequisite_passed;
    return next;
  end loop;
end;
$$;
comment on function public.fn_my_eligibility(uuid) is
  'حالة التأهل لصاحب المشاركة أو قارئ مشاركيها: القرار المسجَّل وإلا المحسوب مبدئياً — بين لحظة الأهلية وحسم الفرز.';
revoke all on function public.fn_my_eligibility(uuid) from public, anon;
grant execute on function public.fn_my_eligibility(uuid) to authenticated;
