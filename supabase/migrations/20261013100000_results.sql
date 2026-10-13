-- ══════════════════════════════════════════════════════════════════════
-- الدفعة د · النتائج والجوائز والنشر (adr/0048 هـ · المراجعة §١١)
--
-- النتيجة لقطةٌ تُعتمد لكل مسار ثم تُنشر — لا حسابٌ حيّ يراه المشارك.
-- وما اعتُمد لا يتغيّر بتعديلٍ لاحق إلا بسحب الاعتماد بسببٍ مدقَّق:
-- القفل في حرّاسٍ على الجداول نفسها، فيُغلق كل طريق كتابةٍ لا دالةً دالة.
-- ══════════════════════════════════════════════════════════════════════

-- ══ ١ · المسار يُثبَّت عند القرار (ح٢) ══
alter table public.exam_eligibility add column track_id uuid references public.tracks (id) on delete restrict;
comment on column public.exam_eligibility.track_id is
  'د | مسار المشارك لحظة قرار الفرز — الترتيب يقرأ منه، والمسار لا يتغيّر بعد الحسم.';

create or replace function public.fn_eligibility_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision is not null and new.track_id is null then
    new.track_id := (select track_id from public.participants where id = new.participant_id);
  end if;
  return new;
end;
$$;
revoke all on function public.fn_eligibility_track() from public, anon, authenticated;
create trigger trg_exam_eligibility_track before insert or update of decision on public.exam_eligibility
  for each row execute function public.fn_eligibility_track();
-- ما حُسم قبل هذه الهجرة يُثبَّت مساره الآن — وإلا غاب متأهّلوه عن الترتيب بصمت.
update public.exam_eligibility x set track_id = pa.track_id
from public.participants pa
where pa.id = x.participant_id and x.decision is not null and x.track_id is null;

-- العتبتان: من لم يجتز لا يُرشَّح للجائزة.
alter table public.exams add constraint chk_exams_award_over_pass
  check (award_percentage is null or award_percentage >= pass_percentage) not valid;
alter table public.exams validate constraint chk_exams_award_over_pass;

-- ══ ٢ · الغياب (د٥) ══
alter table public.session_participants
  add column absent_at timestamptz,
  add column absent_reason text,
  add column absent_by uuid references auth.users (id) on delete restrict,
  add constraint chk_session_participants_absent
    check ((absent_at is null) = (absent_reason is null));
comment on column public.session_participants.absent_at is
  'د | غاب عن جلسته. لا يُحكَّم، ويُعوَّض بنقله لجلسةٍ أخرى ما لم يُعتمد مساره — وإلا نتيجته «غاب».';

-- ══ ٣ · الجداول ══
create table public.exam_track_results (
  id               uuid primary key default gen_random_uuid(),
  exam_id          uuid not null references public.exams (id) on delete restrict,
  track_id         uuid not null references public.tracks (id) on delete restrict,
  pass_percentage  numeric(5,2) not null,
  award_percentage numeric(5,2) not null,
  prizes_block_id  uuid references public.page_blocks (id) on delete restrict,
  places           jsonb not null default '[]'::jsonb,
  approved_by      uuid not null references auth.users (id) on delete restrict,
  approved_at      timestamptz not null default now(),
  published_by     uuid references auth.users (id) on delete restrict,
  published_at     timestamptz,
  withdraw_reason  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
comment on table public.exam_track_results is
  'د | اعتماد نتائج مسارٍ في اختبار: العتبتان والجوائز مجمّدةً لحظته، ونشره. والسحب أرشفةٌ بسبب.';
create unique index uq_exam_track_results on public.exam_track_results (exam_id, track_id) where deleted_at is null;
create trigger trg_exam_track_results_updated_at before update on public.exam_track_results
  for each row execute function public.fn_set_updated_at();
alter table public.exam_track_results enable row level security;

create table public.exam_results (
  id               uuid primary key default gen_random_uuid(),
  track_result_id  uuid not null references public.exam_track_results (id) on delete restrict,
  exam_id          uuid not null references public.exams (id) on delete restrict,
  track_id         uuid not null references public.tracks (id) on delete restrict,
  participant_id   uuid not null references public.participants (id) on delete restrict,
  full_name        text not null,
  registration_no  int,
  percent          numeric(5,2),
  outcome          text not null,
  place            int,
  prize_label      text,
  prize_value      text,
  tiebreak_id      uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- لا يُؤرشف صفٌّ بعينه: سحب الاعتماد يؤرشف رأسه (exam_track_results) فتغيب صفوفه معه.
  deleted_at       timestamptz,
  constraint chk_exam_results_outcome check (outcome in ('passed', 'not_passed', 'absent')),
  constraint chk_exam_results_place check (place is null or place between 1 and 10)
);
comment on table public.exam_results is
  'د | نتيجة المشارك كما اعتُمدت: النسبة والنتيجة والمركز والجائزة — ويُحفظ الاسم ورقم التسجيل للشهادات.';
create unique index uq_exam_results on public.exam_results (track_result_id, participant_id);
create index idx_exam_results_participant on public.exam_results (participant_id);
create trigger trg_exam_results_updated_at before update on public.exam_results
  for each row execute function public.fn_set_updated_at();
alter table public.exam_results enable row level security;

create table public.exam_tiebreaks (
  id              uuid primary key default gen_random_uuid(),
  exam_id         uuid not null references public.exams (id) on delete restrict,
  track_id        uuid not null references public.tracks (id) on delete restrict,
  percent         numeric(5,2) not null,
  participant_ids uuid[] not null,
  ordered_ids     uuid[] not null,
  reason          text not null,
  raw_scores      text not null default '',
  recorded_by     uuid not null references auth.users (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint chk_exam_tiebreaks_reason check (char_length(btrim(reason)) between 3 and 300),
  constraint chk_exam_tiebreaks_raw check (char_length(raw_scores) <= 500)
);
comment on table public.exam_tiebreaks is
  'د | جولة حسم التعادل: إعادة اختبارٍ خارج المنصة بين المتعادلين وحدهم، تُسجَّل بترتيبها ولا تغيّر الدرجة. تبطل إن تغيّرت مجموعة المتعادلين.';
create unique index uq_exam_tiebreaks on public.exam_tiebreaks (exam_id, track_id, percent) where deleted_at is null;
alter table public.exam_results add constraint fk_exam_results_tiebreak
  foreign key (tiebreak_id) references public.exam_tiebreaks (id) on delete restrict;
create trigger trg_exam_tiebreaks_updated_at before update on public.exam_tiebreaks
  for each row execute function public.fn_set_updated_at();
alter table public.exam_tiebreaks enable row level security;

-- قراءةٌ لإدارة الاختبارات وناشرها وحدهما — لا المحكّم (م٩). ولا كتابة مباشرة.
create policy exam_track_results_read on public.exam_track_results for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id
                   and ((select public.fn_has_permission('exams.manage', e.program_id))
                        or (select public.fn_has_permission('exams.publish', e.program_id)))));
