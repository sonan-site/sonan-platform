-- 040 | الموافقة على الشروط والخصوصية — شرطٌ لاكتمال الحساب (adr/0028)
--
-- نجمع الميلاد والجنسية والجوال، وقد يكون المسجِّل قاصراً. فلكل حساب **إقرارٌ
-- مسجَّل**: متى وافق، وعلى أي نسخة من النصّ.
--
-- **النسخة جزء من الاكتمال:** تعديلٌ جوهري في الشروط يُصدر نسخة جديدة (هجرة
-- تُعيد تعريف هذه الدالة، ومعها `TERMS_VERSION` في `lib/legal/terms.ts`)، فيصير
-- كل حساب «ناقصاً» حتى يقبلها — وهذا ما تعد به الشروط نفسها.
--
-- تراجع: نعم — تُعاد الدالة بنسخة الهجرة ٠٣٧، ويُحذف العمودان.

alter table public.profiles
  add column terms_accepted_at timestamptz,
  add column terms_version     text;

comment on column public.profiles.terms_accepted_at is
  'متى وافق صاحب الحساب على شروط الاستخدام وسياسة الخصوصية.';
comment on column public.profiles.terms_version is
  'نسخة النصّ الذي وافق عليه — الاكتمال يشترط النسخة الحالية (fn_profile_is_complete).';

-- الإقرار زوجٌ: لا نسخة بلا تاريخ، ولا تاريخ بلا نسخة.
alter table public.profiles
  add constraint chk_profiles_terms_pair
  check ((terms_accepted_at is null) = (terms_version is null));

-- ══ الاكتمال — نظير `isProfileComplete` في lib/auth/account-state.ts ══
-- منسوخة من الهجرة ٠٣٧ بشرطٍ واحد زائد: النسخة الحالية من الشروط.
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
    and p.terms_version = '2026-09-17',
    false
  );
$$;
