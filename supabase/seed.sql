-- بذرة الإقلاع. تُنفَّذ بعد الهجرات في كل db:reset، فيجب أن تكون معيدة التنفيذ.

-- ── دور النظام الإداري ──
insert into public.roles (name, description, is_system)
values ('مدير المنصة', 'دور البذرة الإداري. لا يُوقَف ولا تُنزَع عنه صفة النظام.', true)
on conflict do nothing;

-- ── رموز الصلاحيات — أقسام النواة الخمسة ──
-- مصدر الحقيقة الحيّ هو config/permissions.ts. هذه بذرة مطابقة له،
-- وحارس الصلاحيات يقابل الاثنين ويفشل عند أي اختلاف.
insert into public.role_permissions (role_id, permission_code)
select r.id, code
from public.roles r
cross join (values
  ('users.read'), ('users.write'),
  ('roles.read'), ('roles.write'), ('roles.assign'),
  ('settings.read'), ('settings.write'),
  ('attachments.read'), ('attachments.write'),
  ('audit.read'),
  ('sections.read'), ('sections.write'),
  ('programs.read'), ('programs.write'),
  ('participants.read'), ('participants.write')
) as codes(code)
where r.is_system = true and r.deleted_at is null
on conflict do nothing;

-- ── إعدادات أولية ──
-- تُبذَر القيم القائمة فعلاً فقط. الإعداد يولد مع الميزة التي تحتاجه،
-- لا قبلها تخميناً: ما لم يُذكر لم يُقرَّر (platform.md 12).
insert into public.settings (key, value, scope_program_id, description)
values
  ('platform.name', '"منصة مسابقة سنن"'::jsonb, null, 'الاسم المعروض في الترويسة وعنوان الصفحة')
on conflict do nothing;
