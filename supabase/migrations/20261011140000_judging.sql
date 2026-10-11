-- 081 | التحكيم من الجوال (adr/0048)
--
-- كل محكّمٍ يقيّم مشاركه **وحده**: لكل سؤالٍ يعلّم على معايير الخصم ولا يكتب
-- رقماً، ثم يعتمد فيُقفل تقييمه. **ولا يرى تقييم زميله** (`BR-SESS-03`) — في
-- القاعدة لا في الواجهة. والدرجة النهائية متوسط المحكّمين **بعد اعتمادهم
-- جميعاً** (`BR-SESS-02`)، محسوبةً لا مخزّنة.
--
-- **والبديل الورقي:** مدير الاختبارات يُدخل ورقة محكّمٍ باسمه بالدوالّ نفسها
-- (`p_judge_id`)، ويُسجَّل المُدخِل وسببه في `retroactive_entries`.
--
-- تراجع: نعم — حذف الجداول الأربعة والدوال.

-- ══ البنية ══
create table public.judge_evaluations (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.exam_sessions (id) on delete restrict,
  judge_id       uuid not null references auth.users (id) on delete restrict,
  participant_id uuid not null references public.participants (id) on delete restrict,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create unique index uq_judge_evaluations on public.judge_evaluations (session_id, judge_id, participant_id) where deleted_at is null;
create trigger trg_judge_evaluations_updated_at before update on public.judge_evaluations
  for each row execute function public.fn_set_updated_at();
alter table public.judge_evaluations enable row level security;

create table public.evaluation_answers (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.judge_evaluations (id) on delete restrict,
  question_id   uuid not null references public.questions (id) on delete restrict,
  evaluated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index uq_evaluation_answers on public.evaluation_answers (evaluation_id, question_id) where deleted_at is null;
create trigger trg_evaluation_answers_updated_at before update on public.evaluation_answers
  for each row execute function public.fn_set_updated_at();
alter table public.evaluation_answers enable row level security;

create table public.evaluation_deductions (
  id                   uuid primary key default gen_random_uuid(),
  evaluation_answer_id uuid not null references public.evaluation_answers (id) on delete restrict,
  criterion_id         uuid not null references public.deduction_criteria (id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create unique index uq_evaluation_deductions on public.evaluation_deductions (evaluation_answer_id, criterion_id) where deleted_at is null;
create trigger trg_evaluation_deductions_updated_at before update on public.evaluation_deductions
  for each row execute function public.fn_set_updated_at();
alter table public.evaluation_deductions enable row level security;

create table public.retroactive_entries (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.judge_evaluations (id) on delete restrict,
  entered_by    uuid not null references auth.users (id) on delete restrict,
  reason        text not null,
  entered_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint chk_retroactive_entries_reason check (char_length(btrim(reason)) between 3 and 200)
);

create trigger trg_retroactive_entries_updated_at before update on public.retroactive_entries
  for each row execute function public.fn_set_updated_at();
alter table public.retroactive_entries enable row level security;

-- ══ السياسات: المحكّم يرى تقييمه وحده، والإدارة كلَّ تقييمات برنامجها ══
create policy judge_evaluations_read on public.judge_evaluations
  for select to authenticated
  using (judge_id = (select auth.uid()) or (select public.fn_has_permission('exams.manage', public.fn_session_program(session_id))));

create policy evaluation_answers_read on public.evaluation_answers
  for select to authenticated
  using (exists (
    select 1 from public.judge_evaluations je where je.id = evaluation_id
      and (je.judge_id = (select auth.uid()) or (select public.fn_has_permission('exams.manage', public.fn_session_program(je.session_id))))
  ));

create policy evaluation_deductions_read on public.evaluation_deductions
  for select to authenticated
  using (exists (
    select 1 from public.evaluation_answers ea join public.judge_evaluations je on je.id = ea.evaluation_id
    where ea.id = evaluation_answer_id
      and (je.judge_id = (select auth.uid()) or (select public.fn_has_permission('exams.manage', public.fn_session_program(je.session_id))))
  ));

create policy retroactive_entries_read on public.retroactive_entries
  for select to authenticated
  using (exists (
    select 1 from public.judge_evaluations je where je.id = evaluation_id
      and (select public.fn_has_permission('exams.manage', public.fn_session_program(je.session_id)))
  ));

revoke all on public.judge_evaluations, public.evaluation_answers, public.evaluation_deductions, public.retroactive_entries
  from anon, authenticated, service_role;
grant select on public.judge_evaluations, public.evaluation_answers, public.evaluation_deductions, public.retroactive_entries
  to authenticated;

-- ══ من يكتب التقييم ══
/**
 * المحكّم الذي يُكتب التقييم باسمه: المستدعي إن كان محكّم الجلسة، أو
 * `p_judge_id` إن كان المستدعي مدير اختبارات يُدخل ورقته — والمحكّم المسمّى
 * من لجنة الجلسة في الحالين.
 */
create or replace function public.fn_evaluation_judge(p_session_id uuid, p_judge_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_judge uuid := coalesce(p_judge_id, (select auth.uid()));
begin
  if p_judge_id is not null and p_judge_id <> (select auth.uid()) then
    if not public.fn_has_permission('exams.manage', public.fn_session_program(p_session_id)) then
      raise exception 'لا يُدخل تقييمَ محكّمٍ غيرُه إلا مدير الاختبارات' using errcode = '42501';
    end if;
  elsif not public.fn_is_session_judge(p_session_id) then
    raise exception 'لست محكّماً في هذه الجلسة' using errcode = '42501';
  end if;
  if not exists (select 1 from public.session_judges
                  where session_id = p_session_id and user_id = v_judge and deleted_at is null) then
    raise exception 'المحكّم ليس من لجنة هذه الجلسة' using errcode = '23514';
  end if;
  return v_judge;
end;
$$;
revoke all on function public.fn_evaluation_judge(uuid, uuid) from public;

/** درجة محكّمٍ لمشارك: لكل سؤالٍ قيّمه درجته ناقصاً خصومه، لا تنزل عن صفر. */
create or replace function public.fn_evaluation_total(p_evaluation_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(greatest(0, q.score - coalesce((
    select sum(c.deduction_value) from public.evaluation_deductions d
    join public.deduction_criteria c on c.id = d.criterion_id
    where d.evaluation_answer_id = ea.id and d.deleted_at is null
  ), 0))), 0)
  from public.evaluation_answers ea
  join public.questions q on q.id = ea.question_id
  where ea.evaluation_id = p_evaluation_id and ea.deleted_at is null;
$$;
revoke all on function public.fn_evaluation_total(uuid) from public;

-- ══ شاشة المحكّم ══
/** جلسات المستدعي محكّماً، بعدد مشاركيها وما اعتمده منهم. */
create or replace function public.fn_judge_sessions()
returns table (
  session_id uuid, name text, exam_name text, scheduled_at timestamptz, location text,
  status public.session_status, participants int, approved int
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, e.name, s.scheduled_at, s.location, s.status,
         (select count(*)::int from public.session_participants sp where sp.session_id = s.id and sp.deleted_at is null),
         (select count(*)::int from public.judge_evaluations je
           where je.session_id = s.id and je.judge_id = (select auth.uid()) and je.approved_at is not null and je.deleted_at is null)
  from public.session_judges j
  join public.exam_sessions s on s.id = j.session_id and s.deleted_at is null
  join public.exams e on e.id = s.exam_id
  where j.user_id = (select auth.uid()) and j.deleted_at is null
    and public.fn_has_permission('exams.judge', e.program_id)
  order by s.scheduled_at;
$$;
revoke all on function public.fn_judge_sessions() from public;
grant execute on function public.fn_judge_sessions() to authenticated;

/** مشاركو الجلسة بحال تقييم المحكّم لهم — تقييمه هو لا غيره. */
create or replace function public.fn_judge_session(p_session_id uuid, p_judge_id uuid default null)
returns table (
  participant_id uuid, full_name text, registration_no int, track_name text, sort_order int,
  evaluated int, total int, approved boolean
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
           je.approved_at is not null
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

/** ورقة التقييم: الأسئلة بجوابها للمحكّم، والمعايير، وما علّمه هو. */
create or replace function public.fn_judge_sheet(p_session_id uuid, p_participant_id uuid, p_judge_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_judge uuid := public.fn_evaluation_judge(p_session_id, p_judge_id);
  sp      record;
  je      record;
  v_prog  uuid := public.fn_session_program(p_session_id);
begin
  select * into sp from public.session_participants
  where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null;
  if sp.id is null then
    raise exception 'المشارك ليس في هذه الجلسة' using errcode = 'P0002';
  end if;
  select * into je from public.judge_evaluations
  where session_id = p_session_id and participant_id = p_participant_id and judge_id = v_judge and deleted_at is null;

  return jsonb_build_object(
    'participant', (select jsonb_build_object('name', pr.full_name, 'registration_no', pa.registration_no)
                    from public.participants pa join public.profiles pr on pr.user_id = pa.user_id
                    where pa.id = p_participant_id),
    'approved', je.approved_at is not null,
    'total', case when je.id is null then 0 else public.fn_evaluation_total(je.id) end,
    'max', (select coalesce(sum(q.score), 0) from public.questions q where q.id = any(sp.question_ids)),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'text', q.text, 'answer', q.correct_answer_text, 'score', q.score,
        'evaluated', ea.id is not null,
        'marked', coalesce((select jsonb_agg(d.criterion_id) from public.evaluation_deductions d
                            where d.evaluation_answer_id = ea.id and d.deleted_at is null), '[]'::jsonb),
        'criteria', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'value', c.deduction_value)
                                               order by c.question_id nulls first, c.sort_order), '[]'::jsonb)
                     from public.deduction_criteria c
                     where c.program_id = v_prog and c.deleted_at is null and (c.question_id is null or c.question_id = q.id))
      ) order by n), '[]'::jsonb)
      from unnest(sp.question_ids) with ordinality as u(qid, n)
      join public.questions q on q.id = u.qid
      left join public.evaluation_answers ea on ea.evaluation_id = je.id and ea.question_id = q.id and ea.deleted_at is null
    )
  );