create policy exam_results_read on public.exam_results for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id
                   and ((select public.fn_has_permission('exams.manage', e.program_id))
                        or (select public.fn_has_permission('exams.publish', e.program_id)))));
create policy exam_tiebreaks_read on public.exam_tiebreaks for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id
                   and ((select public.fn_has_permission('exams.manage', e.program_id))
                        or (select public.fn_has_permission('exams.publish', e.program_id)))));
revoke all on public.exam_track_results, public.exam_results, public.exam_tiebreaks from anon, authenticated, service_role;
grant select on public.exam_track_results, public.exam_results, public.exam_tiebreaks to authenticated;

-- ══ ٤ · الصلاحية الجديدة (د٨) ══
-- الناشر يقرأ تعريف الاختبار ليفتح صفحة نتائجه وتصديرها.
drop policy exams_read on public.exams;
create policy exams_read on public.exams
  for select to authenticated
  using (
    (select public.fn_has_permission('programs.read', program_id))
    or (select public.fn_has_permission('exams.manage', program_id))
    or (select public.fn_has_permission('exams.judge', program_id))
    or (select public.fn_has_permission('exams.publish', program_id))
  );

insert into public.role_permissions (role_id, permission_code)
select r.id, 'exams.publish'
from public.roles r
where r.is_system = true and r.deleted_at is null
on conflict do nothing;

-- ══ ٥ · القفل (د٧ · م١) ══
/** مفتاح القفل الاستشاري لمسارٍ في اختبار: حصريٌّ في الاعتماد والنشر، ومشتركٌ في الحرّاس. */
create or replace function public.fn_results_lock_key(p_exam_id uuid, p_track_id uuid)
returns bigint language sql immutable set search_path = '' as $$
  select hashtextextended(p_exam_id::text || ':' || coalesce(p_track_id::text, ''), 48);
$$;
revoke all on function public.fn_results_lock_key(uuid, uuid) from public, anon, authenticated;

/** اعتُمدت نتائج مسار هذا المشارك في هذا الاختبار؟ يأخذ القفل المشترك فلا يسابق الاعتماد. */
create or replace function public.fn_results_locked(p_exam_id uuid, p_participant_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_track uuid;
begin
  select x.track_id into v_track from public.exam_eligibility x
  where x.exam_id = p_exam_id and x.participant_id = p_participant_id and x.deleted_at is null;
  if v_track is null then
    return false;
  end if;
  perform pg_advisory_xact_lock_shared(public.fn_results_lock_key(p_exam_id, v_track));
  return exists (select 1 from public.exam_track_results r
                  where r.exam_id = p_exam_id and r.track_id = v_track and r.deleted_at is null);
end;
$$;
revoke all on function public.fn_results_locked(uuid, uuid) from public, anon, authenticated;

create or replace function public.fn_guard_results_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam uuid;
  v_part uuid;
begin
  if tg_table_name = 'session_participants' then
    v_exam := (select exam_id from public.exam_sessions where id = new.session_id);
    v_part := new.participant_id;
  elsif tg_table_name = 'judge_evaluations' then
    -- غير المعتمد لا يدخل الدرجة: أرشفته (إخراج محكّم) لا تمسّ المعتمَد.
    if tg_op = 'UPDATE' and old.approved_at is null and new.approved_at is null then
      return new;
    end if;
    v_exam := (select exam_id from public.exam_sessions where id = new.session_id);
    v_part := new.participant_id;
    -- الغائب لا يُحكَّم (د٥).
    if tg_op = 'INSERT' then
      perform 1 from public.session_participants sp
      where sp.session_id = new.session_id and sp.participant_id = new.participant_id and sp.deleted_at is null
      for share;
    end if;
    if tg_op = 'INSERT' and exists (
      select 1 from public.session_participants sp
      where sp.session_id = new.session_id and sp.participant_id = new.participant_id
        and sp.deleted_at is null and sp.absent_at is not null) then
      raise exception 'سُجّل غيابه — لا يُحكَّم' using errcode = '23514';
    end if;
  elsif tg_table_name = 'evaluation_answers' then
    select s.exam_id, je.participant_id into v_exam, v_part
    from public.judge_evaluations je join public.exam_sessions s on s.id = je.session_id
    where je.id = new.evaluation_id;
  elsif tg_table_name = 'evaluation_deductions' then
    select s.exam_id, je.participant_id into v_exam, v_part
    from public.evaluation_answers ea
    join public.judge_evaluations je on je.id = ea.evaluation_id
    join public.exam_sessions s on s.id = je.session_id
    where ea.id = new.evaluation_answer_id;
  elsif tg_table_name = 'exam_eligibility' then
    v_exam := new.exam_id;
    v_part := new.participant_id;
  end if;

  if v_exam is not null and public.fn_results_locked(v_exam, v_part) then
    raise exception 'اعتُمدت نتائج مساره — اسحب الاعتماد أولاً' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_guard_results_lock() from public, anon, authenticated;

create trigger trg_session_participants_results_lock before insert or update on public.session_participants
  for each row execute function public.fn_guard_results_lock();
create trigger trg_judge_evaluations_results_lock before insert or update on public.judge_evaluations
  for each row execute function public.fn_guard_results_lock();
create trigger trg_evaluation_answers_results_lock before insert or update on public.evaluation_answers
  for each row execute function public.fn_guard_results_lock();
create trigger trg_evaluation_deductions_results_lock before insert or update on public.evaluation_deductions
  for each row execute function public.fn_guard_results_lock();
create trigger trg_exam_eligibility_results_lock before update of decision, decision_source on public.exam_eligibility
  for each row execute function public.fn_guard_results_lock();

-- إعدادات الدرجة لا تتغيّر ومسارٌ معتمد — ولا بالمخرج الإداري (ح٤).
create or replace function public.fn_guard_exam_results_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.pass_percentage is distinct from old.pass_percentage
      or new.award_percentage is distinct from old.award_percentage
      or new.judge_count is distinct from old.judge_count
      or new.question_count is distinct from old.question_count
      or new.eligibility_at is distinct from old.eligibility_at
      or new.deleted_at is distinct from old.deleted_at)
     and exists (select 1 from public.exam_track_results r where r.exam_id = old.id and r.deleted_at is null) then
    raise exception 'اعتُمدت نتائج مسارٍ في هذا الاختبار — اسحب الاعتماد قبل تغيير إعدادات الدرجة' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_guard_exam_results_settings() from public, anon, authenticated;
create trigger trg_exams_results_settings before update on public.exams
  for each row execute function public.fn_guard_exam_results_settings();

