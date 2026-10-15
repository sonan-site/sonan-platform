-- 093 | «له كلمة مرور» من مصدرها (المرحلة ب · ب٢ · د-٩)
--
-- كانت الواجهة والإجراء يكشفانها بوجود هوية `email`، وGoTrue لا يُنشئها حين يضيف حساب Google
-- كلمة مرور. قيس على الحيّ (١٥ أكتوبر): حسابٌ له كلمة مرور بلا هوية بريد — فبقيت شاشته «إضافة»
-- وكان يغيّرها دون أن تُطلب منه الحالية. المصدر الحقيقي `auth.users.encrypted_password`،
-- والدالة تُرجعه منطقياً لصاحبه وحده — لا القيمة ولا غيرها.
--
-- تراجع: نعم — حذف الدالة.

create function public.fn_my_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select coalesce(u.encrypted_password, '') <> ''
    from auth.users u
    where u.id = (select auth.uid())
  ), false);
$$;

comment on function public.fn_my_has_password() is
  'د-٩ | هل لحساب المستدعي كلمة مرور — من encrypted_password لا من هوية email. منطقيٌّ لصاحبه وحده.';

revoke all on function public.fn_my_has_password() from public;
grant execute on function public.fn_my_has_password() to authenticated;
