-- كلمة المرور المؤقتة (adr/0060): يُصدرها حامل `users.password` لطالبٍ لا يصل حسابه، فيدخل بها ويُجبَر
-- على كلمةٍ جديدة قبل أي شيء. الكلمة نفسها تُعيَّن بمفتاح الخدمة في الخادم — هنا الإذن والسجلّ وحدهما.
--
-- **الإذن (قرار الراعي ١٢ نوفمبر):**
--   · حسابٌ له دورٌ في الفريق — لمدير المنصة وحده (دور النظام بنطاقٍ عام). فلا تصير صلاحيةٌ صغيرة
--     باباً خلفياً إلى حسابٍ أعلى منها.
--   · حساب طالب — لحامل الصلاحية بنطاقٍ عام، أو بنطاق برنامجٍ للطالب فيه مشاركة.
--   · لا لنفسه: كلمته يغيّرها من «حسابي».

-- ══ الصلاحية لدور النظام ══ (والكتالوج في config/permissions.ts، والبذرة في seed.sql)
insert into public.role_permissions (role_id, permission_code)
select r.id, 'users.password' from public.roles r
where r.is_system = true and r.deleted_at is null
on conflict do nothing;

-- ══ حدّ الإصدار ══ — عشرون في الساعة لكل مُصدِر: يكفي يوم دعمٍ مزدحم، ولا يكفي للاستيلاء الجماعي.
insert into public.settings (key, value, scope_program_id, description)
values
  ('auth.temp_password.max_attempts', '20'::jsonb, null, 'أقصى كلمات مرور مؤقتة يُصدرها مشرفٌ واحد في النافذة'),
  ('auth.temp_password.window_seconds', '3600'::jsonb, null, 'نافذة حدّ إصدار كلمات المرور المؤقتة بالثواني')
on conflict do nothing;

-- ══ الإذن ══
create or replace function public.fn_temp_password_allowed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_user_id is distinct from (select auth.uid())
    and case
      -- حساب فريق: مدير المنصة وحده.
      when exists (select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.deleted_at is null) then
        exists (
          select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id and r.is_system and r.deleted_at is null
          join public.profiles pr on pr.user_id = ur.user_id and pr.deleted_at is null
          where ur.user_id = (select auth.uid())
            and ur.deleted_at is null
            and ur.scope_program_id is null
        )
      -- حساب طالب: النطاق العام، أو برنامجٌ له فيه مشاركة.
      else
        public.fn_has_permission('users.password', null)
        or exists (
          select 1 from public.participants p
          where p.user_id = p_user_id
            and p.deleted_at is null
            and public.fn_has_permission('users.password', p.program_id)
        )
    end;
$$;

comment on function public.fn_temp_password_allowed(uuid) is
  'هل يُصدر المستدعي كلمة مرور مؤقتة لهذا الحساب؟ حساب الفريق لمدير المنصة وحده، والطالب لحامل users.password في نطاقه (adr/0060).';

revoke all on function public.fn_temp_password_allowed(uuid) from public, anon;
grant execute on function public.fn_temp_password_allowed(uuid) to authenticated;

-- ══ ما تعرضه شاشة الإصدار ══ — لمن أُذن له وحده: الاسم والجوالان (إليهما تُرسَل الكلمة) وطريقة دخوله.
create or replace function public.fn_temp_password_target(p_user_id uuid)
returns table (
  full_name      text,
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
  'بيانات شاشة كلمة المرور المؤقتة — بإذن fn_temp_password_allowed وحده (adr/0060).';

revoke all on function public.fn_temp_password_target(uuid) from public, anon;
grant execute on function public.fn_temp_password_target(uuid) to authenticated;

-- ══ الإصدار: الإذن ثم الحال ثم السجلّ ══ — يُستدعى بعميل المُصدِر قبل تعيين الكلمة بمفتاح الخدمة،
-- فلا تُعيَّن كلمةٌ لم يُؤذن بها ولم تُسجَّل.
create or replace function public.fn_temp_password_issue(p_user_id uuid, p_expires_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.fn_temp_password_allowed(p_user_id) then
    raise exception 'لا تملك إصدار كلمة مرور مؤقتة لهذا الحساب.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where user_id = p_user_id;
  if v_profile.id is null then
    raise exception 'حساب غير معروف.' using errcode = 'P0002';
  end if;
  -- الموقوف والمحذوف بابهما مغلق — والكلمة المؤقتة لا تفتحه.
  if v_profile.purge_after is not null or v_profile.deleted_at is not null then
    raise exception 'الحساب موقوف أو في سلّة المحذوفات — أعِد تفعيله أولاً.' using errcode = '23514';
  end if;
  -- المدة من الخادم: بين الآن ويومين ونصف — لا كلمة مفتوحة الأجل بخطأٍ في الاستدعاء.
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '60 hours' then
    raise exception 'مدة الكلمة المؤقتة غير صالحة.' using errcode = '23514';
  end if;

  perform public.fn_write_audit(
    'temp_password_issued', 'profiles', v_profile.id, null,
    jsonb_build_object('user_id', p_user_id, 'expires_at', p_expires_at)
  );
  -- معرّف الملف: يُسجَّل عليه فشل التعيين إن فشل.
  return v_profile.id;
end;
$$;

comment on function public.fn_temp_password_issue(uuid, timestamptz) is
  'إذن إصدار كلمة مرور مؤقتة وسجلّه — والتعيين نفسه بمفتاح الخدمة بعده (adr/0060).';

revoke all on function public.fn_temp_password_issue(uuid, timestamptz) from public, anon;
grant execute on function public.fn_temp_password_issue(uuid, timestamptz) to authenticated;
