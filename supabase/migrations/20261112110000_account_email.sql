-- بريد الدخول للقراءة (قرار الراعي ١٢ نوفمبر · خيار أ): الطالب الذي نسي كلمته ينسى كثيراً بأي بريدٍ سجّل،
-- والدخول بالبريد والكلمة معاً — فرسالة الكلمة المؤقتة بلا بريدها ناقصة (adr/0060). والبريد في خدمة
-- المصادقة لا في الملف، فلم تعرضه شاشة الحساب ولا شاشة الإصدار. **للقراءة وحدها:** تعديله يغيّر باب
-- الدخول نفسه، فهو قرارٌ مستقلّ لم يُتّخذ.

-- ══ شاشة الإصدار ══ — يُضاف البريد إلى ما تعرضه. تغيير أعمدة الإرجاع يستلزم إسقاط الدالّة.
drop function public.fn_temp_password_target(uuid);

create function public.fn_temp_password_target(p_user_id uuid)
returns table (
  full_name      text,
  email          text,
  phone          text,
  guardian_phone text,
  has_google     boolean,
  has_password   boolean,
  is_staff       boolean,
  account_state  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_temp_password_allowed(p_user_id) then
    raise exception 'لا تملك إصدار كلمة مرور مؤقتة لهذا الحساب.' using errcode = '42501';
  end if;

  return query
  select
    pr.full_name,
    u.email::text,
    pr.phone,
    pi.guardian_phone,
    coalesce(u.raw_app_meta_data -> 'providers' ? 'google', false),
    coalesce(u.encrypted_password, '') <> '',
    exists (select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.deleted_at is null),
    case when pr.purge_after is not null then 'bin' when pr.deleted_at is not null then 'suspended' else 'active' end
  from public.profiles pr
  join auth.users u on u.id = pr.user_id
  left join public.profile_identities pi on pi.user_id = pr.user_id
  where pr.user_id = p_user_id;
end;
$$;

comment on function public.fn_temp_password_target(uuid) is
  'بيانات شاشة كلمة المرور المؤقتة ومعها بريد الدخول — بإذن fn_temp_password_allowed وحده (adr/0060).';

revoke all on function public.fn_temp_password_target(uuid) from public, anon;
grant execute on function public.fn_temp_password_target(uuid) to authenticated;

-- ══ شاشة الحساب ══ — لحامل users.read بنطاقٍ عام، كما تشترط الشاشة نفسها.
create function public.fn_account_email(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('users.read', null) then
    raise exception 'لا تملك عرض بريد الحساب.' using errcode = '42501';
  end if;
  return (select u.email::text from auth.users u where u.id = p_user_id);
end;
$$;

comment on function public.fn_account_email(uuid) is
  'بريد دخول الحساب للقراءة — لحامل users.read العام (adr/0060 · قرار ١٢ نوفمبر).';

revoke all on function public.fn_account_email(uuid) from public, anon;
grant execute on function public.fn_account_email(uuid) to authenticated;
