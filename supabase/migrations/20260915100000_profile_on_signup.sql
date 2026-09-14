-- 031 | ملف المستخدم يُنشأ مع حسابه
--
-- الملف (`profiles`) كان يُنشأ في شاشة ضبط كلمة المرور وحدها، ولا يُفحص فشل
-- إنشائه. والحساب بلا ملف يُعامَل موقوفاً (`fn_is_active`)، فلا يدخل شيئاً ولا
-- يُقال له لماذا. ومع إنشاء الزائر حسابه بنفسه لا توجد تلك الشاشة في طريقه.
--
-- فالملف يُنشأ هنا لحظة إنشاء الحساب، من الاسم والجوال اللذين يحملهما:
-- المسجِّل بنفسه (`/sign-up`) والمدعوّ (`sendInvite`) معاً.
--
-- **لا يُنشأ إلا من بيانات صالحة.** حسابٌ بلا اسم وجوال — كإدراجات الاختبارات
-- المباشرة، أو من التفّ على الشاشة بطلب مباشر — يبقى بلا ملف، أي بلا وصول.
-- ولا يُرفض إنشاء الحساب نفسه: الرفض هنا يُرجع للمستخدم «خطأ في قاعدة البيانات»
-- بلا معنى، والحساب بلا ملف لا يملك شيئاً أصلاً.
--
-- تراجع: نعم.

create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  v_phone text := btrim(coalesce(new.raw_user_meta_data ->> 'phone', ''));
begin
  -- الصيغة نفسها التي يُطبّعها `phoneSchema` في `lib/validation/auth.ts`.
  if char_length(v_name) < 3 or v_phone !~ '^\+9665[0-9]{8}$' then
    return new;
  end if;

  insert into public.profiles (user_id, full_name, phone)
  values (new.id, v_name, v_phone)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.fn_handle_new_user() from public;

create trigger trg_auth_users_profile
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();
