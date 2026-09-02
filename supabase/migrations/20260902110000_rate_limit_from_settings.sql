-- 009 | حدّ المعدل يقرأ حدوده من الإعدادات بنفسه
--
-- الثغرة التي يعالجها: الدخول والاسترجاع **يسبقان المصادقة**، وسياسة settings
-- تشترط صلاحية settings.read. فلو قرأ التطبيق الحدود بنفسه لفشل عند من لم يدخل
-- بعد — وهم بالضبط من يستهدفهم حدّ المعدل. البديل السيّئ: تثبيت الأرقام في الكود،
-- وهو ما يمنعه platform.md 12 («القيمة التشغيلية من settings لا سحرية في الكود»).
--
-- الحل: الدالة مرتفعة الامتياز تقرأ الإعداد بنفسها. القيمة تبقى في مكانها الصحيح،
-- والقارئ الوحيد لها دالة محروسة لا التطبيق.
--
-- تصنيف: مكشوفة لـ anon و authenticated بالضرورة. تكتب ولا تُرجع إلا نعم/لا،
-- ولا تكشف قيمة الإعداد لمستدعيها.
--
-- تراجع: نعم.

create or replace function public.fn_rate_limit(
  p_bucket         text,
  p_setting_prefix text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max     int;
  v_seconds int;
begin
  select (value #>> '{}')::int into v_max
  from public.settings
  where key = p_setting_prefix || '.max_attempts'
    and scope_program_id is null
    and deleted_at is null;

  select (value #>> '{}')::int into v_seconds
  from public.settings
  where key = p_setting_prefix || '.window_seconds'
    and scope_program_id is null
    and deleted_at is null;

  -- إعداد ناقص = منع، لا تساهل. الافتراض الآمن يُفحَص لا يُفترَض (platform.md 7).
  if v_max is null or v_seconds is null then
    insert into public.audit_log (actor_id, action, entity_table, entity_id, after)
    values (null, 'rate_limit_misconfigured', 'settings', null,
            jsonb_build_object('prefix', p_setting_prefix));
    return false;
  end if;

  return public.fn_hit_rate_limit(p_bucket, v_max, v_seconds);
end;
$$;

comment on function public.fn_rate_limit(text, text) is
  'يقرأ الحدّ من settings ثم يطبّقه. لا يكشف قيمة الإعداد للمستدعي، والإعداد الناقص منعٌ لا تساهل.';

revoke all on function public.fn_rate_limit(text, text) from public;
grant execute on function public.fn_rate_limit(text, text) to anon, authenticated;