-- حذف جلسةٍ فيها مشاركون أو تقييمات يُسقطهم من الدرجات بصمت (ح١).
create or replace function public.fn_guard_session_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and (exists (select 1 from public.session_participants where session_id = old.id and deleted_at is null)
          or exists (select 1 from public.judge_evaluations where session_id = old.id and deleted_at is null)) then
    raise exception 'في الجلسة مشاركون أو تقييمات — انقلهم أولاً' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_guard_session_delete() from public, anon, authenticated;
create trigger trg_exam_sessions_guard_delete before update of deleted_at on public.exam_sessions
  for each row execute function public.fn_guard_session_delete();

-- ══ ٦ · حالة المشارك ومساره (د٩ · ح٢ · ح٣ · م٣) ══
/**
 * الكتابة المباشرة (دور `authenticated` عبر الواجهة البرمجية) لا تتجاوز `registered/memorizing`
 * إدراجاً ولا تعديلاً. **بصلاحية المستدعي** — فـ`current_user` يميّز الكتابة المباشرة من دوالّ
 * الفرز والنشر (وهي بصلاحية مالكها). وبلا مستخدمٍ (صيانةٌ أو اختبار) لا يُفحص.
 */
create or replace function public.fn_guard_participant_direct_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_comp public.participant_status[] := array['qualified', 'not_qualified', 'passed', 'not_passed']::public.participant_status[];
begin
  if current_user <> 'authenticated' or (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status = any (v_comp) then
      raise exception 'المشارك يبدأ مسجَّلاً — حالات المسابقة تُكتب من الفرز والنشر' using errcode = '23514';
    end if;
  elsif new.status is distinct from old.status and (new.status = any (v_comp) or old.status = any (v_comp)) then
    raise exception 'حالات المسابقة تُكتب من الفرز والنشر — لا من تعديل المشارك' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_guard_participant_direct_status() from public, anon;
create trigger trg_participants_direct_status before insert or update of status on public.participants
  for each row execute function public.fn_guard_participant_direct_status();

/**
 * - `passed/not_passed` دخولاً وخروجاً لا تُكتب إلا من النشر وسحبه (`app.exam_results`).
 * - المسار لا يتغيّر لمن حُسم فرزه.
 * - الانسحاب والحذف بعد اعتماد مساره مرفوضان.
 * بلا مستخدمٍ (صيانةٌ أو اختبار) لا يُفحص.
 */
create or replace function public.fn_guard_participant_competition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp  public.participant_status[] := array['qualified', 'not_qualified', 'passed', 'not_passed']::public.participant_status[];
  v_final public.participant_status[] := array['passed', 'not_passed']::public.participant_status[];
  v_flag  boolean := coalesce(current_setting('app.exam_results', true), '') = '1';
  x       record;
begin
  if (select auth.uid()) is null or tg_op = 'INSERT' then
    return new;
  end if;

  if new.status is distinct from old.status
     and (new.status = any (v_final) or old.status = any (v_final)) and not v_flag then
    raise exception 'الاجتياز وعدمه يُكتبان من نشر النتائج وحده' using errcode = '23514';
  end if;

  -- لا يصير متأهلاً من لا لقطة أهلية له — وإلا أُسند وحُكِّم ثم غاب عن النتائج.
  if new.status = 'qualified' and old.status is distinct from 'qualified'
     and not exists (select 1 from public.exam_eligibility where participant_id = new.id and deleted_at is null) then
    raise exception 'لا لقطة أهلية له — احسب الأهلية قبل تأهيله' using errcode = '23514';
  end if;

  if new.track_id is distinct from old.track_id and old.status = any (v_comp) then
    raise exception 'حُسم فرزه — لا يتغيّر مساره' using errcode = '23514';
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    -- بين الاعتماد والنشر وحده: بعد النشر النتيجة محفوظةٌ في اللقطة، فيُغلق حسابه إن شاء.
    for x in select exam_id from public.exam_eligibility where participant_id = old.id and deleted_at is null loop
      if public.fn_results_locked(x.exam_id, old.id)
         and exists (select 1 from public.exam_track_results r
                      join public.exam_eligibility e on e.exam_id = r.exam_id and e.track_id = r.track_id
                      where r.exam_id = x.exam_id and e.participant_id = old.id and e.deleted_at is null
                        and r.deleted_at is null and r.published_at is null) then
        raise exception 'اعتُمدت نتائج مساره ولم تُنشر — لا ينسحب ولا يُحذف حتى تُنشر' using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_guard_participant_competition() from public, anon, authenticated;
create trigger trg_participants_competition before update on public.participants
  for each row execute function public.fn_guard_participant_competition();

-- سحب النشر يعيد `qualified` — ولا يُعاد ضبط لحظة بدء التقييم لذلك (م٤).
create or replace function public.fn_participant_judge_from()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.judge_from := coalesce(new.joined_at, now());
  elsif new.track_id is distinct from old.track_id
     or (public.fn_follows_plan(new.status) and not public.fn_follows_plan(old.status)
         and coalesce(current_setting('app.exam_results', true), '') <> '1') then
    new.judge_from := now();
  else
    new.judge_from := old.judge_from;
  end if;
  return new;
end;
$$;

-- ══ ٧ · الدرجة النهائية (م٥ · ح٣ · تحسين) ══
drop function public.fn_final_scores(uuid);

/** الدرجة لكل متأهّل — بمنزلتين، من التقييمات المعتمدة بعدد اللجنة. والمسار من لقطة الفرز. */
create or replace function public.fn_final_scores(p_exam_id uuid, p_track_id uuid default null)
returns table (
  participant_id uuid, full_name text, registration_no int, track_id uuid, session_name text,
  absent boolean, judges int, approved int, final_score numeric, max_score numeric, percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
begin
  select * into e from public.exams where id = p_exam_id;
  if e.id is null or not (public.fn_has_permission('exams.manage', e.program_id)
                          or public.fn_has_permission('exams.publish', e.program_id)) then
    raise exception 'لا تملك عرض الدرجات' using errcode = '42501';
  end if;
  return query
    with base as (
      select sp.participant_id, s.name as sname, sp.absent_at is not null as absent,
             (select count(distinct je.judge_id)::int from public.judge_evaluations je
               where je.session_id = sp.session_id and je.participant_id = sp.participant_id
                 and je.approved_at is not null and je.deleted_at is null) as na,
             (select avg(public.fn_evaluation_total(je.id)) from public.judge_evaluations je
               where je.session_id = sp.session_id and je.participant_id = sp.participant_id
                 and je.approved_at is not null and je.deleted_at is null) as avg_total,
             (select coalesce(sum(q.score), 0) from public.questions q where q.id = any(sp.question_ids)) as mx
      from public.session_participants sp
      join public.exam_sessions s on s.id = sp.session_id and s.deleted_at is null
      left join public.exam_eligibility x0 on x0.exam_id = p_exam_id and x0.participant_id = sp.participant_id and x0.deleted_at is null
      where s.exam_id = p_exam_id and sp.deleted_at is null
        and (p_track_id is null
             or coalesce(x0.track_id, (select pa0.track_id from public.participants pa0 where pa0.id = sp.participant_id)) = p_track_id)
    )
    select b.participant_id, pr.full_name, pa.registration_no, coalesce(x.track_id, pa.track_id), b.sname, b.absent,
           e.judge_count, b.na,
           case when b.na >= e.judge_count then round(b.avg_total, 2) end,
           b.mx,
           case when b.na >= e.judge_count and b.mx > 0 then round(100.0 * b.avg_total / b.mx, 2) end
    from base b
    join public.participants pa on pa.id = b.participant_id and pa.deleted_at is null
    join public.profiles pr on pr.user_id = pa.user_id
    left join public.exam_eligibility x on x.exam_id = p_exam_id and x.participant_id = b.participant_id and x.deleted_at is null
    where p_track_id is null or coalesce(x.track_id, pa.track_id) = p_track_id
    order by 4, 11 desc nulls last, pa.registration_no;
end;
$$;
revoke all on function public.fn_final_scores(uuid, uuid) from public;
grant execute on function public.fn_final_scores(uuid, uuid) to authenticated;

-- ══ ٨ · الجوائز من الصفحة (د٢ · م٧) ══
/**
 * عنصر جوائز المسار: واحدٌ غير مؤرشف بـ`trackId` المسار، ١–١٠ مراكز بتسميةٍ وقيمة.
 * يُرجع المعرّف والمراكز، أو سبب الرفض (والعنصر العام لا يُقرأ).
 */
create or replace function public.fn_track_prizes(p_exam_id uuid, p_track_id uuid)
returns table (block_id uuid, places jsonb, problem text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_n   int;
  b     record;
begin
  select count(*) into v_n from public.page_blocks pb join public.exams e on e.program_id = pb.program_id
  where e.id = p_exam_id and pb.block_type = 'prizes' and pb.deleted_at is null
    and pb.content ->> 'trackId' = p_track_id::text;
  if v_n = 0 then
    block_id := null; places := '[]'::jsonb; problem := 'لا عنصر جوائز لهذا المسار في صفحة البرنامج';
    return next; return;
  end if;
  if v_n > 1 then
    block_id := null; places := '[]'::jsonb; problem := 'للمسار أكثر من عنصر جوائز — أبقِ واحداً';
    return next; return;
  end if;
  select pb.id, coalesce(pb.content -> 'places', '[]'::jsonb) as pl into b
  from public.page_blocks pb join public.exams e on e.program_id = pb.program_id
  where e.id = p_exam_id and pb.block_type = 'prizes' and pb.deleted_at is null
    and pb.content ->> 'trackId' = p_track_id::text;
  block_id := b.id;
  places := b.pl;
  problem := case
    when jsonb_typeof(b.pl) <> 'array' or jsonb_array_length(b.pl) = 0 then 'عنصر جوائز المسار بلا مراكز'
    when jsonb_array_length(b.pl) > 10 then 'الجوائز عشرٌ لكل مسار لا تزيد'
    when exists (select 1 from jsonb_array_elements(b.pl) p
                  where btrim(coalesce(p ->> 'label', '')) = '' or btrim(coalesce(p ->> 'value', '')) = '')
      then 'في عنصر الجوائز مركزٌ بلا تسمية أو قيمة'
  end;
  return next;
end;
$$;
revoke all on function public.fn_track_prizes(uuid, uuid) from public, anon, authenticated;

-- ══ ٩ · الترتيب (د١ · د٣) ══
/**
 * ترتيب مسارٍ حيّاً: نطاقه متأهّلو المسار من لقطة الفرز (ح١) — المُسنَد وغيره.
 * النتيجة: pending (لم تكتمل درجته أو لم يُسنَد) · absent · passed · not_passed.
 * المرشّح للجائزة مجتازٌ بلغ `award_percentage`، ويُرتَّب بين المرشّحين وحدهم.
 * كل مجموعةٍ متعادلة يقع أعلاها في المراكز تحتاج حسماً (قرار الراعي ١٣ أكتوبر)،
 * والحسم صالحٌ ما دامت مجموعته هي هي.
 */
create or replace function public.fn_standings_unchecked(p_exam_id uuid, p_track_id uuid)
returns table (
  participant_id uuid, full_name text, registration_no int, session_name text, assigned boolean,
  approved int, percent numeric, outcome text, candidate boolean,
  base_rank int, tie_size int, needs_tiebreak boolean, tiebreak_id uuid, place int,
  prize_label text, prize_value text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e        record;
  v_places jsonb;
  v_n      int;
begin
  select * into e from public.exams where id = p_exam_id;
  select coalesce(tp.places, '[]'::jsonb) into v_places from public.fn_track_prizes(p_exam_id, p_track_id) tp;
  if jsonb_typeof(v_places) <> 'array' then
    v_places := '[]'::jsonb;
  end if;
  v_n := least(jsonb_array_length(v_places), 10);

  return query
    with scope as (
      select x.participant_id from public.exam_eligibility x
      join public.participants pa on pa.id = x.participant_id and pa.deleted_at is null
      where x.exam_id = p_exam_id and x.deleted_at is null and x.decision is true and x.track_id = p_track_id
    ),
    fs as (
      select f0.participant_id, f0.approved, f0.percent from public.fn_final_scores(p_exam_id, p_track_id) f0
    ),
    scored as (
      select s.participant_id, pr.full_name, pa.registration_no,
             sp.sname, sp.id is not null as assigned, coalesce(sp.absent, false) as absent,
             coalesce(f.approved, 0) as approved, f.percent
      from scope s
      join public.participants pa on pa.id = s.participant_id
      join public.profiles pr on pr.user_id = pa.user_id
      left join lateral (
        select sp0.id, es.name as sname, sp0.absent_at is not null as absent
        from public.session_participants sp0
        join public.exam_sessions es on es.id = sp0.session_id and es.deleted_at is null
        where es.exam_id = p_exam_id and sp0.participant_id = s.participant_id and sp0.deleted_at is null
        limit 1
      ) sp on true
      left join fs f on f.participant_id = s.participant_id
    ),
    judged as (
      select sc.*,
             case when sc.absent then 'absent'
                  when sc.percent is null then 'pending'
                  when sc.percent >= e.pass_percentage then 'passed'
                  else 'not_passed' end as oc
      from scored sc
    ),
    ranked as (
      select j.*,
             (j.oc = 'passed' and j.percent >= e.award_percentage) as cand
      from judged j
    ),
    cands as (
      select r.participant_id, r.percent,
             (rank() over (order by r.percent desc))::int as r0,
             (count(*) over (partition by r.percent))::int as gsize,
             array_agg(r.participant_id) over (partition by r.percent) as gids
      from ranked r where r.cand
    ),
    resolved as (
      select c.*,
             tb.id as tb_id,
             tb.ordered_ids
      from cands c
      left join public.exam_tiebreaks tb
        on tb.exam_id = p_exam_id and tb.track_id = p_track_id and tb.percent = c.percent and tb.deleted_at is null
       and c.gsize > 1
       and tb.participant_ids @> c.gids and tb.participant_ids <@ c.gids
    ),
    placed as (
      select rs.participant_id, rs.r0, rs.gsize,
             (rs.gsize > 1 and rs.r0 <= v_n and rs.tb_id is null) as ntb,
             rs.tb_id,
             case when rs.gsize = 1 then rs.r0
                  when rs.tb_id is not null then rs.r0 + array_position(rs.ordered_ids, rs.participant_id) - 1
             end as pl
      from resolved rs
    )
    select r.participant_id, r.full_name, r.registration_no, r.sname, r.assigned,
           r.approved, r.percent, r.oc, r.cand,
           p.r0, p.gsize, coalesce(p.ntb, false), p.tb_id,
           case when p.pl <= v_n then p.pl end,
           case when p.pl <= v_n then v_places -> (p.pl - 1) ->> 'label' end,
           case when p.pl <= v_n then v_places -> (p.pl - 1) ->> 'value' end
    from ranked r left join placed p on p.participant_id = r.participant_id
    order by r.cand desc, r.percent desc nulls last, p.pl nulls last, r.registration_no;
end;
$$;
revoke all on function public.fn_standings_unchecked(uuid, uuid) from public, anon, authenticated;

create or replace function public.fn_track_standings(p_exam_id uuid, p_track_id uuid)
returns table (
  participant_id uuid, full_name text, registration_no int, session_name text, assigned boolean,
  approved int, percent numeric, outcome text, candidate boolean,
  base_rank int, tie_size int, needs_tiebreak boolean, tiebreak_id uuid, place int,
  prize_label text, prize_value text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program uuid := (select program_id from public.exams where id = p_exam_id and exam_type = 'oral');
begin
  if v_program is null or not (public.fn_has_permission('exams.manage', v_program)
                               or public.fn_has_permission('exams.publish', v_program)) then
    raise exception 'لا تملك عرض النتائج' using errcode = '42501';
  end if;
  return query select * from public.fn_standings_unchecked(p_exam_id, p_track_id);
end;
$$;
revoke all on function public.fn_track_standings(uuid, uuid) from public;
grant execute on function public.fn_track_standings(uuid, uuid) to authenticated;

/** لكل مسارٍ فيه متأهّلون: أعداده وما ينقص اعتماده، واعتماده ونشره. */
create or replace function public.fn_results_overview(p_exam_id uuid)
returns table (
  track_id uuid, track_name text, qualified int, scored int, pending int, unassigned int, absent int,
  ties int, places int, prizes_problem text, approved_at timestamptz, published_at timestamptz,
  changed_prizes boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program uuid := (select program_id from public.exams where id = p_exam_id and exam_type = 'oral');
  t         record;
  r         record;
  tp        record;
begin
  if v_program is null or not (public.fn_has_permission('exams.manage', v_program)
                               or public.fn_has_permission('exams.publish', v_program)) then
    raise exception 'لا تملك عرض النتائج' using errcode = '42501';
  end if;
  for t in
    select distinct x.track_id as id, tr.name, tr.sort_order
    from public.exam_eligibility x join public.tracks tr on tr.id = x.track_id
    join public.participants pa on pa.id = x.participant_id and pa.deleted_at is null
    where x.exam_id = p_exam_id and x.deleted_at is null and x.decision is true
    order by tr.sort_order, tr.name
  loop
    select count(*)::int as q,
           count(*) filter (where s.outcome in ('passed', 'not_passed'))::int as sc,
           count(*) filter (where s.outcome = 'pending' and s.assigned)::int as pe,
           count(*) filter (where not s.assigned)::int as un,
           count(*) filter (where s.outcome = 'absent')::int as ab,
           count(distinct s.percent) filter (where s.needs_tiebreak)::int as ti
      into r from public.fn_standings_unchecked(p_exam_id, t.id) s;
    select * into tp from public.fn_track_prizes(p_exam_id, t.id);
    track_id := t.id;
    track_name := t.name;
    qualified := r.q; scored := r.sc; pending := r.pe; unassigned := r.un; absent := r.ab; ties := r.ti;
    places := case when jsonb_typeof(tp.places) = 'array' then jsonb_array_length(tp.places) else 0 end;
    prizes_problem := tp.problem;
    select a.approved_at, a.published_at,
           (a.prizes_block_id is distinct from tp.block_id or a.places is distinct from tp.places)
      into approved_at, published_at, changed_prizes
    from public.exam_track_results a
    where a.exam_id = p_exam_id and a.track_id = t.id and a.deleted_at is null;
    if not found then
      approved_at := null; published_at := null; changed_prizes := false;
    end if;
    return next;
  end loop;
end;
$$;
revoke all on function public.fn_results_overview(uuid) from public;
grant execute on function public.fn_results_overview(uuid) to authenticated;

-- ══ ١٠ · الغياب (د٥ · م٢) ══
create or replace function public.fn_mark_absent(p_session_id uuid, p_participant_id uuid, p_absent boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s    record;
  v_sp record;
begin
  select es.*, e.program_id into s from public.exam_sessions es join public.exams e on e.id = es.exam_id
  where es.id = p_session_id and es.deleted_at is null;
  if s.id is null or not public.fn_has_permission('exams.manage', s.program_id) then
    raise exception 'لا تملك إدارة هذه الجلسة' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر السبب' using errcode = '23514';
  end if;
  select * into v_sp from public.session_participants
  where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null
  for update;
  if v_sp.id is null then
    raise exception 'المشارك ليس في هذه الجلسة' using errcode = '23514';
  end if;
  if p_absent and exists (select 1 from public.judge_evaluations
                           where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null) then
    raise exception 'قُيِّم في الجلسة — لا يُسجَّل غيابه' using errcode = '23514';
  end if;

  update public.session_participants
     set absent_at = case when p_absent then now() end,
         absent_reason = case when p_absent then btrim(p_reason) end,
         absent_by = case when p_absent then (select auth.uid()) end
   where id = v_sp.id;
  perform public.fn_write_audit(case when p_absent then 'participant_marked_absent' else 'absence_cleared' end,
    'session_participants', v_sp.id, null,
    jsonb_build_object('session_id', p_session_id, 'participant_id', p_participant_id, 'reason', btrim(p_reason)));

  -- الجلسة تُقفل إن اكتمل غير الغائبين (م٢).
  if p_absent then
    perform public.fn_close_session_if_complete(p_session_id);
  else
    -- حاضرٌ عاد ولم يُقيَّم: الجلسة جاريةٌ ثانية.
    update public.exam_sessions set status = 'in_progress', closed_at = null
    where id = p_session_id and status = 'closed';
  end if;
end;
$$;

/** تُقفل الجلسة حين يكتمل لكل حاضرٍ فيها عدد اللجنة من التقييمات المعتمدة. */
create or replace function public.fn_close_session_if_complete(p_session_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit int := (select e.judge_count from public.exam_sessions s join public.exams e on e.id = s.exam_id where s.id = p_session_id);
begin
  if exists (select 1 from public.session_participants sp
              where sp.session_id = p_session_id and sp.deleted_at is null and sp.absent_at is null)
     and not exists (
    select 1 from public.session_participants sp
    where sp.session_id = p_session_id and sp.deleted_at is null and sp.absent_at is null
      and (select count(distinct x.judge_id) from public.judge_evaluations x
            where x.session_id = p_session_id and x.participant_id = sp.participant_id
              and x.approved_at is not null and x.deleted_at is null) < v_limit
  ) then
    update public.exam_sessions set status = 'closed', closed_at = coalesce(closed_at, now())
    where id = p_session_id and status <> 'closed';
  end if;
end;
$$;
revoke all on function public.fn_close_session_if_complete(uuid) from public, anon, authenticated;
revoke all on function public.fn_mark_absent(uuid, uuid, boolean, text) from public;
grant execute on function public.fn_mark_absent(uuid, uuid, boolean, text) to authenticated;

-- الاعتماد يُقفل الجلسة باكتمال الحاضرين — الغائب لا يُبقيها مفتوحة.
create or replace function public.fn_judge_approve(p_session_id uuid, p_participant_id uuid, p_judge_id uuid default null, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_judge uuid := public.fn_evaluation_judge(p_session_id, p_judge_id);
  je      record;
  v_need  int;
begin
  if v_judge <> (select auth.uid()) and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر سبب الاعتماد عن المحكّم' using errcode = '23514';
  end if;
  select * into je from public.judge_evaluations
  where session_id = p_session_id and judge_id = v_judge and participant_id = p_participant_id and deleted_at is null;
  select cardinality(question_ids) into v_need from public.session_participants
  where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null;
  if je.id is null or coalesce(v_need, 0) = 0
     or (select count(*) from public.evaluation_answers where evaluation_id = je.id and deleted_at is null) < v_need then
    raise exception 'قيّم الأسئلة كلها قبل الاعتماد' using errcode = '23514';
  end if;
  update public.judge_evaluations set approved_at = coalesce(approved_at, now()) where id = je.id;
  if v_judge <> (select auth.uid()) then
    insert into public.retroactive_entries (evaluation_id, entered_by, reason)
    values (je.id, (select auth.uid()), 'اعتماد: ' || btrim(p_reason));
  end if;

  perform public.fn_close_session_if_complete(p_session_id);
  return public.fn_judge_sheet(p_session_id, p_participant_id, p_judge_id);
end;
$$;

-- شاشة المحكّم تُظهر الغائب (م٢).
drop function public.fn_judge_session(uuid, uuid);
create or replace function public.fn_judge_session(p_session_id uuid, p_judge_id uuid default null)
returns table (
  participant_id uuid, full_name text, registration_no int, track_name text, sort_order int,
  evaluated int, total int, approved boolean, absent boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_judge uuid := public.fn_evaluation_judge(p_session_id, p_judge_id);
begin
  return query
    select sp.participant_id, pr.full_name, pa.registration_no, t.name, sp.sort_order,
           (select count(*)::int from public.evaluation_answers ea where ea.evaluation_id = je.id and ea.deleted_at is null),
           cardinality(sp.question_ids),
           je.approved_at is not null,
           sp.absent_at is not null
    from public.session_participants sp
    join public.participants pa on pa.id = sp.participant_id
    join public.profiles pr on pr.user_id = pa.user_id
    left join public.tracks t on t.id = pa.track_id
    left join public.judge_evaluations je
      on je.session_id = sp.session_id and je.participant_id = sp.participant_id
     and je.judge_id = v_judge and je.deleted_at is null
    where sp.session_id = p_session_id and sp.deleted_at is null
    order by sp.sort_order;
end;
$$;
revoke all on function public.fn_judge_session(uuid, uuid) from public;
grant execute on function public.fn_judge_session(uuid, uuid) to authenticated;

-- ══ ١١ · جولة الحسم (د٤) ══
create or replace function public.fn_record_tiebreak(
  p_exam_id uuid, p_track_id uuid, p_percent numeric, p_ordered uuid[], p_reason text, p_raw text default ''
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program uuid := (select program_id from public.exams where id = p_exam_id and exam_type = 'oral' and deleted_at is null for share);
  v_group   uuid[];
  v_id      uuid;
begin
  if v_program is null or not public.fn_has_permission('exams.manage', v_program) then
    raise exception 'لا تملك تسجيل الحسم' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر وصف جولة الحسم' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(public.fn_results_lock_key(p_exam_id, p_track_id));
  if exists (select 1 from public.exam_track_results where exam_id = p_exam_id and track_id = p_track_id and deleted_at is null) then
    raise exception 'اعتُمدت نتائج المسار — اسحب الاعتماد أولاً' using errcode = '23514';
  end if;

  select array_agg(s.participant_id order by s.participant_id) into v_group
  from public.fn_standings_unchecked(p_exam_id, p_track_id) s
  where s.candidate and s.percent = p_percent;
  if coalesce(cardinality(v_group), 0) < 2 then
    raise exception 'لا تعادل على هذه النسبة' using errcode = '23514';
  end if;
  if cardinality(p_ordered) <> cardinality(v_group)
     or not (p_ordered @> v_group and p_ordered <@ v_group)
     or (select count(distinct u) from unnest(p_ordered) u) <> cardinality(v_group) then
    raise exception 'رتّب المتعادلين كلهم، كلّاً مرةً واحدة' using errcode = '23514';
  end if;

  update public.exam_tiebreaks set deleted_at = now()
  where exam_id = p_exam_id and track_id = p_track_id and percent = p_percent and deleted_at is null;
  insert into public.exam_tiebreaks (exam_id, track_id, percent, participant_ids, ordered_ids, reason, raw_scores, recorded_by)
  values (p_exam_id, p_track_id, p_percent, v_group, p_ordered, btrim(p_reason), coalesce(p_raw, ''), (select auth.uid()))
  returning id into v_id;
  perform public.fn_write_audit('tiebreak_recorded', 'exam_tiebreaks', v_id, null,
    jsonb_build_object('exam_id', p_exam_id, 'track_id', p_track_id, 'percent', p_percent,
                       'ordered', to_jsonb(p_ordered), 'reason', btrim(p_reason)));
  return v_id;
end;
$$;
revoke all on function public.fn_record_tiebreak(uuid, uuid, numeric, uuid[], text, text) from public;
grant execute on function public.fn_record_tiebreak(uuid, uuid, numeric, uuid[], text, text) to authenticated;

-- ══ ١٢ · الاعتماد وسحبه (د٦) ══
create or replace function public.fn_approve_track_results(p_exam_id uuid, p_track_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e      record;
  tp     record;
  r      record;
  v_id   uuid;
  v_n    int;
begin
  -- قفلٌ مشترك على تعريف الاختبار: لا تتغيّر العتبتان بين قراءتهما والحساب بهما.
  select * into e from public.exams where id = p_exam_id and exam_type = 'oral' and deleted_at is null for share;
  if e.id is null or not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك اعتماد النتائج' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(public.fn_results_lock_key(p_exam_id, p_track_id));
  if e.award_percentage is null then
    raise exception 'حدّد نسبة أهلية الجائزة في إعدادات الاختبار' using errcode = '23514';
  end if;
  if e.sorted_at is null then
    raise exception 'لم يُحسم الفرز بعد' using errcode = '23514';
  end if;
  if exists (select 1 from public.exam_track_results where exam_id = p_exam_id and track_id = p_track_id and deleted_at is null) then
    raise exception 'اعتُمدت نتائج هذا المسار' using errcode = '23514';
  end if;
  select * into tp from public.fn_track_prizes(p_exam_id, p_track_id);
  if tp.problem is not null then
    raise exception '%', tp.problem using errcode = '23514';
  end if;

  select count(*) filter (where not s.assigned)::int as un,
         count(*) filter (where s.assigned and s.outcome = 'pending')::int as pe,
         count(distinct s.percent) filter (where s.needs_tiebreak)::int as ti,
         count(*)::int as n
    into r from public.fn_standings_unchecked(p_exam_id, p_track_id) s;
  if r.n = 0 then
    raise exception 'لا متأهّلين في هذا المسار' using errcode = '23514';
  end if;
  if r.un > 0 then
    raise exception 'لم يُسنَد % من متأهّلي المسار إلى جلسة', r.un using errcode = '23514';
  end if;
  if r.pe > 0 then
    raise exception 'لم تكتمل درجة % — يعتمدها عدد اللجنة أو يُسجَّل غيابه', r.pe using errcode = '23514';
  end if;
  if r.ti > 0 then
    raise exception 'في المسار تعادلٌ يمسّ المراكز بلا حسم (%)', r.ti using errcode = '23514';
  end if;

  insert into public.exam_track_results (exam_id, track_id, pass_percentage, award_percentage, prizes_block_id, places, approved_by)
  values (p_exam_id, p_track_id, e.pass_percentage, e.award_percentage, tp.block_id, tp.places, (select auth.uid()))
  returning id into v_id;
  insert into public.exam_results (track_result_id, exam_id, track_id, participant_id, full_name, registration_no,
                                   percent, outcome, place, prize_label, prize_value, tiebreak_id)
  select v_id, p_exam_id, p_track_id, s.participant_id, s.full_name, s.registration_no,
         s.percent, s.outcome, s.place, s.prize_label, s.prize_value, s.tiebreak_id
  from public.fn_standings_unchecked(p_exam_id, p_track_id) s;
  get diagnostics v_n = row_count;

  perform public.fn_write_audit('results_approved', 'exam_track_results', v_id, null,
    jsonb_build_object('exam_id', p_exam_id, 'track_id', p_track_id, 'participants', v_n));
  return v_n;
end;
$$;
revoke all on function public.fn_approve_track_results(uuid, uuid) from public;
grant execute on function public.fn_approve_track_results(uuid, uuid) to authenticated;

create or replace function public.fn_withdraw_track_results(p_exam_id uuid, p_track_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program uuid := (select program_id from public.exams where id = p_exam_id);
  a         record;
begin
  if v_program is null or not public.fn_has_permission('exams.manage', v_program) then
    raise exception 'لا تملك سحب الاعتماد' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر سبب السحب' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(public.fn_results_lock_key(p_exam_id, p_track_id));
  select * into a from public.exam_track_results where exam_id = p_exam_id and track_id = p_track_id and deleted_at is null;
  if a.id is null then
    raise exception 'لم تُعتمد نتائج هذا المسار' using errcode = '23514';
  end if;
  if a.published_at is not null then
    raise exception 'نُشرت النتائج — اسحب النشر أولاً' using errcode = '23514';
  end if;
  update public.exam_track_results set deleted_at = now(), withdraw_reason = btrim(p_reason) where id = a.id;
  perform public.fn_write_audit('results_approval_withdrawn', 'exam_track_results', a.id, null,
    jsonb_build_object('exam_id', p_exam_id, 'track_id', p_track_id, 'reason', btrim(p_reason)));
end;
$$;
revoke all on function public.fn_withdraw_track_results(uuid, uuid, text) from public;
grant execute on function public.fn_withdraw_track_results(uuid, uuid, text) to authenticated;

-- ══ ١٣ · النشر وسحبه (د٨) ══
/**
 * ينشر مساراً — أو كل المسارات معاً إن لم يُحدَّد (ذرّياً، ويشترط اعتمادها كلها).
 * ويكتب حالة المشارك في المعاملة نفسها: `passed` أو `not_passed` (والغائب لم يجتز).
 */
create or replace function public.fn_publish_results(p_exam_id uuid, p_track_id uuid default null)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program uuid := (select program_id from public.exams where id = p_exam_id and exam_type = 'oral' and deleted_at is null);
  t         record;
  a         record;
  v_n       int := 0;
begin
  if v_program is null or not public.fn_has_permission('exams.publish', v_program) then
    raise exception 'لا تملك نشر النتائج' using errcode = '42501';
  end if;
  perform set_config('app.exam_results', '1', true);
  for t in
    select distinct x.track_id as id from public.exam_eligibility x
    join public.participants pa on pa.id = x.participant_id and pa.deleted_at is null
    where x.exam_id = p_exam_id and x.deleted_at is null and x.decision is true
      and (p_track_id is null or x.track_id = p_track_id)
    order by 1
  loop
    perform pg_advisory_xact_lock(public.fn_results_lock_key(p_exam_id, t.id));
    select * into a from public.exam_track_results where exam_id = p_exam_id and track_id = t.id and deleted_at is null;
    if a.id is null then
      raise exception 'لم تُعتمد نتائج كل المسارات — يُنشر المعتمد مساراً مساراً' using errcode = '23514';
    end if;
    continue when a.published_at is not null;
    update public.exam_track_results set published_at = now(), published_by = (select auth.uid()) where id = a.id;
    update public.participants pa
       set status = case when r.outcome = 'passed' then 'passed'::public.participant_status
                         else 'not_passed'::public.participant_status end
      from public.exam_results r
     where r.track_result_id = a.id and pa.id = r.participant_id;
    perform public.fn_write_audit('results_published', 'exam_track_results', a.id, null,
      jsonb_build_object('exam_id', p_exam_id, 'track_id', t.id));
    v_n := v_n + 1;
  end loop;
  perform set_config('app.exam_results', '', true);
  if v_n = 0 and p_track_id is not null and not exists (
       select 1 from public.exam_track_results where exam_id = p_exam_id and track_id = p_track_id
         and deleted_at is null and published_at is not null) then
    raise exception 'لم تُعتمد نتائج هذا المسار' using errcode = '23514';
  end if;
  return v_n;
end;
$$;
revoke all on function public.fn_publish_results(uuid, uuid) from public;
grant execute on function public.fn_publish_results(uuid, uuid) to authenticated;

create or replace function public.fn_unpublish_results(p_exam_id uuid, p_track_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program uuid := (select program_id from public.exams where id = p_exam_id);
  a         record;
begin
  if v_program is null or not public.fn_has_permission('exams.publish', v_program) then
    raise exception 'لا تملك سحب النشر' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر سبب السحب' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(public.fn_results_lock_key(p_exam_id, p_track_id));
  select * into a from public.exam_track_results
  where exam_id = p_exam_id and track_id = p_track_id and deleted_at is null and published_at is not null;
  if a.id is null then
    raise exception 'لم تُنشر نتائج هذا المسار' using errcode = '23514';
  end if;
  perform set_config('app.exam_results', '1', true);
  update public.exam_track_results set published_at = null, published_by = null where id = a.id;
  update public.participants pa set status = 'qualified'
    from public.exam_results r
   where r.track_result_id = a.id and pa.id = r.participant_id and pa.status in ('passed', 'not_passed');
  perform set_config('app.exam_results', '', true);
  perform public.fn_write_audit('results_publication_withdrawn', 'exam_track_results', a.id, null,
    jsonb_build_object('exam_id', p_exam_id, 'track_id', p_track_id, 'reason', btrim(p_reason)));
end;
$$;
revoke all on function public.fn_unpublish_results(uuid, uuid, text) from public;
grant execute on function public.fn_unpublish_results(uuid, uuid, text) to authenticated;

-- ══ ١٤ · ما يراه المشارك (د١٠ · م١٠) ══
/**
 * بطاقة النهائي في «رحلتي» لمالكها وحده: بعد الفرز — تأهّله وجلسته؛ وبعد النشر وحده —
 * نتيجته ومركزه وجائزته. قبل الفرز لا شيء.
 */
create or replace function public.fn_my_final(p_participant_id uuid)
returns table (
  exam_id uuid, exam_name text, qualified boolean,
  session_name text, scheduled_at timestamptz, location text, absent boolean,
  published boolean, percent numeric, outcome text, place int, prize_label text, prize_value text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pa record;
begin
  select * into pa from public.participants
  where id = p_participant_id and deleted_at is null and user_id = (select auth.uid());
  if pa.id is null then
    return;
  end if;
  return query
    select e.id, e.name, x.decision,
           s.name, s.scheduled_at, s.location, sp.absent_at is not null,
           res.id is not null, res.percent, res.outcome, res.place, res.prize_label, res.prize_value
    from public.exams e
    join public.exam_eligibility x on x.exam_id = e.id and x.participant_id = pa.id and x.deleted_at is null
    left join lateral (
      select sp0.session_id, sp0.absent_at from public.session_participants sp0
      join public.exam_sessions es on es.id = sp0.session_id and es.deleted_at is null
      where es.exam_id = e.id and sp0.participant_id = pa.id and sp0.deleted_at is null
      limit 1
    ) sp on true
    left join public.exam_sessions s on s.id = sp.session_id
    left join lateral (
      select r.id, r.percent, r.outcome, r.place, r.prize_label, r.prize_value
      from public.exam_results r
      join public.exam_track_results a on a.id = r.track_result_id
      where r.exam_id = e.id and r.participant_id = pa.id
        and a.deleted_at is null and a.published_at is not null
      limit 1
    ) res on true
    where e.program_id = pa.program_id and e.deleted_at is null and e.exam_type = 'oral'
      and e.sorted_at is not null and x.decision is not null
    order by e.created_at;
end;
$$;
revoke all on function public.fn_my_final(uuid) from public;
grant execute on function public.fn_my_final(uuid) to authenticated;

-- ══ ١٥ · التصدير (د١١ · م٨ · قرار الراعي: بلا هوية) ══
create or replace function public.fn_export_results(p_exam_id uuid)
returns table (
  track_name text, place int, full_name text, registration_no int, percent numeric, outcome text,
  prize_label text, prize_value text, phone text, guardian_phone text, published boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program uuid := (select program_id from public.exams where id = p_exam_id and exam_type = 'oral');
  v_phones  boolean;
  v_n       int;
begin
  if v_program is null or not (public.fn_has_permission('exams.manage', v_program)
                               or public.fn_has_permission('exams.publish', v_program)) then
    raise exception 'لا تملك تصدير النتائج' using errcode = '42501';
  end if;
  v_phones := public.fn_has_permission('participants.read', v_program);
  select count(*) into v_n from public.exam_results r
  join public.exam_track_results a on a.id = r.track_result_id and a.deleted_at is null
  where r.exam_id = p_exam_id;
  perform public.fn_write_audit('exam_results_exported', 'exams', p_exam_id, null,
    jsonb_build_object('rows', v_n, 'phones', v_phones));
  return query
    select t.name, r.place, r.full_name, r.registration_no, r.percent, r.outcome,
           r.prize_label, r.prize_value,
           case when v_phones then pr.phone end,
           case when v_phones then pi.guardian_phone end,
           a.published_at is not null
    from public.exam_results r
    join public.exam_track_results a on a.id = r.track_result_id and a.deleted_at is null
    join public.tracks t on t.id = r.track_id
    left join public.participants pa on pa.id = r.participant_id
    left join public.profiles pr on pr.user_id = pa.user_id
    left join public.profile_identities pi on pi.user_id = pa.user_id and pi.deleted_at is null
    where r.exam_id = p_exam_id
    order by t.sort_order, t.name, r.place nulls last, r.percent desc nulls last, r.registration_no;
end;
$$;
revoke all on function public.fn_export_results(uuid) from public;
grant execute on function public.fn_export_results(uuid) to authenticated;
