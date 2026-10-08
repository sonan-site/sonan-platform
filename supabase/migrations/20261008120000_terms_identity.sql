-- 072 | نسخة الشروط والخصوصية بعد الهوية (adr/0047 · adr/0028)
--
-- الخصوصية صارت تذكر رقم الهوية وجوال وليّ الأمر، ومن يطّلع عليهما. وهذا
-- تعديلٌ جوهري، فتصدر نسخة جديدة ويُطلب قبولها من كل حساب مرّة.
-- والنسخة في موضعين متكافئين: هنا و`lib/legal/terms.ts` — واختبار التكافؤ يفشل إن افترقا.
--
-- تراجع: نعم — إعادة النسخة السابقة '2026-09-17'.

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
    and p.phone ~ '^\+[1-9][0-9]{7,14}$'
    and p.terms_version = '2026-10-08',
    false
  );
$$;
