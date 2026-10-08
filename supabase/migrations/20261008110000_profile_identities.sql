-- 071 | هوية المشارك (adr/0047)
--
-- رقم الهوية أو الإقامة وجوال وليّ الأمر — في جدولٍ منفصل عن `profiles` عمداً:
-- سياسة `profiles` تُقرئ حامل `users.read` الصفّ كاملاً، ورقم الهوية بيانٌ حسّاس.
-- فهذا الجدول **يقرؤه صاحبه وحده**، والإدارة تراه عبر `fn_identity_masked`:
-- مقنّعاً لحامل `users.read`، وكاملاً لحامل `identities.read`.
--
-- **يُقفل الرقم بعد تثبيته:** لا يغيّره صاحبه، ويصحّحه حامل `identities.write`.
-- **ويُمحى مع الحساب:** المفتاح الأجنبي `on delete cascade` — محو الحساب
-- (`adr/0034`) يحذف `auth.users`، والهوية لا تبقى بعد صاحبها.
--
-- تراجع: نعم — حذف الجدول والدالتين. لا جدول آخر يعتمد عليه.

-- ══ البنية ══
create table public.profile_identities (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users (id) on delete cascade,
  national_id    text,
  guardian_phone text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  -- عشرة أرقام: 1 للمواطن و2 للمقيم.
  constraint chk_profile_identities_national_id
    check (national_id is null or national_id ~ '^[12][0-9]{9}$'),
  constraint chk_profile_identities_guardian_phone
    check (guardian_phone is null or guardian_phone ~ '^\+[1-9][0-9]{7,14}$')
);

comment on table public.profile_identities is
  'هوية المشارك (adr/0047) — لا يقرؤها إلا صاحبها، والإدارة عبر fn_identity_masked.';

-- حسابٌ واحد لكل شخص: الرقم لا يتكرّر بين الأحياء.
create unique index uq_profile_identities_national_id
  on public.profile_identities (national_id)
  where national_id is not null and deleted_at is null;

create trigger trg_profile_identities_updated_at before update on public.profile_identities
  for each row execute function public.fn_set_updated_at();

alter table public.profile_identities enable row level security;

-- ══ القفل ══
-- الرقم المثبَّت لا يغيّره صاحبه. والتصحيح لحامل `identities.write` وحده.
-- وجوال وليّ الأمر يتغيّر بحرية — قناة تواصل لا هوية.
create or replace function public.fn_guard_identity_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'لا يُنقل صفّ الهوية إلى حسابٍ آخر' using errcode = '42501';
  end if;

  if old.national_id is not null
     and new.national_id is distinct from old.national_id
     and not public.fn_has_permission('identities.write') then
    raise exception 'رقم الهوية لا يُغيَّر بعد تثبيته — تواصل مع إدارة البرنامج لتصحيحه'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_profile_identities_guard before update on public.profile_identities
  for each row execute function public.fn_guard_identity_update();

-- ══ السياسات ══
create policy profile_identities_read_own on public.profile_identities
  for select to authenticated
  using (user_id = (select auth.uid()));

-- من يصحّح يقرأ ما يصحّحه — والتحديث بشرطٍ يقرأ الصفّ أولاً.
create policy profile_identities_read_full on public.profile_identities
  for select to authenticated
  using ((select public.fn_has_permission('identities.read')) or (select public.fn_has_permission('identities.write')));

create policy profile_identities_insert_own on public.profile_identities
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profile_identities_update on public.profile_identities
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.fn_has_permission('identities.write')))
  with check (user_id = (select auth.uid()) or (select public.fn_has_permission('identities.write')));

-- ══ المنح (adr/0023) ══
revoke all on public.profile_identities from anon, authenticated, service_role;
grant select, insert, update on public.profile_identities to authenticated;

-- ══ القراءة الإدارية ══
/**
 * هوية مستخدمٍ للإدارة: الرقم **مقنّعاً** لحامل `users.read`، وكاملاً لحامل
 * `identities.read`، ولصاحبه كاملاً. ومن سواهم لا يُرجَع له صفّ.
 */
create or replace function public.fn_identity_masked(p_user_id uuid)
returns table (national_id text, guardian_phone text, is_full boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := (select auth.uid()) = p_user_id or public.fn_has_permission('identities.read');
begin
  if not v_full and not public.fn_has_permission('users.read') then
    return;
  end if;

  return query
    select
      case
        when i.national_id is null then null
        when v_full then i.national_id
        else left(i.national_id, 1) || '••••••' || right(i.national_id, 2)
      end,
      i.guardian_phone,
      v_full
    from public.profile_identities i
    where i.user_id = p_user_id and i.deleted_at is null;
end;
$$;

revoke all on function public.fn_identity_masked(uuid) from public;
grant execute on function public.fn_identity_masked(uuid) to authenticated;
