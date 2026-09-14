-- 030 | سؤال الصلاحية الثابت يُسأل مرّة للاستعلام لا مرّة لكل صفّ
--
-- `fn_has_permission('users.read')` بلا عمود في وسائطها جوابها واحد لكل صفوف
-- الاستعلام. لكنها `security definer` فلا يُدمجها المخطِّط، فتُنفَّذ **لكل صفّ**:
-- قائمة المستخدمين بألف ملف تسأل ألف مرّة. لفّها في `(select …)` يجعلها
-- خطة أوّلية تُحسب مرّة. توصية Supabase الموثّقة لسياسات الصفوف.
--
-- `alter policy` لا `drop`: الشرط يُعاد صوغه والمعنى لا يتغيّر حرفاً.
-- والاستدعاءات التي تمرّر عمود البرنامج خارجها —
-- جوابها يختلف من صفّ لآخر.
--
-- تراجع: نعم.

alter policy audit_log_read on public.audit_log
  using ((select public.fn_has_permission('audit.read')));

alter policy rate_limit_events_read on public.rate_limit_events
  using ((select public.fn_has_permission('audit.read')));

alter policy profiles_read on public.profiles
  using (user_id = (select auth.uid()) or (select public.fn_has_permission('users.read')));

alter policy profiles_update on public.profiles
  using (user_id = (select auth.uid()) or (select public.fn_has_permission('users.write')))
  with check (user_id = (select auth.uid()) or (select public.fn_has_permission('users.write')));

alter policy roles_read on public.roles
  using ((select public.fn_has_permission('roles.read')));

alter policy roles_insert on public.roles
  with check ((select public.fn_has_permission('roles.write')) and is_system = false);

alter policy roles_update on public.roles
  using ((select public.fn_has_permission('roles.write')) and is_system = false)
  with check ((select public.fn_has_permission('roles.write')) and is_system = false);

alter policy role_permissions_read on public.role_permissions
  using ((select public.fn_has_permission('roles.read')));

alter policy role_permissions_insert on public.role_permissions
  with check (
    (select public.fn_has_permission('roles.write'))
    and public.fn_has_permission(permission_code)
    and not public.fn_role_is_system(role_id)
  );

alter policy role_permissions_update on public.role_permissions
  using (
    (select public.fn_has_permission('roles.write'))
    and public.fn_has_permission(permission_code)
    and not public.fn_role_is_system(role_id)
  )
  with check (
    (select public.fn_has_permission('roles.write'))
    and public.fn_has_permission(permission_code)
    and not public.fn_role_is_system(role_id)
  );

alter policy user_roles_read on public.user_roles
  using (user_id = (select auth.uid()) or (select public.fn_has_permission('roles.read')));

alter policy attachments_read on public.attachments
  using (owner_id = (select auth.uid()) or (select public.fn_has_permission('attachments.read')));

alter policy attachments_update on public.attachments
  using (owner_id = (select auth.uid()) or (select public.fn_has_permission('attachments.write')))
  with check (owner_id = (select auth.uid()) or (select public.fn_has_permission('attachments.write')));

alter policy sections_read on public.sections
  using ((select public.fn_has_permission('sections.read')));

alter policy sections_insert on public.sections
  with check ((select public.fn_has_permission('sections.write')));

alter policy sections_update on public.sections
  using ((select public.fn_has_permission('sections.write')))
  with check ((select public.fn_has_permission('sections.write')));
