-- 012 | التسجيل والقبول: المشاركون وأسئلة القبول وطلبات تغيير المسار
--
-- **قاعدة مكرَّرة معلَنة:** حالة التسجيل [BR-CAP-01] موجودة في مكانين بالضرورة —
-- في TypeScript للعرض، وهنا لأن **الإنفاذ لا يكون إلا في القاعدة**. سياسة تعتمد
-- على حساب في التطبيق ليست سياسة.
-- platform.md 12 يجيز التكرار عند تعذّر توحيده، بشرط **اختبار تكافؤ بمدخلات
-- موحّدة** — وهو مكتوب في lib/programs/registration-parity.db-test.ts.
--
-- تراجع: نعم.

create type public.participant_status as enum (
  'registered',      -- سُجِّل ولم يبدأ
  'memorizing',      -- في مرحلة الحفظ
  'qualified',       -- اجتاز التصفيات
  'not_qualified',   -- لم يجتزها — نفي حيادي لا «راسب»
  'passed',          -- اجتاز النهائي
  'not_passed'
);

create type public.change_direction as enum ('up', 'down');
create type public.request_status as enum ('pending', 'approved', 'rejected');

-- ══ المشاركون ══
create table public.participants (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete restrict,
  program_id          uuid not null references public.programs (id) on delete restrict,
  track_id            uuid references public.tracks (id) on delete restrict,
  status              public.participant_status not null default 'registered',
  joined_at           timestamptz not null default now(),
  baseline_percentage numeric(5,2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table public.participants is
  'يُنشأ لحظة التسجيل الفعلي لا عند إنشاء الحساب. مستخدم ↔ مشارك: واحد إلى متعدد.';
comment on column public.participants.baseline_percentage is
  'نقطة انطلاق بعد تغيير مسار مقبول — تُدخلها الإدارة تقديرياً، ولا قاعدة خاصة بعدها.';

create unique index idx_participants_unique
  on public.participants (user_id, program_id) where deleted_at is null;
create index idx_participants_program on public.participants (program_id) where deleted_at is null;
create index idx_participants_track on public.participants (track_id) where deleted_at is null;

alter table public.participants add constraint chk_participants_baseline
  check (baseline_percentage is null or baseline_percentage between 0 and 100);

create trigger trg_participants_updated_at before update on public.participants
  for each row execute function public.fn_set_updated_at();
alter table public.participants enable row level security;

-- ══ حالة التسجيل في القاعدة — مصدر الإنفاذ ══
-- تُعرَّف **بعد** جدول المشاركين لأنها تعدّه: دالة SQL تُتحقَّق عند إنشائها،
-- فترتيب التعريف ليس تفصيلاً أسلوبياً بل شرط صحّة.
create or replace function public.fn_registration_state(p_program_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.status = 'closed' then 'closed'
    when p.status <> 'published' then 'unpublished'
    when p.registration_opens_at is not null and now() < p.registration_opens_at
      then 'not_open_yet'
    when p.registration_closes_at is not null and now() >= p.registration_closes_at
      then 'closed'
    when p.capacity is not null and (
      select count(*) from public.participants pa
      where pa.program_id = p.id and pa.deleted_at is null
    ) >= p.capacity then 'full'
    else 'open'
  end
  from public.programs p
  where p.id = p_program_id and p.deleted_at is null;
$$;

comment on function public.fn_registration_state(uuid) is
  'BR-CAP-01 | مشتقّة لا مخزَّنة. مصدر الإنفاذ في سياسة التسجيل الذاتي.';

revoke all on function public.fn_registration_state(uuid) from public;
grant execute on function public.fn_registration_state(uuid) to anon, authenticated;


-- ══ أسئلة القبول التلقائي ══
-- كيان منفصل تماماً عن بنك الأسئلة: غرضان مختلفان لا يُخلطان.
create table public.admission_questions (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id) on delete restrict,
  track_id    uuid references public.tracks (id) on delete restrict,
  question    text not null,
  is_required boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on column public.admission_questions.track_id is
  'فارغ = سؤال عام للبرنامج. وإلا فهو خاص بمسار بعينه.';

create index idx_admission_questions_program
  on public.admission_questions (program_id, sort_order) where deleted_at is null;

create trigger trg_admission_questions_updated_at before update on public.admission_questions
  for each row execute function public.fn_set_updated_at();
alter table public.admission_questions enable row level security;

create table public.admission_answers (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete restrict,
  question_id    uuid not null references public.admission_questions (id) on delete restrict,
  answer         text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create unique index idx_admission_answers_unique
  on public.admission_answers (participant_id, question_id) where deleted_at is null;

create trigger trg_admission_answers_updated_at before update on public.admission_answers
  for each row execute function public.fn_set_updated_at();
alter table public.admission_answers enable row level security;

-- ══ طلبات تغيير المسار ══
create table public.track_change_requests (
  id                  uuid primary key default gen_random_uuid(),
  participant_id      uuid not null references public.participants (id) on delete restrict,
  from_track_id       uuid not null references public.tracks (id) on delete restrict,
  to_track_id         uuid not null references public.tracks (id) on delete restrict,
  direction           public.change_direction not null,
  reason              text not null,
  baseline_percentage numeric(5,2) not null,
  status              public.request_status not null default 'pending',
  decided_by          uuid references auth.users (id) on delete restrict,
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table public.track_change_requests is
  'BR-TRK-01 | قرار إداري بتقدير بشري. لا تبديل ذاتي إطلاقاً، ولا معادلة آلية للنسبة.';

create index idx_track_change_participant
  on public.track_change_requests (participant_id) where deleted_at is null;
create index idx_track_change_pending
  on public.track_change_requests (status) where deleted_at is null;

alter table public.track_change_requests add constraint chk_track_change_distinct
  check (from_track_id <> to_track_id);
alter table public.track_change_requests add constraint chk_track_change_baseline
  check (baseline_percentage between 0 and 100);

create trigger trg_track_change_requests_updated_at before update on public.track_change_requests
  for each row execute function public.fn_set_updated_at();
alter table public.track_change_requests enable row level security;

-- ══ السياسات ══

-- المشارك يرى مشاركته، والإدارة ترى مشاركي نطاقها.
create policy participants_read on public.participants
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.fn_has_permission('participants.read', program_id)
  );

-- **التسجيل الذاتي**: نفسه فقط، وفي برنامج **مفتوح فعلاً** [BR-CAP-01].
-- الشرط هنا لا في التطبيق: سياسة تعتمد على حساب في التطبيق ليست سياسة.
create policy participants_self_register on public.participants
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.fn_registration_state(program_id) = 'open'
  );

-- التعديل إداري: المشارك لا يغيّر مساره ولا حالته بنفسه [BR-TRK-01].
create policy participants_admin_update on public.participants
  for update to authenticated
  using (public.fn_has_permission('participants.write', program_id))
  with check (public.fn_has_permission('participants.write', program_id));

-- أسئلة القبول تُقرأ لمن يسجّل، وتُدار مع البرنامج.
create policy admission_questions_read on public.admission_questions
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = admission_questions.program_id
        and p.deleted_at is null
        and (p.status = 'published' or public.fn_has_permission('programs.read', p.id))
    )
  );
create policy admission_questions_insert on public.admission_questions
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy admission_questions_update on public.admission_questions
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

-- الإجابات: صاحبها يكتبها ويقرؤها، والإدارة تقرؤها.
create policy admission_answers_read on public.admission_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.participants pa
      where pa.id = admission_answers.participant_id
        and (
          pa.user_id = (select auth.uid())
          or public.fn_has_permission('participants.read', pa.program_id)
        )
    )
  );
