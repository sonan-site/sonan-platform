-- التسوية لا تنظر إلى ما قبلها إلا حين تحكم (خطة الأداء ٢٤ نوفمبر ٢٠٢٦ · البند ١).
--
-- `fn_settle_commitment_at` كانت تحسب «وقت رصد آخر يومٍ قبل أول يومٍ لم يُؤرشف» بنظرةٍ إلى أربعة
-- عشر يوماً قبله — مع كل قراءةٍ لحال الطالب وكل نقرة رصدٍ وكل صفٍّ في قائمة المشاركين — ثم تخرج
-- في الغالب بلا يومٍ تحكم عليه (أُرشف ما مضى، ولم ينقضِ وقت اليوم). تنتقل الأسطر إلى الشرط الذي
-- يعمل عند أول يومٍ يُحكم عليه، وهو قبل أول استعمالٍ لقيمتها، فالنتيجة هي هي.
-- القياس على نسخةٍ محلية (٥٤٥ مشاركاً): تسوية الجميع ١٫٧ ث ← ٠٫٥ ث، وقائمة المشاركين ٢٫٥ ث ← ١٫٤ ث.

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

-- ١) تُرفع الأسطر من موضعها قبل الحلقة.
select pg_temp.patch('public.fn_settle_commitment_at(uuid, timestamptz)',
$o$  -- نافذة اليوم تبدأ بعد وقت رصد آخر يومٍ من أيام البرنامج قبله: ما أُتمّ بعد
  -- الوقت يُحسب لما بعده، وما أُتمّ في يوم الراحة يُحسب لأول يومٍ بعدها.
  select max(public.fn_cut_at(e.program_id, e.track_id, g::date)) into v_prev_cut
  from generate_series(v_from - 14, v_from - 1, interval '1 day') g
  where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));
  v_prev_cut := coalesce(v_prev_cut, '-infinity'::timestamptz);

$o$,
'');

-- ٢) وتُوضع حيث يُحسب ما يلزم أول يومٍ يُحكم عليه.
select pg_temp.patch('public.fn_settle_commitment_at(uuid, timestamptz)',
$o$    if v_idx is null then
      v_idx := public.fn_program_days_through(e.program_id, e.track_id, e.start_date, v_day - 1);
    end if;
$o$,
$n$    if v_idx is null then
      v_idx := public.fn_program_days_through(e.program_id, e.track_id, e.start_date, v_day - 1);
      -- نافذة اليوم تبدأ بعد وقت رصد آخر يومٍ من أيام البرنامج قبله: ما أُتمّ بعد
      -- الوقت يُحسب لما بعده، وما أُتمّ في يوم الراحة يُحسب لأول يومٍ بعدها.
      -- تُحسب هنا لا قبل الحلقة: أغلب التسويات لا تحكم على يوم، فلا تحتاجها (هجرة ٢٤ نوفمبر).
      select max(public.fn_cut_at(e.program_id, e.track_id, g::date)) into v_prev_cut
      from generate_series(v_from - 14, v_from - 1, interval '1 day') g
      where extract(dow from g)::smallint = any (s.work_days) and not (g::date = any (s.exceptions));
      v_prev_cut := coalesce(v_prev_cut, '-infinity'::timestamptz);
    end if;
$n$);
