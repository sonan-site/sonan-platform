-- 080 | الفرز والجلسات (adr/0048)
--
-- ١ · الفرز: `fn_final_eligibility` تعرض أهلية كل مشارك للاختبار الشفهي من
--     شرطيه (نسبة الإنجاز الآن · اجتياز الاختبار الشرط)، و`fn_apply_sorting`
--     تحسمها مرّة: `qualified`/`not_qualified`، **باستثناءٍ إداري مسجَّل**.
-- ٢ · الجلسات: `exam_sessions` بموعدها ومكانها، و`session_judges` لجنتها،
--     و`session_participants` إسنادها — ولكل مُسنَد **أسئلته مسحوبةً مثبَّتة**
--     يقرؤها محكّموه جميعاً (يسمعون الجواب نفسه).
-- ٣ · التوزيع: `fn_distribute_participants` يوزّع المتأهلين على الجلسات بالتساوي
--     بترتيب رقم التسجيل، والإدارة تنقل بعدها من تشاء (`fn_move_participant`).
--
-- **والجلسة المتزامنة خارج هذا الموسم** (`adr/0048`): لا حالة مشتركة هنا.
--
-- تراجع: نعم — حذف الجداول الثلاثة والدوال والنوع. الحالات المحسومة تبقى
-- (`qualified`/`not_qualified`) ويُرجعها حامل `participants.write`.

-- ══ ٢ · البنية ══
create type public.session_status as enum ('scheduled', 'in_progress', 'closed');

create table public.exam_sessions (
  id           uuid primary key default gen_random_uuid(),
  exam_id      uuid not null references public.exams (id) on delete restrict,
  name         text not null,
  scheduled_at timestamptz not null,
  location     text not null default '',
  status       public.session_status not null default 'scheduled',
  opened_at    timestamptz,
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint chk_exam_sessions_name check (char_length(btrim(name)) between 2 and 80),
  constraint chk_exam_sessions_location check (char_length(location) <= 200)
);

comment on table public.exam_sessions is
  'adr/0048 | جلسة الاختبار الشفهي: لجنةٌ ومشاركون بموعدٍ ومكان. بلا حالة مشتركة هذا الموسم.';

create index idx_exam_sessions_exam on public.exam_sessions (exam_id, scheduled_at) where deleted_at is null;
create trigger trg_exam_sessions_updated_at before update on public.exam_sessions
  for each row execute function public.fn_set_updated_at();
alter table public.exam_sessions enable row level security;