end;
$$;
revoke all on function public.fn_judge_sheet(uuid, uuid, uuid) from public;
grant execute on function public.fn_judge_sheet(uuid, uuid, uuid) to authenticated;

/**
 * تقييم سؤال: المعايير التي وقعت (فارغة = بلا خصم). **وجود الصفّ = قُيِّم.**
 * والمعتمد مقفل. ومدير الاختبارات يُدخل باسم محكّمٍ بسببٍ يُسجَّل.
 */
create or replace function public.fn_judge_mark(
  p_session_id     uuid,
  p_participant_id uuid,
  p_question_id    uuid,
  p_criterion_ids  uuid[],
  p_judge_id       uuid default null,
  p_reason         text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_judge uuid := public.fn_evaluation_judge(p_session_id, p_judge_id);
  v_prog  uuid := public.fn_session_program(p_session_id);
  v_eval  uuid;
  v_ans   uuid;
  v_appr  timestamptz;
begin
  if not exists (select 1 from public.session_participants
                  where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null
                    and p_question_id = any(question_ids)) then
    raise exception 'السؤال ليس من أسئلة هذا المشارك' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(coalesce(p_criterion_ids, '{}')) cid
              where not exists (select 1 from public.deduction_criteria c
                                 where c.id = cid and c.program_id = v_prog and c.deleted_at is null
                                   and (c.question_id is null or c.question_id = p_question_id))) then
    raise exception 'معيار خصمٍ غير معروف' using errcode = '23514';
  end if;

  insert into public.judge_evaluations (session_id, judge_id, participant_id)
  values (p_session_id, v_judge, p_participant_id)
  on conflict (session_id, judge_id, participant_id) where deleted_at is null do nothing;
  select id, approved_at into v_eval, v_appr from public.judge_evaluations
  where session_id = p_session_id and judge_id = v_judge and participant_id = p_participant_id and deleted_at is null;
  if v_appr is not null then
    raise exception 'اعتُمد التقييم وأُقفل — يُعاد فتحه من الإدارة' using errcode = '23514';
  end if;

  if v_judge <> (select auth.uid()) then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'اذكر سبب الإدخال عن المحكّم' using errcode = '23514';
    end if;
    insert into public.retroactive_entries (evaluation_id, entered_by, reason)
    values (v_eval, (select auth.uid()), btrim(p_reason));
  end if;

  insert into public.evaluation_answers (evaluation_id, question_id)
  values (v_eval, p_question_id)
  on conflict (evaluation_id, question_id) where deleted_at is null do update set evaluated_at = now()
  returning id into v_ans;

  update public.evaluation_deductions set deleted_at = now()
   where evaluation_answer_id = v_ans and deleted_at is null
     and not (criterion_id = any(coalesce(p_criterion_ids, '{}')));
  insert into public.evaluation_deductions (evaluation_answer_id, criterion_id)
  select v_ans, cid from (select distinct unnest(coalesce(p_criterion_ids, '{}')) cid) x
  on conflict (evaluation_answer_id, criterion_id) where deleted_at is null do nothing;

  update public.exam_sessions set status = 'in_progress', opened_at = coalesce(opened_at, now())
   where id = p_session_id and status = 'scheduled';

  return public.fn_judge_sheet(p_session_id, p_participant_id, p_judge_id);
