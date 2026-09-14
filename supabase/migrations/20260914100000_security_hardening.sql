-- 026 | تحصين المرحلة الأولى — ثغرات كشفتها مراجعة ١٤ سبتمبر
--
-- كل بند هنا ثغرة **مُثبَتة بطلب مباشر** على واجهة REST، لا احتمال نظري،
-- ولكل بند اختبار في `lib/auth/security.db-test.ts` يفشل قبل الهجرة ويمرّ بعدها.
--
--   ١ · الموقوف يبقى يملك صلاحياته، ويرفع إيقافه عن نفسه.
--   ٢ · عدّاد المحاولات يمسحه أي زائر، ويملؤه لغيره فيقفله.
--   ٣ · المشارك يسجّل نفسه «مجتازاً»، والسعة تُتجاوز بتسجيلين متزامنين،
--       وسعة المسار لا يفحصها شيء.
--   ٤ · حامل `roles.write` يمنح دوره صلاحيات لا يملكها.
--   ٥ · أي مسجَّل يكتب في سجل التدقيق ما شاء.
--   ٦ · أرشفة المسار ثلاث كتابات بلا معاملة، فيبقى نصفها عند فشل آخرها.
--
-- **لا جدول جديد** — فلا سياسات جدول جديد ولا منح (adr/0023). والسياسات
-- المعدَّلة تُسقَط وتُعاد، فالهجرة المطبَّقة لا تُعدَّل.
--
-- تراجع: نعم.

-- ══ ١ · الإيقاف يُسقط الصلاحيات كلها دفعة واحدة ══
-- كل سياسة إدارية تمرّ بـ`fn_has_permission`، فشرطٌ واحد هنا يسري عليها كلها —
-- وعلى كل إجراء خادم، لأن `authorizeRequest` يسأل الدالة نفسها.
create or replace function public.fn_has_permission(
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
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.profiles pr on pr.user_id = ur.user_id and pr.deleted_at is null
    where ur.user_id = (select auth.uid())
      and ur.deleted_at is null
      and rp.deleted_at is null
      and rp.permission_code = p_code
      and (ur.scope_program_id is null or ur.scope_program_id = p_program_id)
  );
$$;

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
  join public.profiles pr on pr.user_id = ur.user_id and pr.deleted_at is null
  where ur.user_id = (select auth.uid())
    and ur.deleted_at is null
    and rp.deleted_at is null;
$$;

-- صاحب الملف يعدّل اسمه وجواله، **لا حالته**. السياسة تجيز تحديث صفّه كله،
-- فالمشغّل يضيّق ما تجيزه على الأعمدة.
create or replace function public.fn_guard_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- بلا هوية = خادم أو مالك القاعدة. والإداري الحيّ يعدّل ما يشاء.
  if (select auth.uid()) is null or public.fn_has_permission('users.write') then
    return new;
  end if;

  if new.deleted_at is distinct from old.deleted_at
     or new.user_id is distinct from old.user_id then
    raise exception 'حالة الحساب لا تُعدَّل إلا من الإدارة'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_profiles_guard_update
  before update on public.profiles
  for each row execute function public.fn_guard_profile_update();

revoke all on function public.fn_guard_profile_update() from public;

-- ══ ٢ · عدّاد المحاولات للخادم وحده ══
-- كان مكشوفاً لـ anon لأن الدخول يسبق المصادقة. لكن المستدعي كان يختار الحدّ
-- والنافذة بنفسه، فنافذة صفرية تمسح عدّادات الجميع. الخادم يستدعيه الآن
-- بمفتاح الخدمة، فلا يصله الزائر أصلاً.
revoke execute on function public.fn_hit_rate_limit(text, int, int) from anon, authenticated;
revoke execute on function public.fn_rate_limit(text, text) from anon, authenticated;

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
  -- **قفل لكل دلو**: بلا قفل، عشر محاولات متزامنة تعدّ كلها قبل أن تُدرج
  -- واحدة منها، فتمرّ كلها تحت الحدّ.
  perform pg_advisory_xact_lock(hashtextextended('rate:' || p_bucket, 0));

  -- التنظيف بنافذة لا يختارها المستدعي.
  delete from public.rate_limit_events
  where occurred_at < now() - make_interval(secs => greatest(p_seconds, 86400));

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

-- الدخول الناجح يُفرغ دلوه: خمس محاولات خاطئة ثم صحيحة لا تقفل صاحبها بعدها.
create or replace function public.fn_rate_limit_clear(p_bucket text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limit_events where bucket = p_bucket;
$$;

revoke all on function public.fn_hit_rate_limit(text, int, int) from public;
revoke all on function public.fn_rate_limit(text, text) from public;
revoke all on function public.fn_rate_limit_clear(text) from public;
grant execute on function public.fn_rate_limit(text, text) to service_role;
grant execute on function public.fn_rate_limit_clear(text) to service_role;

create index idx_rate_limit_occurred on public.rate_limit_events (occurred_at);

-- ══ ٣ · التسجيل الذاتي: بحالة البداية وحدها، وتحت السعة فعلاً ══
drop policy participants_self_register on public.participants;

create policy participants_self_register on public.participants
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'registered'
    and baseline_percentage is null
    and deleted_at is null
    and public.fn_is_active()
    and public.fn_registration_state(program_id) = 'open'
  );

/**
 * `[BR-CAP-01]` السعة تحت التزامن.
 *
 * السياسة وحدها لا تكفي: تعدّ المسجَّلين بلقطة بداية الطلب، فتسجيلان
 * متزامنان على المقعد الأخير يريان كلاهما مقعداً فارغاً. القفل هنا يُسلسلهما،
 * والعدّ بعده يرى ما أُدرج قبله.
 */
