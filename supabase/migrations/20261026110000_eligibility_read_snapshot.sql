-- حالة التأهل تقرأ لقطة الفرز (مراجعة هـ · م١).
--
-- الحسم (`fn_apply_sorting`) يقضي من اللقطة المخزَّنة في `exam_eligibility` لا من حسابٍ جديد،
-- والشرط السابق (`fn_exam_best`) بلا لحظة — يُقرأ بحاله الآن. فلو عرضت البطاقة المحسوبَ حيّاً
-- بعد حساب اللقطة لخالفت ما سيُحسم إن تغيّر اجتياز الشرط بينهما (تصحيح درجةٍ مثلاً).
-- فاللقطة المحسوبة بعد لحظة الأهلية تُعرض كما هي، والحيّ لمن لا لقطة له بعد.
--
-- و`decided` دفاعيٌّ: `decision` لا تكتبها إلا `fn_apply_sorting` في معاملة ضبط `sorted_at`، والدالة
-- تستبعد المحسوم — فلا يقع قبل الحسم في المجرى المعتاد، ويبقى إن كُتب القرار بغيرها يوماً.

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
    select el.decision, el.eligible, el.percent, el.prerequisite_passed into x
    from public.exam_eligibility el
    where el.exam_id = e.id and el.participant_id = pa.id and el.deleted_at is null
      and el.computed_at >= e.eligibility_at;

    if x.eligible is null then
      select * into v from public.fn_eligibility_eval(e.id, pa.id, e.eligibility_at);
    else
      select x.eligible as eligible, x.percent as percent, x.prerequisite_passed as prerequisite_passed into v;
    end if;

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
  'حالة التأهل لصاحب المشاركة أو قارئ مشاركيها بين لحظة الأهلية وحسم الفرز: لقطة الفرز إن حُسبت بعد لحظة الأهلية، وإلا المحسوب مبدئياً.';
