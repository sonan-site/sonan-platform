-- 027 | «ليس دور النظام» يُسأل بلا حجاب السياسات
--
-- الهجرة ٠٢٦ منعت تعديل صلاحيات دور النظام بشرط `not exists (select … from roles
-- where is_system)`. لكن الاستعلام الفرعي داخل السياسة **يمرّ بسياسة `roles` نفسها**:
-- حامل `roles.write` بلا `roles.read` لا يرى دور النظام أصلاً، فيصير «غير موجود»
-- ويمرّ الشرط. كشفه `lib/auth/security.db-test.ts` قبل أن يُدفع.
--
-- الحل على نمط `fn_track_program_id`: دالة محلِّلة `security definer` تجيب عن
-- سؤال واحد ولا تكشف غيره.
--
-- **والعلّة نفسها في `fn_archive_track`:** فحص «في المسار مشاركون» كان بصلاحية
-- المستدعي، فمن يملك `programs.write` بلا `participants.read` لا يرى المشاركين
-- ويؤرشف مساراً مأهولاً. تصير الدالة `definer` بحارس صريح في مطلعها.
--
-- تراجع: نعم.

create or replace function public.fn_archive_track(p_track_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stamp   timestamptz := now();
  v_program uuid;
  v_plans   uuid[];
begin
  select program_id into v_program
  from public.tracks where id = p_track_id and deleted_at is null;

  -- الحارس أولاً: من لا يملك الكتابة في برنامج المسار لا يعرف حتى إن كان فيه مشاركون.
  if v_program is null or not public.fn_has_permission('programs.write', v_program) then
    return null;
  end if;

  if exists (
    select 1 from public.participants
    where track_id = p_track_id and deleted_at is null
  ) then
    raise exception 'في المسار مشاركون — انقلهم قبل أرشفته' using errcode = '23514';
  end if;

  update public.tracks set deleted_at = v_stamp where id = p_track_id;

  with archived as (
    update public.plans set deleted_at = v_stamp
    where track_id = p_track_id and deleted_at is null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_plans from archived;

  update public.plan_days set deleted_at = v_stamp
  where plan_id = any (v_plans) and deleted_at is null;

  perform public.fn_write_audit(
    'track_archived', 'tracks', p_track_id, null,
    jsonb_build_object('archived_plans', cardinality(v_plans))
  );

  return cardinality(v_plans);
end;
$$;

create or replace function public.fn_role_is_system(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_system from public.roles where id = p_role_id), false);
$$;

revoke all on function public.fn_role_is_system(uuid) from public;
grant execute on function public.fn_role_is_system(uuid) to authenticated;

drop policy role_permissions_insert on public.role_permissions;
drop policy role_permissions_update on public.role_permissions;

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (
    public.fn_has_permission('roles.write')
    and public.fn_has_permission(permission_code)
    and not public.fn_role_is_system(role_id)
  );

create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using (
    public.fn_has_permission('roles.write')
    and public.fn_has_permission(permission_code)
    and not public.fn_role_is_system(role_id)
  )
  with check (
    public.fn_has_permission('roles.write')
    and public.fn_has_permission(permission_code)
    and not public.fn_role_is_system(role_id)
  );
