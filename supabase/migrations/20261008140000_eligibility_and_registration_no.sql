-- 074 | أهلية البرنامج ورقم التسجيل وصرامة أجوبة القبول (adr/0047)
--
-- ١ · أعمدة الأهلية والبادئة على `programs`، ورقم التسجيل على `participants`.
-- ٢ · `fn_registration_blockers`: موانع تسجيل المستدعي في برنامج — **مصدرٌ واحد**
--     تقرؤه صفحة التسجيل قبل النموذج، ويرفض به `fn_register`. فلا يختلف المعروض
--     عن المفروض.
-- ٣ · `fn_register`: الموانع، وصرامة «نعم/لا» والإقرار، ورقم التسجيل تحت قفل السعة.
--
-- تراجع: نعم — إعادة `fn_register` من الهجرة ٠٧٠، وحذف الدالة والأعمدة.

-- ══ ١ · البنية ══
alter table public.programs
  add column min_age int,
  add column allowed_gender public.gender,
  add column require_saudi_phone boolean not null default false,
  add column require_identity boolean not null default false,
  add column registration_prefix text,
  add constraint chk_programs_min_age check (min_age is null or min_age between 1 and 100),
  add constraint chk_programs_registration_prefix
    check (registration_prefix is null or registration_prefix ~ '^[A-Za-z0-9-]{1,20}$');

comment on column public.programs.min_age is
  'أدنى عمرٍ بالسنوات الكاملة يوم التسجيل بتوقيت الرياض (adr/0047). فارغ = بلا حدّ.';
comment on column public.programs.registration_prefix is
  'بادئة رقم التسجيل (SN-1448). فارغ = لا رقم يُعرض.';

alter table public.participants add column registration_no int;

create unique index uq_participants_registration_no
  on public.participants (program_id, registration_no)
  where registration_no is not null;

comment on column public.participants.registration_no is
  'متسلسلٌ في البرنامج (adr/0047)، يُسند تحت قفل السعة ولا يُعاد بعد انسحاب.';

-- ══ ١ب · إسناد رقم التسجيل ══
-- مشغّلٌ `security definer`: المسجِّل لا يرى صفوف غيره بسياستها، فالعدّ في دالته
-- لا يرى إلا نفسه. والقفل نفسه الذي يأخذه حارس السعة — فلا يتكرّر الرقم تحت
-- التزامن. والرقم لا يُعاد بعد انسحاب: الأعلى بين الصفوف كلها، المحذوفة معها.
create or replace function public.fn_assign_registration_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ولا يكتبه المسجِّل بنفسه: طلبُ مستخدمٍ يُستبدل رقمه دائماً (والدالة definer،
  -- فـ`current_user` فيها مالكها — الهوية من الجلسة).
  if new.registration_no is null or (select auth.uid()) is not null then
    perform pg_advisory_xact_lock(hashtextextended('participants:' || new.program_id::text, 0));
    select coalesce(max(registration_no), 0) + 1
      into new.registration_no
      from public.participants
     where program_id = new.program_id;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_assign_registration_no() from public;

create trigger trg_participants_registration_no before insert on public.participants
  for each row execute function public.fn_assign_registration_no();

-- ══ ٢ · الموانع ══
/**
 * لماذا لا يستطيع المستدعي التسجيل في البرنامج — مصفوفة رسائل، فارغة = لا مانع.
 * `security invoker`: يقرأ ملفّه وهويته بسياستيهما، فلا يكشف شيئاً عن غيره.
 * والعمر بالسنوات الكاملة **يوم التسجيل** بتوقيت الرياض.
 */
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
    v_out := v_out || case v_program.allowed_gender
      when 'male' then 'هذا البرنامج للذكور'
      else 'هذا البرنامج للإناث'
    end;
  end if;

  if v_program.min_age is not null and (v_age is null or v_age < v_program.min_age) then
    v_out := v_out || format('أدنى عمرٍ للتسجيل %s سنوات', v_program.min_age);
  end if;

  if v_program.require_saudi_phone and coalesce(v_profile.phone, '') !~ '^\+9665[0-9]{8}$' then
    v_out := v_out || 'يُشترط جوالٌ سعودي يبدأ بـ05 — عدّله من «حسابي»';
  end if;

  if v_program.require_identity then
    if btrim(coalesce(v_profile.grandfather_name, '')) = '' then
      v_out := v_out || 'أكمل اسمك الرباعي (اسم الجد) من «حسابي»';
    end if;
    if v_identity.national_id is null then
      v_out := v_out || 'أضف رقم هويتك أو إقامتك من «حسابي»';
    end if;
    if v_age is not null and v_age < 18 and v_identity.guardian_phone is null then
      v_out := v_out || 'أضف جوال وليّ أمرك من «حسابي» — مطلوبٌ لمن دون 18 سنة';
    end if;
  end if;

  return v_out;
