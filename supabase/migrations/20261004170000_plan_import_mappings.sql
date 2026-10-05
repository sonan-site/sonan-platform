-- 063 | قوالب الاستيراد: تعيين أعمدة ملفٍ يُعاد استعماله (adr/0042)
--
-- ملفات المعدّ تتكرّر بصيغتها: خمسة مسارات بالأعمدة نفسها، وسنةٌ بعد سنة.
-- فيُحفظ تعيين الأعمدة (أيّ عمود لأيّ حقل وأيّ دور) باسمٍ في البرنامج،
-- ويُطبَّق على الملف التالي بعناوينه.
--
-- **التعيين `jsonb` بمخطط Zod** (سابقة `adr/0012`): بنيةٌ يصفها الكود ويتحقّق
-- منها قبل الكتابة، ولا يُستعلم داخلها.
--
-- تراجع: نعم.

create table public.plan_import_mappings (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  name       text not null,
  mapping    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.plan_import_mappings is
  'adr/0042 | تعيين أعمدة ملف استيرادٍ محفوظٌ باسم: { headerRow, columns: [{ header, role, fieldId }] }.';

alter table public.plan_import_mappings add constraint chk_plan_import_mappings_name
  check (char_length(btrim(name)) between 1 and 60);
alter table public.plan_import_mappings add constraint chk_plan_import_mappings_shape
  check (jsonb_typeof(mapping) = 'object' and jsonb_typeof(mapping -> 'columns') = 'array');

create unique index idx_plan_import_mappings_name
  on public.plan_import_mappings (program_id, name) where deleted_at is null;

create trigger trg_plan_import_mappings_updated_at before update on public.plan_import_mappings
  for each row execute function public.fn_set_updated_at();
alter table public.plan_import_mappings enable row level security;

create policy plan_import_mappings_read on public.plan_import_mappings
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));
create policy plan_import_mappings_insert on public.plan_import_mappings
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy plan_import_mappings_update on public.plan_import_mappings
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

revoke all on public.plan_import_mappings from anon, authenticated, service_role;
grant select, insert, update on public.plan_import_mappings to authenticated;
