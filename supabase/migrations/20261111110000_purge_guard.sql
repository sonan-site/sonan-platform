-- فحص صلاحية المحو في `fn_purge_account` كان لا يقع أبداً (كُشف ١١ نوفمبر · adr/0059).
--
-- الشرط `current_user in ('authenticated', 'anon')` لا يصدق داخل دالةٍ بصلاحية المالك: `current_user` فيها
-- مالكها دائماً. فكان أي مستخدمٍ مسجَّل يمحو محواً نهائياً حساباً في السلّة انقضت مدّته — لا نشطاً ولا في
-- مدّة الاستعادة، فالشروط بعده سليمة. والفاعل يُعرف بهويته (`auth.uid()`) لا بالدور: طلب المستخدم له هوية
-- ويُشترط له `users.write`، والمجدوِل ونداء المالك بلا هوية فيمرّان كما أُريد لهما (adr/0054 ف٩).
--
-- رقعةٌ على التعريف الحيّ لا إعادة كتابة — فرقع «صوتك» وسجلّ تعديلات البيانات باقية.
-- تراجع: نعم — الرقعة المعاكسة.

create or replace function pg_temp.patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13) || chr(10), chr(10));
begin
  if (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: موضع التبديل غير فريد أو مفقود', p_fn;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

select pg_temp.patch('public.fn_purge_account(uuid)'::regprocedure,
$o$  if current_user in ('authenticated', 'anon')
     and not public.fn_has_permission('users.write') then$o$,
$n$  -- بالهوية لا بالدور: داخل دالة المالك `current_user` مالكها دائماً (الهجرة 20261111110000).
  if (select auth.uid()) is not null
     and not public.fn_has_permission('users.write') then$n$);
