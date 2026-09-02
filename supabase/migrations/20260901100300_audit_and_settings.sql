-- 004 | سجل التدقيق والإعدادات
-- RLS مفعَّل وسياساته في نفس الهجرة — الدوال صارت متاحة بعد 003.
-- تراجع: نعم.

-- ── audit_log ──
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users (id) on delete restrict,
  action       text not null,
  entity_table text not null,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.audit_log is
  'من فعل ماذا على ماذا ومتى، بالقيمة قبل وبعد. actor_id فارغ = فعل نظام.';

create index idx_audit_log_entity on public.audit_log (entity_table, entity_id);
create index idx_audit_log_actor on public.audit_log (actor_id);
create index idx_audit_log_created on public.audit_log (created_at desc);
create trigger trg_audit_log_updated_at before update on public.audit_log
  for each row execute function public.fn_set_updated_at();
alter table public.audit_log enable row level security;

-- سياسة قراءة واحدة بصلاحية مستقلة. سجل لا يُستعلَم عنه توثيق يوهم (platform.md 8).
create policy audit_log_read on public.audit_log
  for select to authenticated
  using (public.fn_has_permission('audit.read'));

-- لا سياسة insert/update: الكتابة عبر fn_write_audit وحدها.
-- لا سياسة delete على الإطلاق (platform.md 2.2).

-- ── كتابة التدقيق ──
create or replace function public.fn_write_audit(
  p_action       text,
  p_entity_table text,
  p_entity_id    uuid    default null,
  p_before       jsonb   default null,
  p_after        jsonb   default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'لا يُكتب تدقيق بلا فاعل مصادَق عليه';
  end if;

  insert into public.audit_log (actor_id, action, entity_table, entity_id, before, after)
  values ((select auth.uid()), p_action, p_entity_table, p_entity_id, p_before, p_after)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.fn_write_audit(text, text, uuid, jsonb, jsonb) is
  'المنفذ الوحيد للكتابة في audit_log. الفاعل من auth.uid() لا من معامل — فلا كتابة باسم غير.';

revoke all on function public.fn_write_audit(text, text, uuid, jsonb, jsonb) from public;
revoke all on function public.fn_write_audit(text, text, uuid, jsonb, jsonb) from anon;
grant execute on function public.fn_write_audit(text, text, uuid, jsonb, jsonb) to authenticated;

-- ── settings ──
create table public.settings (
  id               uuid primary key default gen_random_uuid(),
  key              text not null,
  value            jsonb not null,
  scope_program_id uuid,
  description      text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.settings is
  'كل قيمة كان يمكن أن تُكتب سحرية في الكود تعيش هنا، وكل إعداد يُبنى بقيمة افتراضية.';

create unique index idx_settings_key_scope
  on public.settings (key, (coalesce(scope_program_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where deleted_at is null;
create trigger trg_settings_updated_at before update on public.settings
  for each row execute function public.fn_set_updated_at();
alter table public.settings enable row level security;

create policy settings_read on public.settings
  for select to authenticated
  using (public.fn_has_permission('settings.read', scope_program_id));

create policy settings_insert on public.settings
  for insert to authenticated
  with check (public.fn_has_permission('settings.write', scope_program_id));

create policy settings_update on public.settings
  for update to authenticated
  using (public.fn_has_permission('settings.write', scope_program_id))
  with check (public.fn_has_permission('settings.write', scope_program_id));
