-- 005 | سياسات جداول الهوية — المؤجَّلة من 002 بتصريح مسبَّب
-- لا سياسة delete في أي منها (platform.md 2.2): الحذف soft عبر deleted_at.
-- تراجع: نعم.

-- ── profiles ──
create policy profiles_read on sunan.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or sunan.fn_has_permission('users.read'));

create policy profiles_insert_self on sunan.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_update on sunan.profiles
  for update to authenticated
  using (user_id = (select auth.uid()) or sunan.fn_has_permission('users.write'))
  with check (user_id = (select auth.uid()) or sunan.fn_has_permission('users.write'));

-- ── roles ──
create policy roles_read on sunan.roles
  for select to authenticated
  using (sunan.fn_has_permission('roles.read'));

create policy roles_insert on sunan.roles
  for insert to authenticated
  with check (sunan.fn_has_permission('roles.write') and is_system = false);

create policy roles_update on sunan.roles
  for update to authenticated
  using (sunan.fn_has_permission('roles.write'))
  with check (sunan.fn_has_permission('roles.write'));

-- حماية دور البذرة: لا يُوقَف ولا يُحوَّل لدور عادي.
-- الاعتماد على السياسة وحدها لا يكفي — السياسة تجيز التحديث، والقيد هنا يمنع النوع الخطأ منه.
create or replace function sunan.fn_guard_system_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.is_system then
    if new.deleted_at is not null then
      raise exception 'دور النظام لا يُوقَف';
    end if;
    if new.is_system = false then
      raise exception 'لا تُنزَع صفة النظام عن دور النظام';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_roles_guard_system before update on sunan.roles
  for each row execute function sunan.fn_guard_system_role();

-- ── role_permissions ──
create policy role_permissions_read on sunan.role_permissions
  for select to authenticated
  using (sunan.fn_has_permission('roles.read'));

create policy role_permissions_insert on sunan.role_permissions
  for insert to authenticated
  with check (sunan.fn_has_permission('roles.write'));

create policy role_permissions_update on sunan.role_permissions
  for update to authenticated
  using (sunan.fn_has_permission('roles.write'))
  with check (sunan.fn_has_permission('roles.write'));

-- ── user_roles ──
create policy user_roles_read on sunan.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or sunan.fn_has_permission('roles.read'));

-- BR-ROLE-01 مفروضة هنا في الطبقة التي لا تُلتَفّ.
create policy user_roles_insert on sunan.user_roles
  for insert to authenticated
  with check (sunan.fn_can_grant_role(role_id, user_id, scope_program_id));

create policy user_roles_update on sunan.user_roles
  for update to authenticated
  using (sunan.fn_can_grant_role(role_id, user_id, scope_program_id))
  with check (sunan.fn_can_grant_role(role_id, user_id, scope_program_id));
