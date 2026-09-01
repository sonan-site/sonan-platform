-- 007 | دالة بذر المدير الأول
--
-- تصنيف (platform.md 7): مغلقة. التنفيذ منزوع من الجميع بلا استثناء —
-- لا anon ولا authenticated. تُستدعى بمفتاح service_role وحده، أي بفعل إداري
-- واعٍ لا بمسار تسجيل. platform.md 9 يمنع «أول مسجّل يصير مديراً».
--
-- تحرس نفسها بشرطين: الدور نظامي، ولا مُسنَد له أحد بعد.
-- تراجع: نعم.

create or replace function sunan.fn_bootstrap_admin(p_user_id uuid)
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
  from sunan.roles
  where is_system = true and deleted_at is null
  limit 1;

  if v_role_id is null then
    raise exception 'دور النظام غير مبذور — نفّذ البذرة أولاً';
  end if;

  if exists (
    select 1 from sunan.user_roles
    where role_id = v_role_id and deleted_at is null
  ) then
    raise exception 'المدير الأول مبذور سلفاً — الإسناد بعده يمرّ بالمسار العادي';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'لا مستخدم بهذا المعرّف. أنشئ الحساب أولاً ثم ابذر الدور';
  end if;

  insert into sunan.user_roles (user_id, role_id, scope_program_id)
  values (p_user_id, v_role_id, null)
  returning id into v_id;

  insert into sunan.audit_log (actor_id, action, entity_table, entity_id, after)
  values (null, 'bootstrap_admin', 'user_roles', v_id,
          jsonb_build_object('user_id', p_user_id, 'role_id', v_role_id));

  return v_id;
end;
$$;

comment on function sunan.fn_bootstrap_admin(uuid) is
  'تُستدعى مرة واحدة بمفتاح service_role. ترفض التكرار وترفض معرّفاً بلا حساب.';

revoke all on function sunan.fn_bootstrap_admin(uuid) from public;
revoke all on function sunan.fn_bootstrap_admin(uuid) from anon;
revoke all on function sunan.fn_bootstrap_admin(uuid) from authenticated;