create table public.session_judges (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_sessions (id) on delete restrict,
  user_id    uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index uq_session_judges on public.session_judges (session_id, user_id) where deleted_at is null;
create index idx_session_judges_user on public.session_judges (user_id) where deleted_at is null;
create trigger trg_session_judges_updated_at before update on public.session_judges
  for each row execute function public.fn_set_updated_at();
alter table public.session_judges enable row level security;

create table public.session_participants (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.exam_sessions (id) on delete restrict,
  participant_id uuid not null references public.participants (id) on delete restrict,
  sort_order     int not null default 0,
  question_ids   uuid[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on column public.session_participants.question_ids is
  'adr/0048 | أسئلته الشفهية مسحوبةً عند الإسناد من نطاقه — واحدةٌ لكل محكّميه.';

-- المشارك في جلسةٍ حيّة واحدة لكل اختبار: النقل يُبدّل جلسته ولا يُضاعفها.
create unique index uq_session_participants on public.session_participants (session_id, participant_id) where deleted_at is null;
create index idx_session_participants_participant on public.session_participants (participant_id) where deleted_at is null;
create trigger trg_session_participants_updated_at before update on public.session_participants
  for each row execute function public.fn_set_updated_at();
alter table public.session_participants enable row level security;

-- ══ السياسات ══
-- الإدارة تقرأ جلسات برنامجها، والمحكّم جلساته وحدها. والكتابة من الدوالّ —
-- عدا الجلسة نفسها (الاسم والموعد والمكان) فتُكتب مباشرة بإدارة الاختبارات.

/** برنامج الجلسة — لسياساتها. */
create or replace function public.fn_session_program(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.program_id from public.exam_sessions s join public.exams e on e.id = s.exam_id where s.id = p_session_id;
$$;

/** هل المستدعي محكّمٌ في الجلسة؟ */
create or replace function public.fn_is_session_judge(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session_judges j
    where j.session_id = p_session_id and j.user_id = (select auth.uid()) and j.deleted_at is null
  ) and public.fn_has_permission('exams.judge', public.fn_session_program(p_session_id));
$$;

revoke all on function public.fn_session_program(uuid) from public;
revoke all on function public.fn_is_session_judge(uuid) from public;
grant execute on function public.fn_session_program(uuid), public.fn_is_session_judge(uuid) to authenticated;

create policy exam_sessions_read on public.exam_sessions
  for select to authenticated
  using ((select public.fn_has_permission('exams.manage', public.fn_session_program(id))) or public.fn_is_session_judge(id));
create policy exam_sessions_insert on public.exam_sessions
  for insert to authenticated
  with check (exists (
    select 1 from public.exams e
    where e.id = exam_id and e.exam_type = 'oral' and (select public.fn_has_permission('exams.manage', e.program_id))
  ));
create policy exam_sessions_update on public.exam_sessions
  for update to authenticated
  using ((select public.fn_has_permission('exams.manage', public.fn_session_program(id))))
  with check ((select public.fn_has_permission('exams.manage', public.fn_session_program(id))));

create policy session_judges_read on public.session_judges
  for select to authenticated
  using ((select public.fn_has_permission('exams.manage', public.fn_session_program(session_id))) or user_id = (select auth.uid()));

create policy session_participants_read on public.session_participants
  for select to authenticated
  using ((select public.fn_has_permission('exams.manage', public.fn_session_program(session_id))) or public.fn_is_session_judge(session_id));

revoke all on public.exam_sessions, public.session_judges, public.session_participants from anon, authenticated, service_role;
grant select, insert, update on public.exam_sessions to authenticated;
grant select on public.session_judges, public.session_participants to authenticated;

-- ══ ١ · الفرز ══
/**
 * أهلية كل مشاركٍ في البرنامج للاختبار الشفهي **الآن**: نسبة إنجازه من
 * `fn_progress_at`، واجتيازه الاختبار الشرط. والحالة الحالية تُعرض معها.
 */
create or replace function public.fn_final_eligibility(p_exam_id uuid)
returns table (
  participant_id uuid, full_name text, registration_no int, track_id uuid,
  status public.participant_status, percent numeric, prerequisite_passed boolean, eligible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or e.exam_type <> 'oral' then
    raise exception 'الفرز للاختبار الشفهي وحده' using errcode = '22023';
  end if;
  if not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;

  return query
    with base as (
      select pa.id, pr.full_name, pa.registration_no, pa.track_id, pa.status,
             coalesce((select p.percent from public.fn_progress_at(pa.id, now()) p), 0) as pct,
             case when e.prerequisite_exam_id is null then true
                  else coalesce((select b.passed from public.fn_exam_best(e.prerequisite_exam_id, pa.id) b), false) end as pre
      from public.participants pa
      join public.profiles pr on pr.user_id = pa.user_id
      where pa.program_id = e.program_id and pa.deleted_at is null
        and (e.track_id is null or pa.track_id = e.track_id)
        and pa.status in ('registered', 'memorizing', 'qualified', 'not_qualified')
    )
    select b.id, b.full_name, b.registration_no, b.track_id, b.status, b.pct, b.pre,
           b.pct >= coalesce(e.entry_percentage, 0) and b.pre
    from base b
    order by b.track_id, b.registration_no;
end;
$$;
revoke all on function public.fn_final_eligibility(uuid) from public;
grant execute on function public.fn_final_eligibility(uuid) to authenticated;

/**
 * يحسم الفرز: المؤهَّل `qualified` وغيره `not_qualified`. و`p_overrides`
 * ({participant_id: true|false}) استثناءٌ إداري يغلب الحساب — ويُسجَّل كلّه
 * في التدقيق بعدد كلٍّ وبالمستثنَين بأسمائهم.
 */
create or replace function public.fn_apply_sorting(p_exam_id uuid, p_overrides jsonb default '{}'::jsonb)
returns table (qualified int, not_qualified int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e        record;
  v_q      int := 0;
  v_n      int := 0;
  r        record;
  v_final  boolean;
  v_over   jsonb := coalesce(p_overrides, '{}'::jsonb);
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك فرز هذا الاختبار' using errcode = '42501';
  end if;

  for r in select * from public.fn_final_eligibility(p_exam_id) loop
    v_final := coalesce((v_over ->> r.participant_id::text)::boolean, r.eligible);
    update public.participants
       set status = case when v_final then 'qualified'::public.participant_status else 'not_qualified'::public.participant_status end
     where id = r.participant_id;
    if v_final then v_q := v_q + 1; else v_n := v_n + 1; end if;
  end loop;

  perform public.fn_write_audit('exam_sorting_applied', 'exams', p_exam_id, null,
    jsonb_build_object('qualified', v_q, 'not_qualified', v_n, 'overrides', v_over));

  qualified := v_q;
  not_qualified := v_n;
  return next;
end;
$$;
revoke all on function public.fn_apply_sorting(uuid, jsonb) from public;
grant execute on function public.fn_apply_sorting(uuid, jsonb) to authenticated;

-- ══ ٢ب · اللجنة ══
/** إسناد محكّمٍ لجلسة أو رفعه. المحكّم يحمل `exams.judge` على البرنامج. */
create or replace function public.fn_set_session_judge(p_session_id uuid, p_user_id uuid, p_assign boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program uuid := public.fn_session_program(p_session_id);
begin
  if v_program is null or not public.fn_has_permission('exams.manage', v_program) then
    raise exception 'لا تملك إدارة هذه الجلسة' using errcode = '42501';
  end if;
  if p_assign then
    if not exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id and rp.deleted_at is null
      where ur.user_id = p_user_id and ur.deleted_at is null and rp.permission_code = 'exams.judge'
        and (ur.scope_program_id is null or ur.scope_program_id = v_program)
    ) then
      raise exception 'هذا الحساب لا يحمل صلاحية التحكيم — امنحه دوراً بها أولاً' using errcode = '23514';
    end if;
    insert into public.session_judges (session_id, user_id) values (p_session_id, p_user_id)
    on conflict (session_id, user_id) where deleted_at is null do nothing;
  else
    update public.session_judges set deleted_at = now()
     where session_id = p_session_id and user_id = p_user_id and deleted_at is null;
  end if;
end;
$$;
revoke all on function public.fn_set_session_judge(uuid, uuid, boolean) from public;
grant execute on function public.fn_set_session_judge(uuid, uuid, boolean) to authenticated;

-- ══ ٣ · الإسناد والتوزيع ══
/** أسئلة شفهية لمشارك: من نطاقه الذي بلغه، عشوائية. */
create or replace function public.fn_draw_oral(p_exam_id uuid, p_participant_id uuid)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n   int := (select question_count from public.exams where id = p_exam_id);
  v_ids uuid[];
begin
  select array_agg(x) into v_ids from (
    select x from public.fn_exam_pool(p_exam_id, p_participant_id, '{}') x limit v_n
  ) t;
  return coalesce(v_ids, '{}');
end;
$$;
revoke all on function public.fn_draw_oral(uuid, uuid) from public;

/** ينقل مشاركاً إلى جلسة (أو يُسنده أول مرّة) ويسحب أسئلته إن لم تُسحب. */
create or replace function public.fn_move_participant(p_session_id uuid, p_participant_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s        record;
  v_old    record;
  v_order  int;
begin
  select es.*, e.program_id, e.id as eid into s
  from public.exam_sessions es join public.exams e on e.id = es.exam_id
  where es.id = p_session_id and es.deleted_at is null;
  if s.id is null or not public.fn_has_permission('exams.manage', s.program_id) then
    raise exception 'لا تملك إدارة هذه الجلسة' using errcode = '42501';
  end if;
  if not exists (select 1 from public.participants
                  where id = p_participant_id and program_id = s.program_id and deleted_at is null) then
    raise exception 'المشارك ليس في هذا البرنامج' using errcode = '23514';
  end if;

  -- جلسته الحالية في الاختبار نفسه — تُخلى، وأسئلته تنتقل معه.
  select sp.* into v_old from public.session_participants sp
  join public.exam_sessions es on es.id = sp.session_id
  where sp.participant_id = p_participant_id and es.exam_id = s.eid
    and sp.deleted_at is null and es.deleted_at is null;
  if v_old.id is not null then
    if v_old.session_id = p_session_id then
      return;
    end if;
    if exists (select 1 from public.judge_evaluations je
                where je.session_id = v_old.session_id and je.participant_id = p_participant_id and je.deleted_at is null) then
      raise exception 'بدأ تحكيمه في جلسته — لا يُنقل' using errcode = '23514';
    end if;
    update public.session_participants set deleted_at = now() where id = v_old.id;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_order from public.session_participants
  where session_id = p_session_id and deleted_at is null;
  insert into public.session_participants (session_id, participant_id, sort_order, question_ids)
  values (p_session_id, p_participant_id, v_order,
          coalesce(v_old.question_ids, public.fn_draw_oral(s.eid, p_participant_id)));
end;
$$;
revoke all on function public.fn_move_participant(uuid, uuid) from public;
grant execute on function public.fn_move_participant(uuid, uuid) to authenticated;

/**
 * يوزّع المتأهلين **غير المُسنَدين** على جلسات الاختبار بالتساوي، بترتيب
 * المسار ثم رقم التسجيل، دوراً على الجلسات بترتيب موعدها. يُرجع عدد من أُسند.
 */
create or replace function public.fn_distribute_participants(p_exam_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e         record;
  v_sessions uuid[];
  v_n       int := 0;
  r         record;
begin
  select * into e from public.exams where id = p_exam_id and deleted_at is null;
  if e.id is null or not public.fn_has_permission('exams.manage', e.program_id) then
    raise exception 'لا تملك إدارة هذا الاختبار' using errcode = '42501';
  end if;
  select array_agg(id order by scheduled_at, created_at) into v_sessions
  from public.exam_sessions where exam_id = p_exam_id and deleted_at is null and status <> 'closed';
  if coalesce(cardinality(v_sessions), 0) = 0 then
    raise exception 'أنشئ جلسةً واحدة على الأقل أولاً' using errcode = '23514';
  end if;

  for r in
    select pa.id from public.participants pa
    where pa.program_id = e.program_id and pa.deleted_at is null and pa.status = 'qualified'
      and (e.track_id is null or pa.track_id = e.track_id)
      and not exists (
        select 1 from public.session_participants sp join public.exam_sessions es on es.id = sp.session_id
        where sp.participant_id = pa.id and es.exam_id = p_exam_id and sp.deleted_at is null and es.deleted_at is null
      )
    order by pa.track_id, pa.registration_no
  loop
    perform public.fn_move_participant(v_sessions[(v_n % cardinality(v_sessions)) + 1], r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.fn_distribute_participants(uuid) from public;
grant execute on function public.fn_distribute_participants(uuid) to authenticated;
