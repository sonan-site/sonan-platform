-- 003 | دوال الصلاحية القاعدية
--
-- تصنيف الدوال مرتفعة الامتياز (platform.md 7) — قبل كتابتها لا بعدها:
--   fn_has_permission  : مكشوفة لدور authenticated. تحرس نفسها بـ auth.uid()،
--                        فلا تجيب إلا عن المستدعي نفسه. لا معامل يسمح بالسؤال عن غيره.
--   fn_can_grant_role  : مكشوفة لدور authenticated. تحرس نفسها بنفس الآلية.
--   fn_write_audit     : مكشوفة لدور authenticated. تكتب ولا تقرأ، وتثبّت الفاعل
--                        من auth.uid() فلا يستطيع أحد الكتابة باسم غيره.
--
-- كلها: security definer + search_path مثبَّت + التنفيذ منزوع من الجميع ثم ممنوح لدور واحد.
-- تراجع: نعم.

-- ── هل يملك المستدعي هذه الصلاحية؟ ──
create or replace function sunan.fn_has_permission(
  p_code       text,
  p_program_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from sunan.user_roles ur
    join sunan.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = (select auth.uid())
      and ur.deleted_at is null
      and rp.deleted_at is null
      and rp.permission_code = p_code
      -- الدور العام (نطاق فارغ) يسري على كل البرامج.
      -- الدور المحصور ببرنامج يسري عليه وحده.
      and (ur.scope_program_id is null or ur.scope_program_id = p_program_id)
  );
$$;

comment on function sunan.fn_has_permission(text, uuid) is
  'BR-ISO-01 | تجيب عن المستدعي وحده. auth.uid() فارغ = false.';

revoke all on function sunan.fn_has_permission(text, uuid) from public;
revoke all on function sunan.fn_has_permission(text, uuid) from anon;
grant execute on function sunan.fn_has_permission(text, uuid) to authenticated;

-- ── هل يجوز للمستدعي منح هذا الدور؟ ──
-- BR-ROLE-01 | لا رفع للنفس: لا يمنح أحد نفسه، ولا يمنح ما لا يملك.
create or replace function sunan.fn_can_grant_role(
  p_role_id    uuid,
  p_target_user uuid,
  p_program_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- (1) لا يمنح أحد نفسه
    p_target_user is distinct from (select auth.uid())
    -- (2) يملك صلاحية الإسناد أصلاً
    and sunan.fn_has_permission('roles.assign', p_program_id)
    -- (3) ولا يمنح ما لا يملك: كل رمز في الدور الممنوح يجب أن يكون بيده
    and not exists (
      select 1
      from sunan.role_permissions rp
      where rp.role_id = p_role_id
        and rp.deleted_at is null
        and not sunan.fn_has_permission(rp.permission_code, p_program_id)
    );
$$;

comment on function sunan.fn_can_grant_role(uuid, uuid, uuid) is
  'BR-ROLE-01 | ثلاثة شروط مجتمعة: ليس نفسه، ويملك roles.assign، ويملك كل رمز يمنحه.';

revoke all on function sunan.fn_can_grant_role(uuid, uuid, uuid) from public;
revoke all on function sunan.fn_can_grant_role(uuid, uuid, uuid) from anon;
grant execute on function sunan.fn_can_grant_role(uuid, uuid, uuid) to authenticated;
