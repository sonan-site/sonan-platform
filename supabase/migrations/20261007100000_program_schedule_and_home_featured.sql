-- 069 | مواعيد البرنامج (adr/0044) · مفتاح واجهة الحملة (adr/0045)
--
-- **المواعيد:** أحداثٌ مؤرَّخة في عمر البرنامج، أياماً لا لحظات. الترتيب بيوم
-- البداية، والحالة مشتقّة بتوقيت الرياض عند العرض. وموعد التسجيل ليس صفّاً
-- هنا — يُشتقّ من نافذة التسجيل.
--
-- **المفتاح:** `home.featured_program` يُظهر واجهة الحملة لبرنامجٍ في الصفحة
-- الرئيسية. الزائر يقرؤه بدالة تُرجع الرابط **فقط إن كان البرنامج منشوراً**.
--
-- تراجع: نعم — حذف الجدول والدالة والقيد والصفّ. لا بيانات أخرى تتأثّر.

-- ══ البنية ══
create table public.program_schedule (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  title      text not null,
  starts_on  date not null,
  ends_on    date,
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_program_schedule_title check (char_length(btrim(title)) between 2 and 60),
  constraint chk_program_schedule_note check (char_length(note) <= 160),
  constraint chk_program_schedule_range check (ends_on is null or ends_on >= starts_on)
);

comment on table public.program_schedule is
  'مواعيد البرنامج (adr/0044). موعد التسجيل مشتقّ من نافذة التسجيل ولا يُخزَّن هنا.';

create index idx_program_schedule_program
  on public.program_schedule (program_id, starts_on) where deleted_at is null;

create trigger trg_program_schedule_updated_at before update on public.program_schedule
  for each row execute function public.fn_set_updated_at();
alter table public.program_schedule enable row level security;

-- ══ السياسات ══
-- كعناصر الصفحة: المنشور يقرؤه الجميع، وغير المنشور بنطاقه.
create policy program_schedule_read on public.program_schedule
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_schedule.program_id
        and p.deleted_at is null
        and (p.status = 'published' or public.fn_has_permission('programs.read', p.id))
    )
  );

create policy program_schedule_insert on public.program_schedule
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));

create policy program_schedule_update on public.program_schedule
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

-- ══ المنح (adr/0023) ══
revoke all on public.program_schedule from anon, authenticated, service_role;
grant select on public.program_schedule to anon;
grant select, insert, update on public.program_schedule to authenticated;

-- ══ مفتاح واجهة الحملة ══
insert into public.settings (key, value, scope_program_id, description)
values ('home.featured_program', '{"slug": null}'::jsonb, null,
        'البرنامج الذي تعرض الصفحة الرئيسية واجهة حملته — فارغ = المتجر')
on conflict do nothing;

alter table public.settings
  add constraint settings_home_featured_shape check (
    key <> 'home.featured_program'
    or jsonb_typeof(value -> 'slug') in ('null', 'string')
  );

-- الرابط وحده، ومنشوراً وحده: مفتاحٌ على مسوّدة أو برنامجٍ محذوف لا يُفرغ
-- الصفحة الرئيسية — تعود إلى المتجر.
create or replace function public.fn_home_featured()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug
    from public.settings s
    join public.programs p on p.slug = s.value ->> 'slug'
   where s.key = 'home.featured_program'
     and s.scope_program_id is null
     and s.deleted_at is null
     and p.deleted_at is null
     and p.status = 'published'
   limit 1;
$$;

revoke all on function public.fn_home_featured() from public;
grant execute on function public.fn_home_featured() to anon, authenticated;