end;
$$;
revoke all on function public.fn_judge_mark(uuid, uuid, uuid, uuid[], uuid, text) from public;
grant execute on function public.fn_judge_mark(uuid, uuid, uuid, uuid[], uuid, text) to authenticated;

/** اعتماد المحكّم مشاركه — بعد تقييم أسئلته كلها. والجلسة تُقفل حين يُعتمد الجميع. */
create or replace function public.fn_judge_approve(p_session_id uuid, p_participant_id uuid, p_judge_id uuid default null)
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
  select * into je from public.judge_evaluations
  where session_id = p_session_id and judge_id = v_judge and participant_id = p_participant_id and deleted_at is null;
  select cardinality(question_ids) into v_need from public.session_participants
  where session_id = p_session_id and participant_id = p_participant_id and deleted_at is null;
  if je.id is null or (select count(*) from public.evaluation_answers
                        where evaluation_id = je.id and deleted_at is null) < coalesce(v_need, 0) then
    raise exception 'قيّم الأسئلة كلها قبل الاعتماد' using errcode = '23514';
  end if;
  update public.judge_evaluations set approved_at = coalesce(approved_at, now()) where id = je.id;

  -- الإقفال آلي: كل محكّمي اللجنة اعتمدوا كل مشاركيها.
  if not exists (
    select 1 from public.session_participants sp
    cross join public.session_judges j
    where sp.session_id = p_session_id and sp.deleted_at is null
      and j.session_id = p_session_id and j.deleted_at is null
      and not exists (select 1 from public.judge_evaluations x
                       where x.session_id = p_session_id and x.participant_id = sp.participant_id
                         and x.judge_id = j.user_id and x.approved_at is not null and x.deleted_at is null)
  ) then
    update public.exam_sessions set status = 'closed', closed_at = now() where id = p_session_id;
  end if;

  return public.fn_judge_sheet(p_session_id, p_participant_id, p_judge_id);
