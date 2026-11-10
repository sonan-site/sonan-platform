-- قائمة المشاركين في البرنامج تتّسع لسعته (دَين `د-١٥` · ١٠ نوفمبر).
--
-- `fn_program_participants` تسقف الصفحة عند ٥٠٠، والمسابقة تتّسع لـ٨٠٠ (٥ مسارات × ١٦٠) وبلغت ٥٢٨
-- يوم الهجرة — فكانت الشاشة تقصّ ٢٨ مشاركاً بصمت. والجلب دفعاتٍ يعيد في كل دفعةٍ تسوية الالتزام
-- (حتى ثانيتين) وحساب القائمة كلها، ويُعرّض لتكرار صفٍّ أو سقوطه بين لقطتين. فيُرفع السقف إلى ١٠٠٠
-- لتُقرأ القائمة كلها في استدعاءٍ واحد.
--
-- التعريف الحيّ نفسه بتبديلٍ واحد لا غير، والتوقيع لا يتغيّر — فالمنحة والتعليق باقيان.
--
-- تراجع: نعم — التبديل نفسه بالعكس.

do $$
declare
  v_def text := pg_get_functiondef('public.fn_program_participants(uuid, integer, integer)'::regprocedure);
  v_old text := 'least(greatest(p_limit, 1), 500)';
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_program_participants: سقف الصفحة غير موجود أو غير فريد';
  end if;
  execute replace(v_def, v_old, 'least(greatest(p_limit, 1), 1000)');
end;
$$;
