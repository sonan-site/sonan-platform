-- 038 | واجهة الدخول — شرائح يحدّدها المسؤول
--
-- نصف شاشة الدخول يعرض شرائح تعريفية (عنوان ونصّ قصير). تُحفظ في `settings`
-- بمفتاح `auth.showcase`، وتُعدَّل من شاشة «الإعدادات» بصلاحية `settings.write`.
--
-- **القراءة للزائر بدالة لا بسياسة:** الزائر لم يدخل بعد، و`settings` تحمل
-- إعدادات لا تخصّه (حدود المحاولات). فالدالة تُرجع **هذا المفتاح وحده**.
--
-- تراجع: نعم — حذف الدالة والصفّ.

insert into public.settings (key, value, scope_program_id, description)
values ('auth.showcase', '{"slides": []}'::jsonb, null, 'شرائح نصف شاشة الدخول التعريفي')
on conflict do nothing;

create or replace function public.fn_auth_showcase()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.value
       from public.settings s
      where s.key = 'auth.showcase'
        and s.scope_program_id is null
        and s.deleted_at is null),
    '{"slides": []}'::jsonb
  );
$$;

revoke all on function public.fn_auth_showcase() from public;
grant execute on function public.fn_auth_showcase() to anon, authenticated;

-- الشكل يُفرض في القاعدة أيضاً: كتابةٌ تتجاوز الشاشة لا تُفسد واجهة الدخول.
alter table public.settings
  add constraint settings_auth_showcase_shape check (
    key <> 'auth.showcase'
    or (
      jsonb_typeof(value -> 'slides') = 'array'
      and jsonb_array_length(value -> 'slides') <= 5
    )
  );
