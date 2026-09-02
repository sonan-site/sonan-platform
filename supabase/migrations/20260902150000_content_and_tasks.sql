-- 013 | المادة المرقَّمة ومقاطع المسار وحقول الواجب وقوالب الأيام
--
-- ينفّذ adr/0021: نطاق المسار **متفرّق** لا متّصل، والتوليد يعمل على **رتبة
-- محلّية** مشتقّة من مقاطعه المرتّبة — فالفجوة تُعالَج مرة واحدة هنا، ولا يتسرّب
-- منطقها إلى التطبيق.
--
-- تراجع: نعم.

-- لازم لقيد منع التداخل: يجمع المساواة على uuid مع تقاطع المدى في فهرس gist.
create extension if not exists btree_gist with schema extensions;

-- ══ المادة المرقَّمة ══
create table public.content_units (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  sequence   int not null,
  label      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.content_units is
  'وحدات المحتوى مرقَّمة تسلسلياً. الوحدة اسمٌ لا نوع — حديث أو صفحة أو وجه، والبنية واحدة.';
comment on column public.content_units.label is
  'نصّ البداية. يُعرَض للمشارك ويُخزَّن الرقم خلفه، فالحساب والإحصاء بلا فرق.';

create unique index idx_content_units_sequence
  on public.content_units (program_id, sequence) where deleted_at is null;
alter table public.content_units add constraint chk_content_units_sequence
  check (sequence > 0);

create trigger trg_content_units_updated_at before update on public.content_units
  for each row execute function public.fn_set_updated_at();
alter table public.content_units enable row level security;

-- ══ مقاطع المسار — adr/0021 ══
create table public.track_content_ranges (
  id            uuid primary key default gen_random_uuid(),
  track_id      uuid not null references public.tracks (id) on delete restrict,
  from_sequence int not null,
  to_sequence   int not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.track_content_ranges is
  'المسار قد يجمع أبواباً غير متجاورة. الرتبة تتبع sort_order لا ترتيب الأرقام: قد يُقصَد تقديم باب متأخر في الترقيم.';

alter table public.track_content_ranges add constraint chk_track_range_order
  check (to_sequence >= from_sequence);
alter table public.track_content_ranges add constraint chk_track_range_positive
  check (from_sequence > 0);

-- **منع التداخل قيداً لا فحصاً**: التداخل يفسد الرتبة، ووحدةٌ تُحسب مرتين
-- تُنتج نسبة إنجاز كاذبة. القيد يمنع الحالة عند الكتابة لا عند القراءة.
alter table public.track_content_ranges
  add constraint excl_track_ranges_no_overlap
  exclude using gist (
    track_id with =,
    int4range(from_sequence, to_sequence, '[]') with &&
  ) where (deleted_at is null);

create index idx_track_ranges_track
  on public.track_content_ranges (track_id, sort_order) where deleted_at is null;

create trigger trg_track_content_ranges_updated_at before update on public.track_content_ranges
  for each row execute function public.fn_set_updated_at();
alter table public.track_content_ranges enable row level security;

-- ══ الرتبة المحلّية — التحويل في موضع واحد ══

/** طول مقاطع المسار مجتمعةً — عدد وحداته. */
create or replace function public.fn_track_unit_count(p_track_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(to_sequence - from_sequence + 1), 0)::int
  from public.track_content_ranges
  where track_id = p_track_id and deleted_at is null;
$$;

/**
 * رقم الوحدة عند رتبة محلّية. فارغ إن تجاوزت الرتبة مدى المسار.
 * الرتبة تبدأ من 1، والمقاطع تتسلسل بلا انقطاع مهما كانت الفجوات بينها.
 */
create or replace function public.fn_track_unit_at(p_track_id uuid, p_ordinal int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with segments as (
    select
      from_sequence,
      to_sequence,
      coalesce(
        sum(to_sequence - from_sequence + 1) over (
          order by sort_order, from_sequence
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as preceding_units
    from public.track_content_ranges
    where track_id = p_track_id and deleted_at is null
  )
  select from_sequence + (p_ordinal - preceding_units - 1)
  from segments
  where p_ordinal > preceding_units
    and p_ordinal <= preceding_units + (to_sequence - from_sequence + 1)
  limit 1;
$$;

/** رتبة وحدة داخل المسار. فارغ إن كانت خارج مقاطعه. */
create or replace function public.fn_track_ordinal_of(p_track_id uuid, p_sequence int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with segments as (
    select
      from_sequence,
      to_sequence,
      coalesce(
        sum(to_sequence - from_sequence + 1) over (
          order by sort_order, from_sequence
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as preceding_units
    from public.track_content_ranges
    where track_id = p_track_id and deleted_at is null
  )
  select preceding_units + (p_sequence - from_sequence + 1)
  from segments
  where p_sequence between from_sequence and to_sequence
  limit 1;
$$;

comment on function public.fn_track_unit_at(uuid, int) is
  'adr/0021 | التحويل من الرتبة إلى رقم الوحدة. الفجوة تُعالَج هنا وحدها.';
comment on function public.fn_track_ordinal_of(uuid, int) is
  'adr/0021 | التحويل العكسي. فارغ لوحدة خارج مقاطع المسار.';

revoke all on function public.fn_track_unit_count(uuid) from public;
revoke all on function public.fn_track_unit_at(uuid, int) from public;
revoke all on function public.fn_track_ordinal_of(uuid, int) from public;
grant execute on function public.fn_track_unit_count(uuid) to anon, authenticated;
grant execute on function public.fn_track_unit_at(uuid, int) to authenticated;
grant execute on function public.fn_track_ordinal_of(uuid, int) to authenticated;

-- ══ حقول الواجب اليومي ══
-- النوع مغلق (نطاقي أو عددي)، والمسمّى حرّ. «حفظ» و«مراجعة» تسميات لا أنواع.
create type public.field_kind as enum ('ranged', 'counted');

create table public.task_fields (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  label      text not null,
  kind       public.field_kind not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.task_fields is
  'تعريف الحقول بلا قيم. الواجب اليومي مكوّن اختياري: برنامج بلا حقول = بلا واجب يومي.';
comment on column public.task_fields.kind is
  'ranged يخضع للتوليد الديناميكي · counted مستقل يوماً بيوم ولا يدخله إطلاقاً.';

create unique index idx_task_fields_label
  on public.task_fields (program_id, label) where deleted_at is null;

create trigger trg_task_fields_updated_at before update on public.task_fields
  for each row execute function public.fn_set_updated_at();
alter table public.task_fields enable row level security;

-- ══ قوالب الأيام ══
create table public.day_templates (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.day_templates is
  'يُعرَّف مرة ويُطبَّق على أي عدد من الأيام، فلا يُبنى كل يوم يدوياً.';

create unique index idx_day_templates_name
  on public.day_templates (program_id, name) where deleted_at is null;

create trigger trg_day_templates_updated_at before update on public.day_templates
  for each row execute function public.fn_set_updated_at();
alter table public.day_templates enable row level security;

create table public.day_template_fields (
  id              uuid primary key default gen_random_uuid(),
  day_template_id uuid not null references public.day_templates (id) on delete restrict,
  task_field_id   uuid not null references public.task_fields (id) on delete restrict,
  base_amount     numeric(10,2) not null,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.day_template_fields is
  'أي حقول يحملها القالب وبأي مقدار أساسي. مقدار اليوم = الأساسي × مضاعف اليوم.';

create unique index idx_day_template_fields_unique
  on public.day_template_fields (day_template_id, task_field_id) where deleted_at is null;
alter table public.day_template_fields add constraint chk_day_template_amount
  check (base_amount > 0);

create trigger trg_day_template_fields_updated_at before update on public.day_template_fields
  for each row execute function public.fn_set_updated_at();
alter table public.day_template_fields enable row level security;

-- ══ السياسات ══
-- كلها إعداد برنامج: تُقرأ مع البرنامج وتُكتب بصلاحيته.

create policy content_units_read on public.content_units
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));
create policy content_units_insert on public.content_units
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy content_units_update on public.content_units
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

create policy track_ranges_read on public.track_content_ranges
  for select to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_content_ranges.track_id
        and public.fn_has_permission('programs.read', t.program_id)
    )
  );
create policy track_ranges_insert on public.track_content_ranges
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_content_ranges.track_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  );
create policy track_ranges_update on public.track_content_ranges
  for update to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_content_ranges.track_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_content_ranges.track_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  );

create policy task_fields_read on public.task_fields
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));
create policy task_fields_insert on public.task_fields
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy task_fields_update on public.task_fields
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

create policy day_templates_read on public.day_templates
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));
create policy day_templates_insert on public.day_templates
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy day_templates_update on public.day_templates
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

create policy day_template_fields_read on public.day_template_fields
  for select to authenticated
  using (
    exists (
      select 1 from public.day_templates d
      where d.id = day_template_fields.day_template_id
        and public.fn_has_permission('programs.read', d.program_id)
    )
  );
create policy day_template_fields_insert on public.day_template_fields
  for insert to authenticated
  with check (
    exists (
      select 1 from public.day_templates d
      where d.id = day_template_fields.day_template_id
        and public.fn_has_permission('programs.write', d.program_id)
    )
  );
create policy day_template_fields_update on public.day_template_fields
  for update to authenticated
  using (
    exists (
      select 1 from public.day_templates d
      where d.id = day_template_fields.day_template_id
        and public.fn_has_permission('programs.write', d.program_id)
    )
  )
  with check (
    exists (
      select 1 from public.day_templates d
      where d.id = day_template_fields.day_template_id
        and public.fn_has_permission('programs.write', d.program_id)
    )
  );
