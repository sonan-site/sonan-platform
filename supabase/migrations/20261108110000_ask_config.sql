-- «اسأل عن المسابقة» (adr/0057) — إعداد المساعد للخادم.
--
-- الخادم كان يقرأ ask.enabled و ask.model من settings بمفتاح الخدمة، و settings مغلقٌ دونه
-- (20260902170000_table_grants: لـ authenticated وحده بالسياسات) — فبقي المساعد موقوفاً على الحيّ.
-- الإصلاح: دالّةٌ تعيد السطرين وحدهما، ويبقى الجدول مغلقاً.
--
-- تصنيف الدالّة (platform.md §٧): fn_ask_config — مغلقة: لـ service_role وحده (الخادم).
--
-- تراجع: نعم — drop function.

create function public.fn_ask_config()
returns table (enabled boolean, model text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select s.value = 'true'::jsonb from public.settings s
              where s.key = 'ask.enabled' and s.scope_program_id is null and s.deleted_at is null), false),
    (select s.value #>> '{}' from public.settings s
     where s.key = 'ask.model' and s.scope_program_id is null and s.deleted_at is null
       and jsonb_typeof(s.value) = 'string')
$$;

comment on function public.fn_ask_config() is
  'مفتاح المساعد ونموذجه من settings — للخادم وحده (adr/0057)؛ الغائب = موقوف.';

revoke all on function public.fn_ask_config() from public, anon, authenticated;
grant execute on function public.fn_ask_config() to service_role;
