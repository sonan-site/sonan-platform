-- 037 | «المكتمل» يُجيب نعم أو لا — لا «مجهول»
--
-- `fn_profile_is_complete` (الهجرة ٠٣٦) تنتهي بـ`p.phone ~ '…'`، ومقارنة الفراغ
-- في SQL فراغٌ لا «لا». فالملف بلا جوال كان «مجهول الاكتمال» لا «ناقصاً»، وأي
-- شرط `where not fn_profile_is_complete(p)` يُسقطه بصمت. كشفه اختبار التكافؤ مع
-- `isProfileComplete` في `lib/auth/profile-details.db-test.ts`.
--
-- تراجع: نعم.

create or replace function public.fn_profile_is_complete(p public.profiles)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p.first_name is not null
    and p.father_name is not null
    and p.family_name is not null
    and p.gender is not null
    and p.birth_date is not null
    and p.nationality is not null
    and p.phone ~ '^\+[1-9][0-9]{7,14}$',
    false
  );
$$;
