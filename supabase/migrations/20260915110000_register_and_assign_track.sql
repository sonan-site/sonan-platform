-- 032 | التسجيل فعلٌ واحد، وإسناد المسار تحت السعة
--
-- ١ · `[BR-ADM-01]` «إكمال الأسئلة الإلزامية = قبول فوري» كان مفروضاً في
--     التطبيق وحده: الإجراء يفحص الإجابات ثم يُدرج المشارك ثم الإجابات ثم
--     التدقيق، أربع كتابات منفصلة. طلبٌ مباشر يُدرج المشارك بلا إجابة، وفشل
--     الثالثة يترك مقبولاً بلا شرطه. `platform.md §٧`: ما يُفرض في التطبيق
--     فقط غير مفروض. فالأربع هنا في معاملة واحدة، والشرط قبلها.
--
-- ٢ · مشاركٌ بلا مسار لم تكن له شاشة تُسنده. والإسناد يمرّ بسعة المسار كما
--     يمرّ بها التسجيل — وإلا صار الإسناد باباً خلفياً لتجاوزها.
--
-- تراجع: نعم.

-- ══ ١ · التسجيل ══
/**
 * يسجّل المستدعي في برنامج بإجاباته، أو لا شيء.
 *
 * `security invoker`: سياسة التسجيل الذاتي ومشغّل السعة يعملان كما هما — الدالة
 * تجمع الخطوات ولا تتجاوز حارساً. والشرطان اللذان لا تقدر عليهما السياسة
 * (المسار حين يكون للبرنامج مسارات، والأسئلة الإلزامية) يُفحصان قبل أي كتابة.
 */
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
  v_missing     text;
  v_participant uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;

  if p_track_id is null and exists (
    select 1 from public.tracks where program_id = p_program_id and deleted_at is null
  ) then
    raise exception 'اختر مسارك في البرنامج' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_each_text(v_answers) where char_length(value) > 2000
  ) then
    raise exception 'إحدى الإجابات أطول من المسموح (٢٠٠٠ حرف)' using errcode = '23514';
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

-- ══ ٢ · السعة عند إسناد المسار ══
-- الدالة نفسها من الهجرة ٠٢٦، ويُضاف فرعُ التحديث: حين يُسنَد مسارٌ لمن لا
-- مسار له. تغيير مسارٍ قائم خارجها — ذلك قرار م-٤ المؤجَّل.
create or replace function public.fn_guard_participant_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity      int;
  v_count         int;
  v_track_deleted timestamptz;
begin
  if tg_op = 'UPDATE' then
    if old.track_id is not null or new.track_id is null then
      return new;
    end if;
  else
    -- تاريخ الالتحاق لا يختاره المسجِّل.
    if (select auth.uid()) is not null then
      new.joined_at := now();
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('participants:' || new.program_id::text, 0));

  if tg_op = 'INSERT' then
    select capacity into v_capacity from public.programs where id = new.program_id;
    if v_capacity is not null then
      select count(*) into v_count
      from public.participants
      where program_id = new.program_id and deleted_at is null;
      if v_count >= v_capacity then
        raise exception 'اكتمل العدد في هذا البرنامج' using errcode = '23514';
      end if;
    end if;
  end if;

  if new.track_id is not null then
    select capacity, deleted_at into v_capacity, v_track_deleted
    from public.tracks where id = new.track_id;

    if v_track_deleted is not null then
      raise exception 'هذا المسار غير متاح' using errcode = '23514';
    end if;

    if v_capacity is not null then
      select count(*) into v_count
      from public.participants
      where track_id = new.track_id and deleted_at is null and id <> new.id;
      if v_count >= v_capacity then
        raise exception 'اكتمل العدد في هذا المسار' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_participants_capacity_assign
  before update of track_id on public.participants
  for each row execute function public.fn_guard_participant_capacity();
