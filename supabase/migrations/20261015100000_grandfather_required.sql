-- 090 | اسم الجد شرطٌ لاكتمال الحساب (ملاحظات الجوال أ٤ · ملحق adr/0047)
--
-- قرار الراعي (١٥ أكتوبر): الاسم الرباعي إلزاميٌّ للجميع في «أكمل حسابك»، فلا يُسأل عنه
-- في صفحة التسجيل. نسخٌ حرفيٌّ لآخر تعريف (الهجرة ٠٧٢) بإضافة شرط الجد وحده — مقصوصاً،
-- فالفراغ (يصل من بيانات التسجيل الخام) ليس اسماً.
-- قيس قبلها على الحيّ: الحسابات المكتملة التي تنقلب ناقصةً به = صفر.
-- ونظيرها `isProfileComplete` في lib/auth/account-state.ts — واختبار التكافؤ يحرسهما.
--
-- تراجع: نعم — إعادة تعريف الهجرة ٠٧٢ بلا سطر الجد.

create or replace function public.fn_profile_is_complete(p public.profiles)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p.first_name is not null
    and p.father_name is not null
    and btrim(p.grandfather_name) <> ''
    and p.family_name is not null
    and p.gender is not null
    and p.birth_date is not null
    and p.nationality is not null
    and p.phone ~ '^\+[1-9][0-9]{7,14}$'
    and p.terms_version = '2026-10-08',
    false
  );
$$;
