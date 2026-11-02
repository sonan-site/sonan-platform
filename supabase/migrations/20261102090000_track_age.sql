-- ══════════════════════════════════════════════════════════════════════
-- أدنى عمر وأعلى عمر لكل مسار (adr/0047 · مواءمة الجدول الزمني، ٢ نوفمبر)
--
-- بالسنوات الكاملة يوم التسجيل بتوقيت الرياض — الحساب نفسه في «أدنى عمر» البرنامج،
-- وصار دالةً واحدة يقرأ منها الجميع. والفارغ بلا حدّ، والأعلى شامل (١٥ يدخل مساراً
-- أعلاه ١٥، و١٦ لا).
--
-- الإنفاذ مشغّلٌ على `participants` لا في `fn_register` وحده: سياسة
-- `participants_self_register` تسمح بالإدراج المباشر، ويُسنَد المسار لاحقاً من
-- فراغ (`assignTrack`). والنقل من مسارٍ إلى مسار خارج النطاق بقرار الراعي.
-- ══════════════════════════════════════════════════════════════════════

alter table public.tracks
  add column min_age int,
  add column max_age int,
  add constraint chk_tracks_min_age check (min_age is null or min_age between 1 and 100),
  add constraint chk_tracks_max_age check (max_age is null or max_age between 1 and 100),
  add constraint chk_tracks_age_range check (min_age is null or max_age is null or min_age <= max_age);

comment on column public.tracks.min_age is
  'adr/0047 | أدنى عمرٍ للتسجيل في المسار بالسنوات الكاملة يوم التسجيل. فارغ = بلا حدّ.';
comment on column public.tracks.max_age is
  'adr/0047 | أعلى عمرٍ للتسجيل في المسار، شامل: من بلغه يدخل، ومن تجاوزه بسنةٍ كاملة لا. فارغ = بلا حدّ.';

-- ══ ١ · العمر — مصدرٌ واحد ══

create function public.fn_age_years(p_birth date)
returns int
language sql
stable
set search_path = ''
as $$
  select case
    when p_birth is null then null
    else date_part('year', age((now() at time zone 'Asia/Riyadh')::date, p_birth))::int
  end;
$$;

comment on function public.fn_age_years(date) is
  'adr/0047 | العمر بالسنوات الكاملة اليوم بتوقيت الرياض — حساب أهلية البرنامج والمسار معاً.';

-- عمرٌ مجهول لا يناسب مساراً له حدّ، ويناسب ما لا حدّ له.
create function public.fn_age_fits(p_min int, p_max int, p_age int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_min is null and p_max is null)
      or (p_age is not null
          and (p_min is null or p_age >= p_min)
          and (p_max is null or p_age <= p_max));
$$;

comment on function public.fn_age_fits(int, int, int) is
  'adr/0047 | هل يقع العمر في حدّ المسار؟ الحدّان شاملان، والفارغ بلا حدّ.';

-- تستدعيهما دوالٌّ بصلاحية المستدعي (fn_registration_needs · fn_my_tracks_for_age):
-- بلا منحٍ لـ authenticated ينكسر التسجيل كله (مراجعة الخطة ح١).
revoke all on function public.fn_age_years(date) from public;
grant execute on function public.fn_age_years(date) to authenticated;
revoke all on function public.fn_age_fits(int, int, int) from public;
grant execute on function public.fn_age_fits(int, int, int) to authenticated;

-- ══ ٢ · الإنفاذ ══

create function public.fn_guard_participant_track_age()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_track record;
  v_birth date;
begin
  if new.track_id is null then
    return new;
  end if;
  -- التحديث: الإسناد من فراغ وحده. والنقل من مسارٍ إلى مسار خارج النطاق (البند ١١).
  if tg_op = 'UPDATE' and old.track_id is not null then
    return new;
  end if;
  -- صفّ غيره بلا صلاحية: يُترك للسياسة ترفضه بسببها. والمشغّل يعمل قبل `WITH CHECK`
  -- وبصلاحية المالك، فلو فحص لكشف فرقُ الرسالتين شريحةَ عمر غيره (مراجعة البناء ١).
  if (select auth.uid()) is not null
     and new.user_id is distinct from (select auth.uid())
     and not public.fn_has_permission('participants.write', new.program_id) then
    return new;
  end if;

  select min_age, max_age into v_track from public.tracks where id = new.track_id;
  if v_track.min_age is null and v_track.max_age is null then
    return new;
  end if;

  select birth_date into v_birth
  from public.profiles
  where user_id = new.user_id and deleted_at is null;

  if not public.fn_age_fits(v_track.min_age, v_track.max_age, public.fn_age_years(v_birth)) then
    raise exception 'عمر المشارك خارج حدّ هذا المسار' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_participant_track_age() from public;

-- الاسم يسبق `capacity` أبجدياً فيعمل قبله: الرفض بالعمر لا يأخذ قفل السعة،
-- ولا يقول «اكتمل العدد» لمن سببه عمره.
create trigger trg_participants_age_fit
  before insert or update of track_id on public.participants
  for each row execute function public.fn_guard_participant_track_age();

-- ══ ٣ · العرض: ما يناسب عمر المسجِّل ══

create function public.fn_my_tracks_for_age(p_program_id uuid)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id
  from public.tracks t
  where t.program_id = p_program_id
    and t.deleted_at is null
    and public.fn_age_fits(
      t.min_age,
      t.max_age,
      public.fn_age_years((
        select p.birth_date from public.profiles p
        where p.user_id = (select auth.uid()) and p.deleted_at is null
      ))
    );
$$;

comment on function public.fn_my_tracks_for_age(uuid) is
  'adr/0047 | مسارات البرنامج الحيّة التي يناسبها عمر المسجِّل — صفحة التسجيل تُخفي ما سواها.';

revoke all on function public.fn_my_tracks_for_age(uuid) from public;
grant execute on function public.fn_my_tracks_for_age(uuid) to authenticated;

-- ══ ٤ · المتطلبات: لا مسار لعمرك ══

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
  v_too_young boolean := false;
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

  v_age := public.fn_age_years(v_profile.birth_date);

  if v_program.allowed_gender is not null
     and v_profile.gender is distinct from v_program.allowed_gender then
    code := 'gender';
    message := case v_program.allowed_gender when 'male' then 'هذا البرنامج للذكور' else 'هذا البرنامج للإناث' end;
    return next;
  end if;

  if v_program.min_age is not null and (v_age is null or v_age < v_program.min_age) then
    v_too_young := true;
    code := 'age';
    message := format('أدنى عمرٍ للتسجيل %s سنوات', v_program.min_age);
    return next;
  end if;

  -- بعد حدّ البرنامج لا معه — فلا تُقال رسالتان للسبب نفسه. والعمر المجهول لا يُقال له «عمرك».
  if not v_too_young and v_age is not null
     and exists (
       select 1 from public.tracks t
       where t.program_id = p_program_id and t.deleted_at is null
     )
     and not exists (
       select 1 from public.tracks t
       where t.program_id = p_program_id and t.deleted_at is null
         and public.fn_age_fits(t.min_age, t.max_age, v_age)
     ) then
    code := 'no_track_for_age';
    message := 'لا يتاح لعمرك أي مسار في هذه المسابقة';
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