create or replace function public.fn_guard_participant_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity      int;
  v_count         int;
  v_track_deleted timestamptz;
begin
  -- تاريخ الالتحاق لا يختاره المسجِّل.
  if (select auth.uid()) is not null then
    new.joined_at := now();
  end if;

  perform pg_advisory_xact_lock(hashtextextended('participants:' || new.program_id::text, 0));

  select capacity into v_capacity from public.programs where id = new.program_id;
  if v_capacity is not null then
    select count(*) into v_count
    from public.participants
    where program_id = new.program_id and deleted_at is null;
    if v_count >= v_capacity then
      raise exception 'اكتمل العدد في هذا البرنامج' using errcode = '23514';
    end if;
  end if;

  if new.track_id is not null then
    select capacity, deleted_at into v_capacity, v_track_deleted
    from public.tracks where id = new.track_id;

    if v_track_deleted is not null then
      raise exception 'هذا المسار غير متاح' using errcode = '23514';
    end if;

    if v_capacity is not null then
      select count(*) into v_count
      from public.participants
      where track_id = new.track_id and deleted_at is null;
      if v_count >= v_capacity then
        raise exception 'اكتمل العدد في هذا المسار' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_participants_capacity
  before insert on public.participants
  for each row execute function public.fn_guard_participant_capacity();

revoke all on function public.fn_guard_participant_capacity() from public;

-- الإجابة عن سؤالٍ **من برنامج التسجيل نفسه** لا من غيره.
drop policy admission_answers_insert on public.admission_answers;

create policy admission_answers_insert on public.admission_answers
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.participants pa
      join public.admission_questions q on q.program_id = pa.program_id
      where pa.id = admission_answers.participant_id
        and pa.user_id = (select auth.uid())
        and q.id = admission_answers.question_id
        and q.deleted_at is null
    )
  );

-- ══ ٤ · لا يمنح أحدٌ دوراً ما لا يملكه — ولا يُمسّ دور النظام ══
-- على غرار `fn_can_grant_role` [BR-ROLE-01]، لكن على مستوى محتوى الدور.
drop policy role_permissions_insert on public.role_permissions;
drop policy role_permissions_update on public.role_permissions;
drop policy roles_update on public.roles;

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (
    public.fn_has_permission('roles.write')
    and public.fn_has_permission(permission_code)
    and not exists (
      select 1 from public.roles r where r.id = role_permissions.role_id and r.is_system
    )
  );

create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using (
    public.fn_has_permission('roles.write')
    and public.fn_has_permission(permission_code)
    and not exists (
      select 1 from public.roles r where r.id = role_permissions.role_id and r.is_system
    )
  )
  with check (
    public.fn_has_permission('roles.write')
    and public.fn_has_permission(permission_code)
    and not exists (
      select 1 from public.roles r where r.id = role_permissions.role_id and r.is_system
    )
  );

create policy roles_update on public.roles
  for update to authenticated
  using (public.fn_has_permission('roles.write') and is_system = false)
  with check (public.fn_has_permission('roles.write') and is_system = false);

-- ══ ٥ · سجل التدقيق لا يقبل ما يكتبه أيٌّ كان ══
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

  if p_action = 'participant_registered' then
    -- الفعل الذاتي الوحيد: مرّة واحدة، وعلى تسجيل صاحبه.
    if p_entity_table <> 'participants'
       or not exists (
         select 1 from public.participants
         where id = p_entity_id and user_id = (select auth.uid())
       )
       or exists (
         select 1 from public.audit_log
         where action = 'participant_registered' and entity_id = p_entity_id
       ) then
      raise exception 'تدقيق تسجيل غير مطابق' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.fn_my_permissions()) then
    raise exception 'لا يُكتب تدقيق إداري بلا صلاحية' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, action, entity_table, entity_id, before, after)
  values ((select auth.uid()), p_action, p_entity_table, p_entity_id, p_before, p_after)
  returning id into v_id;

  return v_id;
end;
$$;

-- ══ ٦ · أرشفة المسار فعلٌ واحد ══
/**
 * المسار وخطته وأيامها في معاملة واحدة، أو لا شيء.
 *
 * **ومسارٌ فيه مشاركون لا يُؤرشَف:** أرشفته تترك مشاركين حاليين على مسار لا
 * يُرى، وواجبهم يتوقّف بلا تفسير.
 *
 * `security invoker`: سياسات الصفوف هي الفاصل. تُرجع فارغاً حين تُصفّى.
 */
create or replace function public.fn_archive_track(p_track_id uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stamp   timestamptz := now();
  v_program uuid;
  v_plans   uuid[];
begin
  if exists (
    select 1 from public.participants
    where track_id = p_track_id and deleted_at is null
  ) then
    raise exception 'في المسار مشاركون — انقلهم قبل أرشفته' using errcode = '23514';
  end if;

  update public.tracks set deleted_at = v_stamp
  where id = p_track_id and deleted_at is null
  returning program_id into v_program;

  if v_program is null then
    return null;
  end if;

  with archived as (
    update public.plans set deleted_at = v_stamp
    where track_id = p_track_id and deleted_at is null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_plans from archived;

  update public.plan_days set deleted_at = v_stamp
  where plan_id = any (v_plans) and deleted_at is null;

  perform public.fn_write_audit(
    'track_archived', 'tracks', p_track_id, null,
    jsonb_build_object('archived_plans', cardinality(v_plans))
  );

  return cardinality(v_plans);
end;
$$;

revoke all on function public.fn_archive_track(uuid) from public;
grant execute on function public.fn_archive_track(uuid) to authenticated;