create policy admission_answers_insert on public.admission_answers
  for insert to authenticated
  with check (
    exists (
      select 1 from public.participants pa
      where pa.id = admission_answers.participant_id
        and pa.user_id = (select auth.uid())
    )
  );

-- طلبات تغيير المسار: يقرؤها صاحبها والإدارة، **ولا يُنشئها إلا الإدارة**.
create policy track_change_read on public.track_change_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.participants pa
      where pa.id = track_change_requests.participant_id
        and (
          pa.user_id = (select auth.uid())
          or public.fn_has_permission('participants.read', pa.program_id)
        )
    )
  );
create policy track_change_insert on public.track_change_requests
  for insert to authenticated
  with check (
    exists (
      select 1 from public.participants pa
      where pa.id = track_change_requests.participant_id
        and public.fn_has_permission('participants.write', pa.program_id)
    )
  );
create policy track_change_update on public.track_change_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.participants pa
      where pa.id = track_change_requests.participant_id
        and public.fn_has_permission('participants.write', pa.program_id)
    )
  )
  with check (
    exists (
      select 1 from public.participants pa
      where pa.id = track_change_requests.participant_id
        and public.fn_has_permission('participants.write', pa.program_id)
    )
  );

grant select on public.admission_questions to anon;

-- ══ الإعدادات والرموز ══
insert into public.settings (key, value, scope_program_id, description)
values
  ('auth.register.max_attempts', '10'::jsonb, null, 'أقصى محاولات تسجيل في برنامج خلال النافذة'),
  ('auth.register.window_seconds', '3600'::jsonb, null, 'نافذة حدّ التسجيل بالثواني')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, code
from public.roles r
cross join (values ('participants.read'), ('participants.write')) as codes(code)
where r.is_system = true and r.deleted_at is null
on conflict do nothing;
