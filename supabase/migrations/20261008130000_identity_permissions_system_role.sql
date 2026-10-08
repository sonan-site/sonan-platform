-- 073 | دور النظام يحمل صلاحيتَي الهويات (adr/0047)
--
-- دور النظام يحمل الكتالوج كاملاً (`lib/permissions/catalog.db-test.ts`). والبذرة
-- تُنفَّذ في الإقلاع المحلي وحده، فالمشروع الحيّ يأخذ الرمزين الجديدين هنا.
--
-- تراجع: نعم — حذف الصفّين.

insert into public.role_permissions (role_id, permission_code)
select r.id, code
from public.roles r
cross join (values ('identities.read'), ('identities.write')) as codes(code)
where r.is_system = true and r.deleted_at is null
on conflict do nothing;