end;
$$;

revoke all on function public.fn_registration_blockers(uuid) from public;
grant execute on function public.fn_registration_blockers(uuid) to authenticated;

-- ══ ٣ · التسجيل ══
create or replace function public.fn_register(
  p_program_id uuid,
  p_track_id   uuid,
  p_answers    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_answers     jsonb := coalesce(p_answers, '{}'::jsonb);
  v_blockers    text[];
  v_missing     text;
  v_bad         text;
  v_participant uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;

  -- الأهلية (adr/0047): أول مانعٍ يُقال، والصفحة عرضتها كلها قبل النموذج.
  v_blockers := public.fn_registration_blockers(p_program_id);
  if cardinality(v_blockers) > 0 then
    raise exception '%', v_blockers[1] using errcode = '23514';
  end if;

  if p_track_id is null and exists (
    select 1 from public.tracks where program_id = p_program_id and deleted_at is null
  ) then
    raise exception 'اختر مسارك في البرنامج' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_each_text(v_answers) where char_length(value) > 2000
  ) then
    raise exception 'إحدى الإجابات أطول من المسموح (2000 حرف)' using errcode = '23514';
  end if;

  -- الأسئلة التي تخصّه: العامّة وأسئلة مساره.
  select string_agg(q.question, ' · ' order by q.sort_order)
  into v_missing
  from public.admission_questions q
  where q.program_id = p_program_id
    and q.deleted_at is null
    and q.is_required
    and (q.track_id is null or q.track_id = p_track_id)
    and btrim(coalesce(v_answers ->> q.id::text, '')) = '';

  if v_missing is not null then
    raise exception 'أجب عن الأسئلة الإلزامية: %', v_missing using errcode = '23514';
  end if;

  -- صرامة الشكل (adr/0047): «نعم/لا» لا يقبل غيرهما، والإقرار لا يمرّ إلا مُقرّاً.
  select string_agg(q.question, ' · ' order by q.sort_order)
  into v_bad
  from public.admission_questions q
  where q.program_id = p_program_id
    and q.deleted_at is null
    and (q.track_id is null or q.track_id = p_track_id)
    and btrim(coalesce(v_answers ->> q.id::text, '')) <> ''
    and (
      (q.kind = 'choice' and btrim(v_answers ->> q.id::text) not in ('نعم', 'لا'))
      or (q.kind = 'consent' and btrim(v_answers ->> q.id::text) <> 'أقرّ')
    );

  if v_bad is not null then
    raise exception 'إجابةٌ بغير الصيغة المقبولة: %', v_bad using errcode = '23514';
  end if;

  -- رقم التسجيل يُسنده مشغّله (`fn_assign_registration_no`) — يرى صفوف البرنامج كلها.
  insert into public.participants (user_id, program_id, track_id)
  values (v_uid, p_program_id, p_track_id)
  returning id into v_participant;

  insert into public.admission_answers (participant_id, question_id, answer)
  select v_participant, q.id, btrim(v_answers ->> q.id::text)
  from public.admission_questions q
  where q.program_id = p_program_id
    and q.deleted_at is null
    and (q.track_id is null or q.track_id = p_track_id)
    and btrim(coalesce(v_answers ->> q.id::text, '')) <> '';

  perform public.fn_write_audit(
    'participant_registered', 'participants', v_participant, null,
    jsonb_build_object('program_id', p_program_id, 'track_id', p_track_id)
  );

  return v_participant;
end;
$$;

revoke all on function public.fn_register(uuid, uuid, jsonb) from public;
grant execute on function public.fn_register(uuid, uuid, jsonb) to authenticated;