end;
$$;
revoke all on function public.fn_judge_approve(uuid, uuid, uuid) from public;
grant execute on function public.fn_judge_approve(uuid, uuid, uuid) to authenticated;

/** إعادة فتح تقييمٍ معتمد — إجراءٌ إداري مسجَّل بسببه. */
create or replace function public.fn_reopen_evaluation(p_session_id uuid, p_participant_id uuid, p_judge_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.fn_has_permission('exams.manage', public.fn_session_program(p_session_id)) then
    raise exception 'لا تملك إعادة فتح التقييم' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'اذكر سبب إعادة الفتح' using errcode = '23514';
  end if;
  update public.judge_evaluations set approved_at = null
   where session_id = p_session_id and participant_id = p_participant_id and judge_id = p_judge_id
     and deleted_at is null and approved_at is not null
  returning id into v_id;
  if v_id is null then
    raise exception 'لا تقييم معتمداً لإعادة فتحه' using errcode = 'P0002';
  end if;
  update public.exam_sessions set status = 'in_progress', closed_at = null where id = p_session_id and status = 'closed';
  perform public.fn_write_audit('evaluation_reopened', 'judge_evaluations', v_id, null,
    jsonb_build_object('reason', btrim(p_reason), 'judge_id', p_judge_id, 'participant_id', p_participant_id));
end;
$$;
revoke all on function public.fn_reopen_evaluation(uuid, uuid, uuid, text) from public;
grant execute on function public.fn_reopen_evaluation(uuid, uuid, uuid, text) to authenticated;

-- ══ النتيجة النهائية ══
/**
 * لكل مُسنَد: كم اعتمد من لجنته، ومتوسط درجاتهم **حين يعتمد الجميع** وإلا فراغ
 * (`BR-SESS-02`). للإدارة وحدها.
 */
create or replace function public.fn_final_scores(p_exam_id uuid)
returns table (
  participant_id uuid, full_name text, registration_no int, track_id uuid, session_name text,
  judges int, approved int, final_score numeric, max_score numeric, percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prog uuid := (select program_id from public.exams where id = p_exam_id);
begin
  if v_prog is null or not public.fn_has_permission('exams.manage', v_prog) then
    raise exception 'لا تملك عرض الدرجات' using errcode = '42501';
  end if;
  return query
    with base as (
      select sp.participant_id, sp.session_id, s.name as sname, sp.question_ids,
             (select count(*)::int from public.session_judges j where j.session_id = sp.session_id and j.deleted_at is null) as nj,
             (select count(*)::int from public.judge_evaluations je
               where je.session_id = sp.session_id and je.participant_id = sp.participant_id
                 and je.approved_at is not null and je.deleted_at is null) as na,
             (select avg(public.fn_evaluation_total(je.id)) from public.judge_evaluations je
               where je.session_id = sp.session_id and je.participant_id = sp.participant_id
                 and je.approved_at is not null and je.deleted_at is null) as avg_total,
             (select coalesce(sum(q.score), 0) from public.questions q where q.id = any(sp.question_ids)) as mx
      from public.session_participants sp
      join public.exam_sessions s on s.id = sp.session_id and s.deleted_at is null
      where s.exam_id = p_exam_id and sp.deleted_at is null
    )
    select b.participant_id, pr.full_name, pa.registration_no, pa.track_id, b.sname, b.nj, b.na,
           case when b.nj > 0 and b.na >= b.nj then round(b.avg_total, 2) end,
           b.mx,
           case when b.nj > 0 and b.na >= b.nj and b.mx > 0 then round(100.0 * b.avg_total / b.mx, 1) end
    from base b
    join public.participants pa on pa.id = b.participant_id
    join public.profiles pr on pr.user_id = pa.user_id
    order by pa.track_id, 10 desc nulls last, pa.registration_no;
end;
$$;
revoke all on function public.fn_final_scores(uuid) from public;
grant execute on function public.fn_final_scores(uuid) to authenticated;
