-- نسخة الشروط والخصوصية ٢٠٢٦-١١-٠٣ (النصّ المفصّل ببنوده المرقّمة — `docs/reviews/2026-10-26-مسودة-الشروط-والخصوصية.md`).
-- الدالة كما هي حيّةً حرفاً (الهجرة `20261015100000`)، والنسخة وحدها تتغيّر — ونظيرها `TERMS_VERSION` في
-- `lib/legal/terms.ts`، واختبار التكافؤ `lib/auth/profile-details.db-test.ts`. فيُطلب القبول من كل حساب مرة (`adr/0028`).
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
    and p.terms_version = '2026-11-03',
    false
  );
$$;
