-- 021 | بذر المدير الأول يُنشئ ملف تعريفه
--
-- **عطب كشفه أول استعمال حقيقي.** `fn_bootstrap_admin` كانت تُسنِد دور النظام
-- ولا تُنشئ صفّاً في `profiles`. و`fn_is_active()` تفحص `profiles` لا
-- `auth.users`، و`getSession()` تردّ `suspended` حين تعود بغير `true`.
--
-- فالناتج **حسابٌ يملك كل الصلاحيات ولا يفتح شاشة واحدة**: يُصادَق، ثم
-- يُعامَل معاملة الموقوف. ولا رسالة تقول السبب — البذرة نجحت وأعادت معرّفاً.
--
-- والعلاج ليس فحصاً يمنع، بل **بذرةٌ تُنتج حساباً صالحاً**: الاسم والجوال
-- معاملان إلزاميان، والملف والدور يُكتبان في معاملة واحدة. فإما مديرٌ يعمل
-- أو لا شيء.
--
-- تراجع: نعم — والتراجع يُعيد الصيغة التي تُنتج حساباً معطَّلاً.

drop function if exists public.fn_bootstrap_admin(uuid);

create or replace function public.fn_bootstrap_admin(
  p_user_id   uuid,
  p_full_name text,
  p_phone     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  v_id      uuid;
begin
  select id into v_role_id
  from public.roles
  where is_system = true and deleted_at is null
  limit 1;

  if v_role_id is null then
    raise exception 'دور النظام غير مبذور — نفّذ البذرة أولاً';
  end if;

  if exists (
    select 1 from public.user_roles
    where role_id = v_role_id and deleted_at is null
  ) then
    raise exception 'المدير الأول مبذور سلفاً — الإسناد بعده يمرّ بالمسار العادي';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'لا مستخدم بهذا المعرّف. أنشئ الحساب أولاً ثم ابذر الدور';
  end if;

  if coalesce(btrim(p_full_name), '') = '' or coalesce(btrim(p_phone), '') = '' then
    raise exception 'الاسم والجوال مطلوبان — الحساب بلا ملف تعريف يُعامَل موقوفاً';
  end if;

  -- الملف قبل الدور: `fn_is_active` تفحصه، فبلا صفٍّ هنا لا تُفتَح شاشة.
  insert into public.profiles (user_id, full_name, phone)
  values (p_user_id, btrim(p_full_name), btrim(p_phone))
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        phone     = excluded.phone,
        deleted_at = null;

  insert into public.user_roles (user_id, role_id, scope_program_id)
  values (p_user_id, v_role_id, null)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_table, entity_id, after)
  values (null, 'bootstrap_admin', 'user_roles', v_id,
          jsonb_build_object('user_id', p_user_id, 'role_id', v_role_id));

  return v_id;
end;
$$;

comment on function public.fn_bootstrap_admin(uuid, text, text) is
  'تُستدعى مرة واحدة. تُنشئ ملف التعريف وتُسنِد دور النظام معاً — حسابٌ يعمل أو لا شيء.';

revoke all on function public.fn_bootstrap_admin(uuid, text, text) from public;
revoke all on function public.fn_bootstrap_admin(uuid, text, text) from anon;
revoke all on function public.fn_bootstrap_admin(uuid, text, text) from authenticated;
