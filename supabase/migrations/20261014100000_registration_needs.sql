-- ══════════════════════════════════════════════════════════════════════
-- رحلة التسجيل ت٦ — الموانع برموز (المراجعة ح٢)
--
-- صفحة التسجيل تطلب ما يُستكمل (اسم الجد · رقم الهوية · جوال الوليّ · الجوال السعودي)
-- في الصفحة نفسها، وتقول ما لا يُستكمل (الجنس · العمر) بلطف. فتحتاج **الرمز** لا نصّاً
-- حرّاً تحلّله. والحكم واحد: `fn_registration_blockers` (التي يرفع بها `fn_register`)
-- صارت تقرأ من هذه الدالة، فلا يختلف المعروض عن المفروض. والرسائل بلا إحالة إلى «حسابي».
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.fn_registration_needs(p_program_id uuid)
returns table (code text, message text)
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
begin
  if v_uid is null then
    code := 'signed_out'; message := 'سجّل الدخول أولاً'; return next; return;
  end if;

  select min_age, allowed_gender, require_saudi_phone, require_identity
    into v_program
    from public.programs
   where id = p_program_id and deleted_at is null;
  if not found then
    code := 'unavailable'; message := 'البرنامج غير متاح'; return next; return;
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
    code := 'gender';
    message := case v_program.allowed_gender when 'male' then 'هذا البرنامج للذكور' else 'هذا البرنامج للإناث' end;
    return next;
  end if;

  if v_program.min_age is not null and (v_age is null or v_age < v_program.min_age) then
    code := 'age';
    message := format('أدنى عمرٍ للتسجيل %s سنوات', v_program.min_age);
    return next;
  end if;

  if v_program.require_saudi_phone and coalesce(v_profile.phone, '') !~ '^\+9665[0-9]{8}$' then
    code := 'saudi_phone'; message := 'يُشترط جوالٌ سعودي يبدأ بـ05'; return next;
  end if;

  if v_program.require_identity then
    if btrim(coalesce(v_profile.grandfather_name, '')) = '' then
      code := 'grandfather_name'; message := 'أكمل اسمك الرباعي (اسم الجد)'; return next;
    end if;
    if v_identity.national_id is null then
      code := 'national_id'; message := 'أضف رقم هويتك أو إقامتك'; return next;
    end if;
    if v_age is not null and v_age < 18 and v_identity.guardian_phone is null then
      code := 'guardian_phone'; message := 'أضف جوال وليّ أمرك — مطلوبٌ لمن دون 18 سنة'; return next;
    end if;
  end if;
end;
$$;

revoke all on function public.fn_registration_needs(uuid) from public;
grant execute on function public.fn_registration_needs(uuid) to authenticated;

-- الرسائل نفسها بترتيبها — مصدرٌ واحد للعرض والإنفاذ.
create or replace function public.fn_registration_blockers(p_program_id uuid)
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(n.message order by n.ord), '{}'::text[])
  from public.fn_registration_needs(p_program_id) with ordinality as n(code, message, ord);
$$;
