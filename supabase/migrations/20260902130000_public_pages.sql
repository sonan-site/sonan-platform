-- 011 | صفحة البرنامج المعلن وسجل المساعدة
--
-- منشئ صفحات حر بحرية **تركيب** لا **تعريف** (adr/0011): الأنواع مغلقة في
-- enum، والإدارة تُنشئ منها أي عدد من النُّسخ بأي ترتيب.
-- المحتوى في jsonb بمخطط Zod وقيد CHECK على المفاتيح الإلزامية (adr/0012).
--
-- تراجع: نعم.

create type public.block_type as enum (
  'header',        -- محتوى: اسم البرنامج ونبذته
  'free_text',     -- محتوى: فقرة حرة
  'image',         -- محتوى: مرجع مرفق
  'tracks',        -- عرض بيانات: مولَّد من جدول المسارات
  'faq',           -- عرض بيانات: مولَّد من سجل المساعدة
  'registration'   -- إجراء: يرتبط بتدفّق التسجيل
);

create type public.publish_status as enum ('draft', 'published');

-- ══ عناصر الصفحة ══
create table public.page_blocks (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  block_type public.block_type not null,
  sort_order int not null default 0,
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.page_blocks is
  'البرنامج له صفحة واحدة، فالعناصر ترتبط به مباشرة — لا جدول صفحة وسيط بصفّ واحد لكل برنامج.';
comment on column public.page_blocks.content is
  'حسب النوع. عناصر عرض البيانات والإجراء تخزّن إعداداتها فقط — بياناتها مولَّدة.';

-- المفاتيح الإلزامية لكل نوع محتوى. عنصر بلا محتواه يُصيَّر فارغاً بلا سبب ظاهر،
-- فالقيد يمنع الحالة عند الكتابة لا عند العرض.
alter table public.page_blocks add constraint chk_page_blocks_content check (
  case block_type
    when 'header' then content ? 'title'
    when 'free_text' then content ? 'text'
    when 'image' then content ? 'attachmentId'
    else true
  end
);

create index idx_page_blocks_program
  on public.page_blocks (program_id, sort_order) where deleted_at is null;

create trigger trg_page_blocks_updated_at before update on public.page_blocks
  for each row execute function public.fn_set_updated_at();
alter table public.page_blocks enable row level security;

-- ══ سجل المساعدة — مصدر عنصر الأسئلة الشائعة ══
create table public.help_entries (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  question   text not null,
  answer     text not null,
  status     public.publish_status not null default 'draft',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.help_entries is
  'سجل أسئلة وأجوبة إدارية. ليس نظام تذاكر دعم — الأبسط هو المعتمد.';

create index idx_help_entries_program
  on public.help_entries (program_id, sort_order) where deleted_at is null;

create trigger trg_help_entries_updated_at before update on public.help_entries
  for each row execute function public.fn_set_updated_at();
alter table public.help_entries enable row level security;

-- ══ السياسات ══
-- الصفحة تتبع برنامجها: المنشور يقرؤه الجميع، وغير المنشور بنطاقه.
create policy page_blocks_read on public.page_blocks
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = page_blocks.program_id
        and p.deleted_at is null
        and (p.status = 'published' or public.fn_has_permission('programs.read', p.id))
    )
  );

create policy page_blocks_insert on public.page_blocks
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));

create policy page_blocks_update on public.page_blocks
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

-- المساعدة: **المنشور منها وحده** يظهر للعموم. المسوّدة تبقى داخلية.
create policy help_entries_read_published on public.help_entries
  for select to anon, authenticated
  using (
    status = 'published'
    and deleted_at is null
    and exists (
      select 1 from public.programs p
      where p.id = help_entries.program_id
        and p.deleted_at is null
        and p.status = 'published'
    )
  );

create policy help_entries_read_scoped on public.help_entries
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));

create policy help_entries_insert on public.help_entries
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));

create policy help_entries_update on public.help_entries
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

grant select on public.page_blocks to anon;
grant select on public.help_entries to anon;
