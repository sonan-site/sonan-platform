-- 008 | دورة حياة المستخدم: صلاحيات حيّة · حالة الحساب · حدّ المعدل
--
-- تصنيف الدوال مرتفعة الامتياز (platform.md 7) — قبل كتابتها:
--   fn_my_permissions : مكشوفة لـ authenticated. تحرس نفسها بـ auth.uid()،
--                       ولا معامل فيها يسمح بالسؤال عن غير المستدعي.
--   fn_is_active      : مكشوفة لـ authenticated. نفس الآلية.
--   fn_hit_rate_limit : مكشوفة لـ anon و authenticated — تُستدعى **قبل** المصادقة
--                       بطبيعتها (الدخول والاسترجاع). تكتب ولا تقرأ عن غيرها.
--
-- تراجع: نعم.

-- ══ صلاحيات المستدعي — مصدرها القاعدة لا نسخة في الذاكرة ══
-- سياسة role_permissions تشترط roles.read، فلا يستطيع المستخدم العادي قراءة
-- صلاحياته بنفسه. هذه الدالة المنفذ الوحيد، وتُرجع صلاحياته هو لا غير.
create or replace function public.fn_my_permissions()
returns table (permission_code text, scope_program_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct rp.permission_code, ur.scope_program_id
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = (select auth.uid())
    and ur.deleted_at is null
    and rp.deleted_at is null;
$$;

comment on function public.fn_my_permissions() is
  'صلاحيات المستدعي وحده. تُقرأ حيّة، فتغيير الدور ينفذ فوراً بلا انتظار انتهاء الرمز.';

revoke all on function public.fn_my_permissions() from public;
revoke all on function public.fn_my_permissions() from anon;
grant execute on function public.fn_my_permissions() to authenticated;

-- ══ هل الحساب حيّ؟ ══
-- الإيقاف = deleted_at في profiles. وهذه الدالة تُستدعى في كل طلب، فينفذ
-- الإيقاف خلال طلب واحد لا خلال عمر الرمز (platform.md 9: دقيقة كحد أقصى).
create or replace function public.fn_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and deleted_at is null
  );
$$;

comment on function public.fn_is_active() is
  'حالة حساب المستدعي. يُستدعى في كل طلب محمي — فالإيقاف ينفذ فوراً.';

revoke all on function public.fn_is_active() from public;
revoke all on function public.fn_is_active() from anon;
grant execute on function public.fn_is_active() to authenticated;

-- ══ حدّ المعدل ══
create table public.rate_limit_events (
  id          uuid primary key default gen_random_uuid(),
  bucket      text not null,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.rate_limit_events is
  'محاولات مسجَّلة لحدّ المعدل. bucket = الفعل + المعرّف (بريد أو عنوان).';
comment on column public.rate_limit_events.bucket is
  'لا يُخزَّن البريد خاماً بل مُلخَّصاً — السجل لا يحتاج الهوية بل التمييز.';

create index idx_rate_limit_bucket
  on public.rate_limit_events (bucket, occurred_at desc);

create trigger trg_rate_limit_events_updated_at before update on public.rate_limit_events
  for each row execute function public.fn_set_updated_at();

alter table public.rate_limit_events enable row level security;

-- لا سياسة كتابة: الإدراج عبر الدالة وحدها.
create policy rate_limit_events_read on public.rate_limit_events
  for select to authenticated
  using (public.fn_has_permission('audit.read'));

/**
 * يسجّل محاولة ويقرّر هل تُقبل.
 * يُرجع true إن كانت ضمن الحدّ، وfalse إن تجاوزته — والتجاوز يُسجَّل في audit_log
 * (platform.md 9)، فالإغراق أثرٌ مقروء لا صمت.
 */
create or replace function public.fn_hit_rate_limit(
  p_bucket  text,
  p_max     int,
  p_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.rate_limit_events
  where occurred_at < now() - make_interval(secs => p_seconds * 10);

  select count(*) into v_count
  from public.rate_limit_events
  where bucket = p_bucket
    and occurred_at > now() - make_interval(secs => p_seconds);

  insert into public.rate_limit_events (bucket) values (p_bucket);

  if v_count >= p_max then
    insert into public.audit_log (actor_id, action, entity_table, entity_id, after)
    values (null, 'rate_limit_exceeded', 'rate_limit_events', null,
            jsonb_build_object('bucket', p_bucket, 'max', p_max, 'window_seconds', p_seconds));
    return false;
  end if;

  return true;
end;
$$;

comment on function public.fn_hit_rate_limit(text, int, int) is
  'مكشوفة لغير المصادَق عليه بالضرورة: الدخول والاسترجاع يسبقان المصادقة.';

revoke all on function public.fn_hit_rate_limit(text, int, int) from public;
grant execute on function public.fn_hit_rate_limit(text, int, int) to anon, authenticated;

-- ══ إعدادات دورة الحياة — بقيم افتراضية، لا أرقام سحرية في الكود ══
insert into public.settings (key, value, scope_program_id, description)
values
  ('auth.login.max_attempts', '5'::jsonb, null, 'أقصى محاولات دخول فاشلة في النافذة'),
  ('auth.login.window_seconds', '900'::jsonb, null, 'نافذة حدّ محاولات الدخول بالثواني'),
  ('auth.recovery.max_attempts', '3'::jsonb, null, 'أقصى طلبات استرجاع في النافذة'),
  ('auth.recovery.window_seconds', '3600'::jsonb, null, 'نافذة حدّ الاسترجاع بالثواني'),
  ('auth.invite.max_attempts', '20'::jsonb, null, 'أقصى دعوات يرسلها إداري في النافذة'),
  ('auth.invite.window_seconds', '3600'::jsonb, null, 'نافذة حدّ الدعوات بالثواني')
on conflict do nothing;
