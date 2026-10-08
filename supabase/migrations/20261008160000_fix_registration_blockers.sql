-- 076 | موانع التسجيل: إلحاقٌ صريح بالمصفوفة (إصلاح الهجرة ٠٧٤)
--
-- `v_out || 'نصّ'` يقرأ النصّ الحرفي مصفوفةً لا عنصراً، فيفشل بـ
-- «malformed array literal» عند أول مانعٍ نصّي. كشفه `eligibility.db-test.ts` في CI.
-- الدالة نفسها، و`array_append` بنصٍّ صريح النوع.
--
-- تراجع: نعم — تعريف الهجرة ٠٧٤.

create or replace function public.fn_registration_blockers(p_program_id uuid)
returns text[]
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_program  record;
  v_profile  record;
  v_identity record;
  v_age      int;
  v_out      text[] := '{}';
begin
  if v_uid is null then
    return array['سجّل الدخول أولاً'];
  end if;

  select min_age, allowed_gender, require_saudi_phone, require_identity
    into v_program
    from public.programs
   where id = p_program_id and deleted_at is null;
  if not found then
    return array['البرنامج غير متاح'];
  end if;

  select gender, birth_date, phone, grandfather_name
    into v_profile
    from public.profiles
   where user_id = v_uid and deleted_at is null;

  select national_id, guardian_phone
    into v_identity
    from public.profile_identities
   where user_id = v_uid and deleted_at is null;

  v_age := case
    when v_profile.birth_date is null then null
    else date_part('year', age((now() at time zone 'Asia/Riyadh')::date, v_profile.birth_date))::int
  end;

  if v_program.allowed_gender is not null
     and v_profile.gender is distinct from v_program.allowed_gender then
    v_out := array_append(v_out, (case v_program.allowed_gender
      when 'male' then 'هذا البرنامج للذكور'
      else 'هذا البرنامج للإناث'
    end)::text);
  end if;

  if v_program.min_age is not null and (v_age is null or v_age < v_program.min_age) then
    v_out := array_append(v_out, (format('أدنى عمرٍ للتسجيل %s سنوات', v_program.min_age))::text);
  end if;

  if v_program.require_saudi_phone and coalesce(v_profile.phone, '') !~ '^\+9665[0-9]{8}$' then
    v_out := array_append(v_out, ('يُشترط جوالٌ سعودي يبدأ بـ05 — عدّله من «حسابي»')::text);
  end if;

  if v_program.require_identity then
    if btrim(coalesce(v_profile.grandfather_name, '')) = '' then
      v_out := array_append(v_out, ('أكمل اسمك الرباعي (اسم الجد) من «حسابي»')::text);
    end if;
    if v_identity.national_id is null then
      v_out := array_append(v_out, ('أضف رقم هويتك أو إقامتك من «حسابي»')::text);
    end if;
    if v_age is not null and v_age < 18 and v_identity.guardian_phone is null then
      v_out := array_append(v_out, ('أضف جوال وليّ أمرك من «حسابي» — مطلوبٌ لمن دون 18 سنة')::text);
    end if;
  end if;

  return v_out;
end;
$$;

revoke all on function public.fn_registration_blockers(uuid) from public;
grant execute on function public.fn_registration_blockers(uuid) to authenticated;
