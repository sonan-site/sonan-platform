-- ══════════════════════════════════════════════════════════════════════
-- سؤال القبول «اختيار واحد من قائمة» (خطة سؤال القائمة، ٢ نوفمبر · adr/0047)
--
-- الخيارات تُحفظ مع السؤال بترتيبها، والجواب نصّ الخيار. ولأن الجواب نصّ، تُقفل الخيارات
-- بعد أول إجابة: لا يُغيَّر خيارٌ ولا يُحذف ولا يُغيَّر النوع — وتُضاف الخيارات في الآخر.
-- وعدد من اختار كل خيار يُقرأ في الإعدادات (fn_admission_option_counts).
-- ══════════════════════════════════════════════════════════════════════

-- خياراتٌ صالحة: ٢–٣٠، كلٌّ ١–٨٠ حرفاً مشذَّباً، بلا تكرار.
create function public.fn_admission_options_valid(p_options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_options) between 2 and 30
     and not exists (
       select 1 from unnest(p_options) o
       where o is null or o <> btrim(o) or char_length(o) not between 1 and 80
     )
     and (select count(distinct o) from unnest(p_options) o) = cardinality(p_options);
$$;

revoke all on function public.fn_admission_options_valid(text[]) from public, anon;
-- يقرؤها القيد بصلاحية من يكتب السؤال (المشرف من الإعدادات).
grant execute on function public.fn_admission_options_valid(text[]) to authenticated;

alter table public.admission_questions
  add column options text[],
  add constraint chk_admission_questions_options check (
    (kind = 'list') = (options is not null)
    and (options is null or public.fn_admission_options_valid(options))
  );

comment on column public.admission_questions.options is
  'خيارات سؤال القائمة بترتيب عرضها — للنوع list وحده. تُقفل بعد أول إجابة إلا الإضافة في آخرها.';

-- ══ القفل بعد أول إجابة ══

create function public.fn_guard_admission_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind is not distinct from old.kind and new.options is not distinct from old.options then
    return new;
  end if;
  -- أسئلة القائمة وحدها: الأنواع الأخرى يبقى تغييرها كما كان (مراجعة الخطة ٣).
  if old.kind <> 'list' and new.kind <> 'list' then
    return new;
  end if;
  if not exists (
    select 1 from public.admission_answers a
    join public.participants p on p.id = a.participant_id
    where a.question_id = old.id and a.deleted_at is null and p.deleted_at is null
  ) then
    return new;
  end if;
  -- المسموح وحده: النوع كما هو، والخيارات القديمة كما هي في أولها.
  if new.kind = old.kind and old.kind = 'list'
     and cardinality(new.options) >= cardinality(old.options)
     and new.options[1:cardinality(old.options)] = old.options then
    return new;
  end if;
  raise exception 'للسؤال إجابات — لا يُغيَّر نوعه ولا خياراته، وتُضاف الخيارات في آخرها'
    using errcode = '23514';
end;
$$;

revoke all on function public.fn_guard_admission_options() from public, anon;

create trigger trg_admission_questions_options_lock
  before update of kind, options on public.admission_questions
  for each row execute function public.fn_guard_admission_options();

-- ══ العدّ ══

create function public.fn_admission_option_counts(p_program_id uuid)
returns table (question_id uuid, option text, ordinal int, answered int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('participants.read', p_program_id) then
    raise exception 'لا صلاحية لقراءة المشاركين' using errcode = '42501';
  end if;
  return query
    select q.id, o.option, o.ordinal::int,
           (select count(*)::int
            from public.admission_answers a
            join public.participants p on p.id = a.participant_id
            where a.question_id = q.id and a.answer = o.option
              and a.deleted_at is null and p.deleted_at is null)
    from public.admission_questions q
    cross join lateral unnest(q.options) with ordinality as o(option, ordinal)
    where q.program_id = p_program_id and q.deleted_at is null and q.kind = 'list'
    order by q.sort_order, q.created_at, o.ordinal;
end;
$$;

comment on function public.fn_admission_option_counts(uuid) is
  'عدد المشاركين الأحياء الذين اختاروا كل خيار من أسئلة القائمة — لمن يقرأ المشاركين.';

revoke all on function public.fn_admission_option_counts(uuid) from public, anon;
grant execute on function public.fn_admission_option_counts(uuid) to authenticated;

-- ══ التسجيل: القائمة في صرامة الشكل ══

create or replace function public.fn_register(
  p_program_id uuid,
  p_track_id   uuid,
  p_answers    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
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

  -- ظهور البرنامج كما كانت سياستا قراءته تحكمانه للمستدعي — والمالك يرى كل شيء، فلولا هذا
  -- لكشفت رسائل الموانع والأسئلة إعدادات برنامجٍ مسودّة أو مُغلق (مراجعة البناء ١).
  if not exists (
    select 1 from public.programs p
    where p.id = p_program_id
      and ((p.status = 'published' and p.deleted_at is null) or public.fn_has_permission('programs.read', p.id))
  ) then
    raise exception 'البرنامج غير متاح' using errcode = '23514';
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

  -- صرامة الشكل (adr/0047): «نعم/لا» لا يقبل غيرهما، والإقرار لا يمرّ إلا مُقرّاً، والقائمة خياراتها.
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
      -- القائمة: خيارٌ من خياراتها بنصّه.
      or (q.kind = 'list' and not (btrim(v_answers ->> q.id::text) = any (q.options)))
    );

  if v_bad is not null then
    raise exception 'إجابةٌ بغير الصيغة المقبولة: %', v_bad using errcode = '23514';
  end if;

  -- ما كانت سياسة `participants_self_register` تفحصه، في موضعها نفسه: قبيل الإدراج، بعد
  -- الموانع والمسار والأسئلة. و«ممتلئ» يُترك لمشغّل السعة فيقول «اكتمل العدد» كما كان —
  -- والسياسة تُقيَّم بعد المشغّلات فلم تكن تقوله. و42501 رمز رفض السياسة نفسه، فيقول
  -- الإجراء رسالته العامة كما كان (مراجعة الخطة ١).
  if not public.fn_is_active()
     or coalesce(public.fn_registration_state(p_program_id), 'closed') not in ('open', 'full') then
    raise exception 'التسجيل غير متاح' using errcode = '42501';
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
