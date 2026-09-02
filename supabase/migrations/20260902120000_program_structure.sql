-- 010 | الهيكل الإداري: الأقسام والبرامج والمسارات
--
-- ويُغلق ديناً من الهجرة 002: `user_roles.scope_program_id` كان بلا مفتاح أجنبي
-- لأن جدول programs لم يكن قد أُنشئ. يُضاف القيد الآن.
--
-- تراجع: نعم (إسقاط بالترتيب العكسي).

-- ══ الأقسام — هرمي ذاتي المرجعية ══
create table public.sections (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.sections (id) on delete restrict,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.sections is
  'الهرمية في الأقسام لا في البرامج. قسم قد يتبع قسماً، والبرامج تتبع الأقسام.';

create index idx_sections_parent on public.sections (parent_id) where deleted_at is null;
create trigger trg_sections_updated_at before update on public.sections
  for each row execute function public.fn_set_updated_at();
alter table public.sections enable row level security;

-- قسم لا يكون أباً لنفسه. الدورات الأعمق تحتاج فحصاً تعاودياً، مؤجَّل حتى تظهر حاجته.
alter table public.sections add constraint chk_sections_not_self_parent
  check (parent_id is distinct from id);

-- ══ الأنواع المغلقة ══
create type public.program_kind as enum (
  'competition',           -- مسابقة: مسارات وتصفيات ولجان
  'weekly_followup',       -- متابعة وتسميع أسبوعي — محجوز، غير مبنيّ
  'remote_memorization'    -- حفظ عن بعد — محجوز، غير مبنيّ
);

create type public.program_status as enum ('draft', 'published', 'closed');

-- ══ البرامج — حدّ العزل ══
create table public.programs (
  id                     uuid primary key default gen_random_uuid(),
  section_id             uuid not null references public.sections (id) on delete restrict,
  name                   text not null,
  summary                text not null default '',
  slug                   text not null,
  kind                   public.program_kind not null default 'competition',
  participant_label      text not null default 'مشارك',
  status                 public.program_status not null default 'draft',
  capacity               int,
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  passing_percentage     numeric(5,2) not null default 80,
  award_percentage       numeric(5,2) not null default 90,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

comment on table public.programs is
  'الحاوية العليا. حالة التسجيل مشتقّة لا مخزَّنة: منشور + ضمن التواريخ + السعة لم تكتمل [BR-CAP-01].';
comment on column public.programs.participant_label is
  'مسمّى المشارك — نصّ حرّ لا enum. «متسابق» لسنن، وقد يكون «طالب» لغيرها.';
comment on column public.programs.capacity is
  'فارغ = بلا سقف. السقف يُغلق التسجيل آلياً بلا تدخّل يدوي [BR-CAP-01].';

create unique index idx_programs_slug on public.programs (slug) where deleted_at is null;
create index idx_programs_section on public.programs (section_id) where deleted_at is null;
create index idx_programs_status on public.programs (status) where deleted_at is null;

alter table public.programs add constraint chk_programs_slug
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
alter table public.programs add constraint chk_programs_capacity
  check (capacity is null or capacity > 0);
alter table public.programs add constraint chk_programs_window
  check (
    registration_opens_at is null
    or registration_closes_at is null
    or registration_closes_at > registration_opens_at
  );
alter table public.programs add constraint chk_programs_percentages
  check (
    passing_percentage between 0 and 100
    and award_percentage between 0 and 100
  );

create trigger trg_programs_updated_at before update on public.programs
  for each row execute function public.fn_set_updated_at();
alter table public.programs enable row level security;

-- ══ المسارات ══
create table public.tracks (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id) on delete restrict,
  name        text not null,
  description text not null default '',
  capacity    int,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.tracks is
  'خاص بنمط competition. مقاطع المسار في المادة تُضاف في س٤ (adr/0021).';

create index idx_tracks_program on public.tracks (program_id) where deleted_at is null;
alter table public.tracks add constraint chk_tracks_capacity
  check (capacity is null or capacity > 0);

create trigger trg_tracks_updated_at before update on public.tracks
  for each row execute function public.fn_set_updated_at();
alter table public.tracks enable row level security;

-- ══ إغلاق دَين الهجرة 002 ══
alter table public.user_roles
  add constraint fk_user_roles_scope_program
  foreign key (scope_program_id) references public.programs (id) on delete restrict;

-- ══ السياسات ══
-- الأقسام: تصنيف إداري، لا بيانات مشاركين.
create policy sections_read on public.sections
  for select to authenticated using (public.fn_has_permission('sections.read'));
create policy sections_insert on public.sections
  for insert to authenticated with check (public.fn_has_permission('sections.write'));
create policy sections_update on public.sections
  for update to authenticated
  using (public.fn_has_permission('sections.write'))
  with check (public.fn_has_permission('sections.write'));

-- البرامج: المنشور يقرؤه الجميع (المتجر العام طبقة تسويقية بلا حساب — adr/0004)،
-- وغير المنشور لا يراه إلا من يملك صلاحيته في نطاقه.
create policy programs_read_published on public.programs
  for select to anon, authenticated
  using (status = 'published' and deleted_at is null);
create policy programs_read_scoped on public.programs
  for select to authenticated
  using (public.fn_has_permission('programs.read', id));

-- الإنشاء يشترط صلاحية **عامة**: لا نطاق لبرنامج لم يوجد بعد.
create policy programs_insert on public.programs
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', null));
create policy programs_update on public.programs
  for update to authenticated
  using (public.fn_has_permission('programs.write', id))
  with check (public.fn_has_permission('programs.write', id));

-- المسارات تتبع برنامجها في القراءة والكتابة.
create policy tracks_read on public.tracks
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = tracks.program_id
        and p.deleted_at is null
        and (p.status = 'published' or public.fn_has_permission('programs.read', p.id))
    )
  );
create policy tracks_insert on public.tracks
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy tracks_update on public.tracks
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

-- ══ صلاحيات القراءة العامة للمتجر ══
-- anon يقرأ البرامج المنشورة ومساراتها وحدها؛ وRLS هي التي تحصر ذلك.
grant select on public.programs to anon;
grant select on public.tracks to anon;

-- ══ الرموز الجديدة تُمنَح لدور النظام ══
insert into public.role_permissions (role_id, permission_code)
select r.id, code
from public.roles r
cross join (values
  ('sections.read'), ('sections.write'),
  ('programs.read'), ('programs.write')
) as codes(code)
where r.is_system = true and r.deleted_at is null
on conflict do nothing;
