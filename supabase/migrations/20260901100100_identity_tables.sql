-- 002 | جداول الهوية: profiles · roles · role_permissions · user_roles
-- RLS مفعَّل على كل جدول في نفس هجرة إنشائه (منع افتراضي).
--
-- تأجيل السياسات مصرَّح به ومسبَّب (completeness-contract 2.أ):
-- السياسات تستدعي fn_has_permission، وهي تستعلم عن هذه الجداول نفسها،
-- فلا يمكن تعريفها قبلها. تُضاف في الهجرة 004 بعد الدوال في 003.
-- حتى ذلك الحين الجداول محميّة بالمنع الافتراضي: RLS بلا سياسة = رفض.
--
-- تراجع: نعم (إسقاط الجداول بالترتيب العكسي).

-- ── profiles ──
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete restrict,
  full_name   text not null,
  phone       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.profiles is
  'امتداد جدول المصادقة. الإيقاف = deleted_at + إبطال الجلسات — لا حذف حساب.';
comment on column public.profiles.phone is
  'قناة التواصل لا الهوية (adr/0016). الدخول بالبريد وكلمة المرور.';

create index idx_profiles_user_id on public.profiles (user_id) where deleted_at is null;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.fn_set_updated_at();
alter table public.profiles enable row level security;

-- ── roles ──
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.roles is
  'أدوار حرّة المسمّى يبنيها المدير (adr/0006). لا قائمة أدوار ثابتة.';
comment on column public.roles.is_system is
  'دور البذرة الإداري: لا يُحذف ولا تُفرَّغ صلاحياته.';

create unique index idx_roles_name on public.roles (name) where deleted_at is null;
create trigger trg_roles_updated_at before update on public.roles
  for each row execute function public.fn_set_updated_at();
alter table public.roles enable row level security;

-- ── role_permissions ──
create table public.role_permissions (
  id              uuid primary key default gen_random_uuid(),
  role_id         uuid not null references public.roles (id) on delete restrict,
  permission_code text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.role_permissions is
  'ربط الدور برمز من الكتالوج الثابت في الكود. الرمز نصّ لا مفتاح أجنبي: الكتالوج يعيش في config/permissions.ts لا في القاعدة (platform.md 8).';

create unique index idx_role_permissions_unique
  on public.role_permissions (role_id, permission_code) where deleted_at is null;
create index idx_role_permissions_role on public.role_permissions (role_id) where deleted_at is null;
create trigger trg_role_permissions_updated_at before update on public.role_permissions
  for each row execute function public.fn_set_updated_at();
alter table public.role_permissions enable row level security;

-- ── user_roles ──
create table public.user_roles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete restrict,
  role_id          uuid not null references public.roles (id) on delete restrict,
  scope_program_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.user_roles is
  'إسناد المستخدم لدور مع النطاق. scope_program_id فارغ = نطاق عام على المنصة.';
comment on column public.user_roles.scope_program_id is
  'بلا مفتاح أجنبي الآن: جدول programs يُنشأ في حزمة لاحقة. يُضاف القيد حينها.';

create unique index idx_user_roles_unique
  on public.user_roles (user_id, role_id, (coalesce(scope_program_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where deleted_at is null;
create index idx_user_roles_user on public.user_roles (user_id) where deleted_at is null;
create trigger trg_user_roles_updated_at before update on public.user_roles
  for each row execute function public.fn_set_updated_at();
alter table public.user_roles enable row level security;
