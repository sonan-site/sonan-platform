-- 006 | المرفقات والإشعارات
-- تراجع: نعم.

-- ── attachments ──
create table sunan.attachments (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  owner_id     uuid not null references auth.users (id) on delete restrict,
  entity_table text,
  entity_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table sunan.attachments is 'الملفات المرفوعة: المسار والمالك والكيان المرتبط.';

create index idx_attachments_owner on sunan.attachments (owner_id) where deleted_at is null;
create index idx_attachments_entity on sunan.attachments (entity_table, entity_id) where deleted_at is null;
create trigger trg_attachments_updated_at before update on sunan.attachments
  for each row execute function sunan.fn_set_updated_at();
alter table sunan.attachments enable row level security;

create policy attachments_read on sunan.attachments
  for select to authenticated
  using (owner_id = (select auth.uid()) or sunan.fn_has_permission('attachments.read'));

create policy attachments_insert on sunan.attachments
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy attachments_update on sunan.attachments
  for update to authenticated
  using (owner_id = (select auth.uid()) or sunan.fn_has_permission('attachments.write'))
  with check (owner_id = (select auth.uid()) or sunan.fn_has_permission('attachments.write'));

-- ── notifications ──
create type sunan.notification_status as enum ('pending', 'sent', 'failed', 'read');

-- جدول مرجعي بمفتاح ثابت لا نصّ حرّ (platform.md 2.4).
-- يُترَك فارغاً عمداً: لا نوع إشعار قائم بعد، والنوع يولد مع الميزة التي ترسله.
-- enum مرفوض هنا لأن القيم غير معروفة، واختراعها الآن تخمين لا تصميم.
create table sunan.notification_kinds (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table sunan.notification_kinds is
  'أنواع الإشعارات. يُملأ مع كل ميزة تُرسل إشعاراً — لا مسبقاً.';

create trigger trg_notification_kinds_updated_at before update on sunan.notification_kinds
  for each row execute function sunan.fn_set_updated_at();
alter table sunan.notification_kinds enable row level security;

create policy notification_kinds_read on sunan.notification_kinds
  for select to authenticated using (true);

create table sunan.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete restrict,
  kind         text not null references sunan.notification_kinds (code) on delete restrict,
  payload      jsonb not null default '{}'::jsonb,
  status       sunan.notification_status not null default 'pending',
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table sunan.notifications is
  'القناة الفعلية (داخل المنصة، واتساب، بريد) بند غير حاجب يُحسم قبل حزمة دورة حياة المستخدم. الجدول قائم على كل حال.';

create index idx_notifications_recipient
  on sunan.notifications (recipient_id, created_at desc) where deleted_at is null;
create trigger trg_notifications_updated_at before update on sunan.notifications
  for each row execute function sunan.fn_set_updated_at();
alter table sunan.notifications enable row level security;

-- المستلم يرى إشعاراته وحده. لا صلاحية تفتح إشعارات غيره.
create policy notifications_read on sunan.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

-- التحديث الوحيد المسموح للمستلم: وسم الإشعار مقروءاً.
create policy notifications_mark_read on sunan.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()) and status = 'read');

-- لا سياسة insert: الإنشاء من الخادم عبر وحدة service_role المعزولة.
