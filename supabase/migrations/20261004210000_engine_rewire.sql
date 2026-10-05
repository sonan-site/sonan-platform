-- 067 | توصيل ما بقي على الخطة القديمة بالمحرّك الجديد، ثم حذف القديم (adr/0036 · 0040 · 0041)
--
-- كل ما كان يقرأ `plan_days` و`achievements` يُعاد على `plan_values`
-- و`day_completions` و`field_marks` و`commitment_archive`: اللوحة وتنبيهاتها،
-- وقائمة المشاركين وسجلّ المشارك، وقبول تغيير المسار، وأرشفة المسار، والانسحاب،
-- والجاهزية وحارس النشر، والإعداد السريع، وحرّاس الحقول والمقاطع.
--
-- ثم يُحذف القديم: جدولاه، ودوالّ التوليد والإرسال وتحرير الأيام، وحرّاسها،
-- ونوع اليوم. **البيانات المحذوفة تجريبية كلها، بإذن الراعي الصريح (٤ أكتوبر
-- ٢٠٢٦)**. وأشكال الأيام تبقى أداةَ تعبئةٍ للخطة لا جزءاً منها، فلا حارس يربطها
-- بخطة.
--
-- تراجع: لا — يُحذف القديم وبياناته.

-- ══ الجاهزية وحارس النشر ══

/** للمسار خطةٌ يبدأ بها المشارك: خطته الفعلية بأيامٍ وقيم. */
create or replace function public.fn_track_has_plan(p_track_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plans p
    where p.id = public.fn_track_plan(p_track_id)
      and p.day_count > 0
      and exists (select 1 from public.plan_values v where v.plan_id = p.id and v.deleted_at is null)
  );
$$;

create or replace function public.fn_program_missing(p_program_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tracks     int;
  v_with_parts int;
  v_with_plan  int;
  v_units      int;
  v_fields     int;
  v_blocks     int;
  v_missing    text[] := array[]::text[];
begin
  select count(*), count(*) filter (where public.fn_track_has_plan(t.id))
  into v_tracks, v_with_plan
  from public.tracks t where t.program_id = p_program_id and t.deleted_at is null;

  select count(distinct r.track_id) into v_with_parts
  from public.track_content_ranges r
  join public.tracks t on t.id = r.track_id and t.deleted_at is null
  where t.program_id = p_program_id and r.deleted_at is null;

  select count(*) into v_units
  from public.content_units u where u.program_id = p_program_id and u.deleted_at is null;

  select count(*) into v_fields
  from public.task_fields f where f.program_id = p_program_id and f.deleted_at is null;

  select count(*) into v_blocks
  from public.page_blocks b where b.program_id = p_program_id and b.deleted_at is null;

  if v_tracks = 0 then v_missing := array_append(v_missing, 'المسارات'); end if;
  if v_units = 0 then v_missing := array_append(v_missing, 'المادة'); end if;
  if v_tracks > 0 and v_with_parts < v_tracks then
    v_missing := array_append(v_missing, 'نصيب كل مسار من المادة');
  end if;
  if v_fields = 0 then v_missing := array_append(v_missing, 'حقول الخطة'); end if;
  if v_tracks > 0 and v_with_plan < v_tracks then
    v_missing := array_append(v_missing, 'خطة لكل مسار');
  end if;
  if v_blocks = 0 then v_missing := array_append(v_missing, 'الصفحة المعلنة'); end if;

  return v_missing;
end;
$$;

drop function public.fn_program_readiness(uuid);
create function public.fn_program_readiness(p_program_id uuid)
returns table (
  tracks            int,
  tracks_with_parts int,
  content_units     int,
  task_fields       int,
  tracks_with_plan  int,
  public_blocks     int,
  participants      int,
  published         boolean,
  missing           text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select p.id, p.status
    from public.programs p
    where p.id = p_program_id
      and p.deleted_at is null
      and public.fn_has_permission('programs.read', p.id)
  ),
  live_tracks as (
    select t.id from public.tracks t
    join scope on scope.id = t.program_id
    where t.deleted_at is null
  )
  select
    (select count(*) from live_tracks)::int,
    (select count(distinct r.track_id)
       from public.track_content_ranges r
       join live_tracks lt on lt.id = r.track_id
      where r.deleted_at is null)::int,
    (select count(*) from public.content_units u
       join scope on scope.id = u.program_id
      where u.deleted_at is null)::int,
    (select count(*) from public.task_fields f
       join scope on scope.id = f.program_id
      where f.deleted_at is null)::int,
    -- خطةٌ بلا قيم لا تُعَدّ: المشارك لا يبدأ بها.
    (select count(*) from live_tracks lt where public.fn_track_has_plan(lt.id))::int,
    (select count(*) from public.page_blocks b
       join scope on scope.id = b.program_id
      where b.deleted_at is null)::int,
    (select count(*) from public.participants pa
       join scope on scope.id = pa.program_id
      where pa.deleted_at is null)::int,
    (select scope.status = 'published' from scope),
    public.fn_program_missing(scope.id)
  from scope;
$$;

-- ══ تنبيهات اللوحة ══

create or replace function public.fn_attention_items()
returns table (kind text, program_id uuid, program_name text, amount int)
language sql
stable
security definer
set search_path = ''
as $$
  -- مشاركون أحياء على مسارٍ مؤرشف: لا خطة تُقرأ لهم ولا يوم يُرصد.
  select 'orphan_track'::text, p.id, p.name, (count(*))::int
  from public.participants pa
  join public.tracks t on t.id = pa.track_id
  join public.programs p on p.id = pa.program_id and p.deleted_at is null
  where pa.deleted_at is null
    and t.deleted_at is not null
    and public.fn_has_permission('participants.write', p.id)
  group by p.id, p.name

  union all
  -- مسارٌ في برنامجٍ منشور بلا خطةٍ يبدأ بها: من سجّل فيه لا يجد ما يبدأ به.
  -- حارس النشر يفحص عند الانتقال وحده، فكل مسارٍ يُضاف بعده يمرّ بلا فحص.
  select 'track_without_plan', p.id, p.name, (count(*))::int
  from public.programs p
  join public.tracks t on t.program_id = p.id and t.deleted_at is null
  where p.deleted_at is null
    and p.status = 'published'
    and public.fn_has_permission('programs.write', p.id)
    and not public.fn_track_has_plan(t.id)
  group by p.id, p.name

  union all
  -- طلبات نقلٍ تنتظر البتّ — لمن يبتّ فيها وحده.
  select 'track_change', p.id, p.name, (count(*))::int
  from public.track_change_requests r
  join public.participants pa on pa.id = r.participant_id and pa.deleted_at is null
  join public.programs p on p.id = pa.program_id and p.deleted_at is null
  where r.deleted_at is null
    and r.status = 'pending'
    and public.fn_has_permission('participants.write', p.id)
  group by p.id, p.name

  union all
  -- برنامجٌ أُغلق ومشاركوه ما زالوا يتبعون الخطة: تُدعى اللوحة إلى واجبٍ انتهى.
  select 'closed_with_followers', p.id, p.name, (count(*))::int
  from public.participants pa
  join public.programs p on p.id = pa.program_id and p.deleted_at is null
  where pa.deleted_at is null
    and p.status = 'closed'
    and public.fn_follows_plan(pa.status)
    and public.fn_has_permission('participants.write', p.id)
  group by p.id, p.name

  union all
  -- منشورٌ بلا جهة تواصل: كل طريقٍ مسدودٍ في رحلة المشارك يقول «تواصل مع
  -- الإدارة» بلا وسيلة. وحارس النشر لا يفحصها.
  select 'no_contact', p.id, p.name, 1
  from public.programs p
  where p.deleted_at is null
    and p.status = 'published'
    and btrim(p.contact) = ''
    and public.fn_has_permission('programs.write', p.id)

  union all
  -- اكتمل المقعد فتوقّف التسجيل صامتاً: قرارٌ بين رفع السعة وتركها.
  select 'full', p.id, p.name, coalesce(p.capacity, 0)
  from public.programs p
  where p.deleted_at is null
    and p.status = 'published'
    and public.fn_has_permission('programs.write', p.id)
    and public.fn_registration_state(p.id) = 'full'

  union all
  -- حسابٌ بلا ملف: مدعوٌّ لم يُفعّل، أو داخلٌ بـGoogle لم يُكمل بياناته.
  select 'profile_missing', null::uuid, null::text, c.n
  from (select (count(*))::int as n from public.fn_pending_invites()) c
  where c.n > 0;
$$;

-- ══ واجب صاحب الحساب في لوحته ══

drop function public.fn_my_duties();
create function public.fn_my_duties()
returns table (
  participant_id uuid,
  program_id     uuid,
  program_name   text,
  program_status public.program_status,
  track_name     text,
  status         public.participant_status,
  follows_plan   boolean,
  day_count      int,
  done_days      int,
  progress_pct   numeric,
  due_days       int,
  last_marked_at timestamptz,
  proposed_track text,
  contact        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pa.id,
    p.id,
    p.name,
    p.status,
    t.name,
    pa.status,
    public.fn_follows_plan(pa.status),
    coalesce(e.day_count, 0),
    coalesce(pr.done_days, 0),
    coalesce(pr.percent, 0),
    case when e.plan_id is null then 0
         else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, now()) end,
    (select max(m.marked_at) from public.field_marks m
      where m.participant_id = pa.id and m.undone_at is null and m.deleted_at is null),
    r.to_name,
    p.contact
  from public.participants pa
  join public.programs p on p.id = pa.program_id and p.deleted_at is null
  -- بلا شرط `deleted_at` على المسار بقصد: المؤرشف يبقى اسمه ظاهراً لصاحبه.
  left join public.tracks t on t.id = pa.track_id
  left join lateral public.fn_participant_engine(pa.id) e on true
  -- النسبة من الدالة التي تقرؤها شاشة الرحلة — رقمٌ واحد على الشاشتين.
  left join lateral public.fn_progress_at(pa.id, now()) pr on true
  left join lateral (
    -- طلب النقل تُنشئه الإدارة عن المشارك لا العكس، فالصياغة «تُقترح» لا «طلبك».
    select tt.name as to_name
    from public.track_change_requests cr
    join public.tracks tt on tt.id = cr.to_track_id
    where cr.participant_id = pa.id
      and cr.status = 'pending'
      and cr.deleted_at is null
    limit 1
  ) r on true
  where pa.user_id = (select auth.uid())
    and pa.deleted_at is null
  order by p.name;
$$;

-- ══ سجلّ المشارك بمساراته ══

drop function public.fn_participant_record(uuid);
create function public.fn_participant_record(p_participant_id uuid)
returns table (
  track_id           uuid,
  track_name         text,
  is_current         boolean,
  done_days          int,
  first_completed_at timestamptz,
  last_completed_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.track_id
    from public.participants p
    where p.id = p_participant_id
      and p.deleted_at is null
      and (
        p.user_id = (select auth.uid())
        or public.fn_has_permission('participants.read', p.program_id)
      )
  )
  select
    t.id,
    t.name,
    t.id is not distinct from (select me.track_id from me),
    count(*)::int,
    min(c.completed_at),
    max(c.completed_at)
  from public.day_completions c
  join me on me.id = c.participant_id
  join public.tracks t on t.id = c.track_id
  where c.deleted_at is null and c.undone_at is null
  group by t.id, t.name
  order by min(c.completed_at);
$$;

-- ══ قائمة المشاركين ══

/**
 * المشاركون صفّاً لكل واحد: يوم خطته، وموعده، وتعثّره، وأيامه في مساراتٍ سبقت.
 *
 * **تسوّي قبل أن تعدّ** (`adr/0041`): الأرشيف يُكتب عند قراءة حال المشارك، فمن
 * غاب عن المنصة لا يُكتب تعثّره حتى يُقرأ — والمشرف يقرؤه هنا. والتسوية تبدأ
 * من آخر يومٍ مؤرشف، فتكرارها رخيص.
 */
drop function public.fn_program_participants(uuid, int, int);
create function public.fn_program_participants(p_program_id uuid, p_limit int default 200, p_offset int default 0)
returns table (
  id                  uuid,
  full_name           text,
  track_id            uuid,
  status              public.participant_status,
  joined_at           timestamptz,
  baseline_percentage numeric,
  day_count           int,
  done_days           int,
  due_days            int,
  stumbled_days       int,
  compensated_days    int,
  prior_done_days     int,
  total               bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('participants.read', p_program_id) then
    return;
  end if;

  perform public.fn_settle_commitment_at(pa.id, now())
  from public.participants pa
  where pa.program_id = p_program_id and pa.deleted_at is null
    and pa.track_id is not null and public.fn_follows_plan(pa.status);

  return query
  with roster as (
    select p.id, p.user_id, p.track_id, p.status, p.joined_at, p.baseline_percentage
    from public.participants p
    where p.program_id = p_program_id and p.deleted_at is null
  ),
  eng as (
    select r.id, e.program_id, e.track_id, e.plan_id, e.day_count, e.start_date
    from roster r
    cross join lateral public.fn_participant_engine(r.id) e
  ),
  -- الموعد يُحسب لكل (مسار، بداية، مدّة) مرةً لا لكل مشارك.
  dues as (
    select x.program_id, x.track_id, x.start_date, x.day_count,
           public.fn_due_days_at(x.program_id, x.track_id, x.start_date, x.day_count, now()) as n
    from (select distinct e.program_id, e.track_id, e.start_date, e.day_count from eng e where e.plan_id is not null) x
  ),
  done as (
    select c.participant_id,
           (count(*) filter (where c.plan_id = e.plan_id and c.track_id = e.track_id))::int as cur,
           (count(*) filter (where c.track_id is distinct from e.track_id))::int as prior
    from public.day_completions c
    join eng e on e.id = c.participant_id
    where c.deleted_at is null and c.undone_at is null
    group by c.participant_id
  ),
  stumbles as (
    select a.participant_id,
           (count(*) filter (where a.status = 'stumbled'))::int as n,
           (count(*) filter (where a.status = 'stumbled' and a.compensated_at is not null))::int as comp
    from public.commitment_archive a
    join eng e on e.id = a.participant_id and a.track_id = e.track_id
    where a.deleted_at is null
    group by a.participant_id
  )
  select
    r.id,
    pr.full_name,
    r.track_id,
    r.status,
    r.joined_at,
    r.baseline_percentage,
    coalesce(e.day_count, 0),
    coalesce(d.cur, 0),
    coalesce(du.n, 0),
    coalesce(s.n, 0),
    coalesce(s.comp, 0),
    coalesce(d.prior, 0),
    count(*) over ()
  from roster r
  left join public.profiles pr on pr.user_id = r.user_id
  left join eng e on e.id = r.id
  left join dues du on du.program_id = e.program_id and du.track_id = e.track_id
    and du.start_date = e.start_date and du.day_count = e.day_count
  left join done d on d.participant_id = r.id
  left join stumbles s on s.participant_id = r.id
  order by r.joined_at desc, r.id
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
end;
$$;

-- ══ تغيير المسار وأرشفته والانسحاب ══

create or replace function public.fn_decide_track_change(p_request_id uuid, p_program_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request     public.track_change_requests%rowtype;
  v_participant public.participants%rowtype;
  v_target      public.tracks%rowtype;
  v_record_days int;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'قرار غير صالح' using errcode = '22023';
  end if;

  select * into v_request
  from public.track_change_requests
  where id = p_request_id and deleted_at is null;

  if found then
    select * into v_participant
    from public.participants
    where id = v_request.participant_id
    for update;
  end if;

  -- من لا يملك الكتابة في برنامجه، أو يطلب من برنامجٍ آخر، لا يعرف حتى إن كان
  -- الطلب موجوداً.
  if v_request.id is null
     or v_participant.program_id is distinct from p_program_id
     or not public.fn_has_permission('participants.write', v_participant.program_id) then
    raise exception 'الطلب غير موجود' using errcode = 'P0002';
  end if;

  select * into v_request
  from public.track_change_requests
  where id = p_request_id
  for update;

  if v_request.status <> 'pending' then
    raise exception 'الطلب مبتوت فيه سلفاً' using errcode = '23514';
  end if;

  if p_decision = 'approved' then
    if v_participant.deleted_at is not null then
      raise exception 'المشارك لم يعد في البرنامج' using errcode = '23514';
    end if;

    if v_participant.track_id is distinct from v_request.from_track_id then
      raise exception 'تغيّر مسار المشارك بعد الطلب' using errcode = '23514';
    end if;

    if not public.fn_follows_plan(v_participant.status) then
      raise exception 'انتهت رحلة المشارك في البرنامج' using errcode = '23514';
    end if;

    select * into v_target from public.tracks where id = v_request.to_track_id;
    if v_target.id is null
       or v_target.deleted_at is not null
       or v_target.program_id <> v_participant.program_id then
      raise exception 'المسار المطلوب غير متاح' using errcode = '23514';
    end if;

    -- يُحكم على ما مضى في مساره القديم قبل أن يُنقل — بعده يُقرأ على الجديد.
    perform public.fn_settle_commitment_at(v_participant.id, now());

    select count(*)::int into v_record_days
    from public.day_completions c
    where c.participant_id = v_participant.id and c.deleted_at is null and c.undone_at is null;

    -- مشغّل السعة يعمل هنا: «اكتمل العدد في هذا المسار».
    update public.participants
    set track_id = v_request.to_track_id,
        baseline_percentage = v_request.baseline_percentage
    where id = v_participant.id;

    update public.track_change_requests
    set status = 'approved', decided_by = (select auth.uid()), decided_at = now()
    where id = p_request_id;

    perform public.fn_write_audit(
      'track_change_approved', 'track_change_requests', p_request_id,
      jsonb_build_object(
        'track_id', v_participant.track_id,
        'baseline_percentage', v_participant.baseline_percentage
      ),
      jsonb_build_object(
        'track_id', v_request.to_track_id,
        'baseline_percentage', v_request.baseline_percentage,
        'record_days', v_record_days
      )
    );
  else
    update public.track_change_requests
    set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
    where id = p_request_id;

    perform public.fn_write_audit(
      'track_change_rejected', 'track_change_requests', p_request_id,
      null, jsonb_build_object('decision', 'rejected')
    );
  end if;
end;
$$;

create or replace function public.fn_archive_track(p_track_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stamp   timestamptz := now();
  v_program uuid;
  v_plans   uuid[];
begin
  select program_id into v_program
  from public.tracks where id = p_track_id and deleted_at is null;

  -- الحارس أولاً: من لا يملك الكتابة في برنامج المسار لا يعرف حتى إن كان فيه مشاركون.
  if v_program is null or not public.fn_has_permission('programs.write', v_program) then
    return null;
  end if;

  if exists (
    select 1 from public.participants
    where track_id = p_track_id and deleted_at is null
  ) then
    raise exception 'في المسار مشاركون — انقلهم قبل أرشفته' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.field_marks m where m.track_id = p_track_id and m.deleted_at is null
  ) then
    raise exception 'للمسار سجلّ رصد محفوظ فلا يُؤرشَف' using errcode = '23514';
  end if;

  update public.tracks set deleted_at = v_stamp where id = p_track_id;

  -- خطته المخصّصة تُؤرشف معه، والافتراضية للبرنامج كله فتبقى.
  with archived as (
    update public.plans set deleted_at = v_stamp
    where track_id = p_track_id and deleted_at is null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_plans from archived;

  perform public.fn_write_audit(
    'track_archived', 'tracks', p_track_id, null,
    jsonb_build_object('archived_plans', cardinality(v_plans))
  );

  return cardinality(v_plans);
end;
$$;

create or replace function public.fn_withdraw_participation(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_days    int;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;

  select pa.program_id into v_program
  from public.participants pa
  where pa.id = p_participant_id
    and pa.user_id = v_uid
    and pa.deleted_at is null
  for update;

  if v_program is null then
    raise exception 'لا مشاركة لك بهذا المعرّف' using errcode = '23514';
  end if;

  select count(*)::int into v_days
  from public.day_completions c
  where c.participant_id = p_participant_id and c.deleted_at is null and c.undone_at is null;

  update public.participants
  set deleted_at = now()
  where id = p_participant_id;

  perform public.fn_write_audit(
    'participation_withdrawn', 'participants', p_participant_id,
    jsonb_build_object('program_id', v_program),
    jsonb_build_object('record_days', v_days)
  );
end;
$$;

-- ══ حرّاس الحقول والمقاطع ══

create or replace function public.fn_guard_task_field_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marked boolean := exists (
    select 1 from public.field_marks
    where task_field_id = old.id and deleted_at is null
  );
begin
  if new.kind is distinct from old.kind and v_marked then
    raise exception 'رصد مشاركون هذا الحقل، فنوعه لا يُغيَّر'
      using errcode = '23514';
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1
      from public.day_template_fields f
      join public.day_templates d on d.id = f.day_template_id and d.deleted_at is null
      where f.task_field_id = old.id and f.deleted_at is null
    ) then
      raise exception 'هذا الحقل مستعمَل في شكل يوم. أزِله منه أولاً'
        using errcode = '23514';
    end if;
    if v_marked then
      raise exception 'رصد مشاركون هذا الحقل، فلا يُحذف'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.fn_guard_track_ranges_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_track uuid;
begin
  v_track := coalesce(new.track_id, old.track_id);

  if exists (
    select 1 from public.day_completions c
    where c.track_id = v_track and c.deleted_at is null
  ) then
    raise exception 'لهذا المسار مشاركون ذوو إنجاز، فمقاطعه لا تُعدَّل'
      using errcode = '23514',
            hint = 'تعديل المقاطع يُزيح رتب من بعده، فيُسنَد للمشارك محفوظٌ ليس من مساره.';
  end if;

  return coalesce(new, old);
end;
$$;

-- ══ الإعداد السريع ══

/**
 * يُعِدّ برنامجاً فارغاً في خطوة: المادة سطراً لكل وحدة، ونصيب كل مسار المادةُ
 * كلها، وحقول الخطة وشكل يومٍ بها، **وخطةٌ افتراضية للبرنامج** تُكتب بـ`fn_save_plan`
 * نفسها — فتُفحص وتُنسخ كأي خطة.
 *
 * الحقل التراكمي الأول أساسٌ (الحفظ). ومقداره يقف عند آخر المادة: لا يوم
 * يتجاوز النصيب، ولا يومٌ بلا نشاط — فتقصر الخطة عمّا طُلب إن نفدت المادة
 * قبلها ولم يكن فيها حقلٌ عددي.
 */
drop function public.fn_quick_setup(uuid, text[], jsonb, int, int);
create function public.fn_quick_setup(p_program_id uuid, p_lines text[], p_fields jsonb, p_day_count int)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_units    int;
  v_tracks   int := 0;
  v_template uuid;
  v_track    record;
  v_field    jsonb;
  v_field_id uuid;
  v_kind     public.field_kind;
  v_amount   numeric;
  v_order    int := 0;
  v_base     boolean := false;
  v_plan     uuid;
  v_days     int := 0;
  v_counted  boolean := false;
  v_fields   jsonb := '[]'::jsonb;
  v_values   jsonb := '[]'::jsonb;
  f          jsonb;
  d          int;
  v_left     int;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على هذا البرنامج' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.content_units
    where program_id = p_program_id and deleted_at is null
  ) or exists (
    select 1 from public.task_fields
    where program_id = p_program_id and deleted_at is null
  ) or exists (
    select 1 from public.day_templates
    where program_id = p_program_id and deleted_at is null
  ) or exists (
    select 1 from public.plans
    where program_id = p_program_id and deleted_at is null
  ) then
    raise exception 'البرنامج ليس فارغاً — الإعداد السريع بداية لا تصحيح'
      using errcode = '23505';
  end if;

  if coalesce(array_length(p_lines, 1), 0) = 0 then
    raise exception 'المادة مطلوبة — سطر لكل عنصر' using errcode = '23514';
  end if;

  if p_day_count is null or p_day_count < 1 or p_day_count > 366 then
    raise exception 'مدّة الخطة بين ١ و٣٦٦' using errcode = '23514';
  end if;

  if jsonb_array_length(coalesce(p_fields, '[]'::jsonb)) = 0 then
    raise exception 'حقلٌ واحد على الأقل مطلوب' using errcode = '23514';
  end if;

  -- ══ ١ · المادة — تُرشَّح ثم تُرقَّم ══
  insert into public.content_units (program_id, sequence, label)
  select p_program_id, (row_number() over (order by t.ord))::int, btrim(t.line)
  from unnest(p_lines) with ordinality as t(line, ord)
  where btrim(t.line) <> '';

  get diagnostics v_units = row_count;

  if v_units = 0 then
    raise exception 'المادة مطلوبة — سطر لكل عنصر' using errcode = '23514';
  end if;

  -- ══ ٢ · نصيب كل مسار: المادة كاملة ══
  for v_track in
    select id from public.tracks
    where program_id = p_program_id and deleted_at is null
    order by sort_order
  loop
    insert into public.track_content_ranges (track_id, from_sequence, to_sequence, sort_order)
    values (v_track.id, 1, v_units, 0);
    v_tracks := v_tracks + 1;
  end loop;

  if v_tracks = 0 then
    raise exception 'لا مسارات في هذا البرنامج — أضِف مساراً أولاً' using errcode = '23514';
  end if;

  -- ══ ٣ · حقول الخطة، وشكل يومٍ بها أداةً للتعبئة ══
  insert into public.day_templates (program_id, name)
  values (p_program_id, 'اليوم المعتاد')
  returning id into v_template;

  for v_field in select * from jsonb_array_elements(p_fields)
  loop
    v_kind := (v_field ->> 'kind')::public.field_kind;
    v_amount := (v_field ->> 'amount')::numeric;
    if v_kind::text not in ('ranged', 'counted') then
      raise exception 'الإعداد السريع يقبل الحقل التراكمي والعددي وحدهما' using errcode = '23514';
    end if;
    if v_amount is null or v_amount <= 0 or (v_kind::text = 'ranged' and v_amount <> trunc(v_amount)) then
      raise exception 'مقدار «%» عددٌ موجب، وصحيحٌ في التراكمي', btrim(v_field ->> 'label') using errcode = '23514';
    end if;

    insert into public.task_fields (program_id, label, kind, sort_order, is_base)
    values (
      p_program_id,
      btrim(v_field ->> 'label'),
      v_kind,
      v_order,
      v_kind::text = 'ranged' and not v_base
    )
    returning id into v_field_id;
    v_base := v_base or v_kind::text = 'ranged';
    v_counted := v_counted or v_kind::text = 'counted';

    insert into public.day_template_fields
      (day_template_id, task_field_id, base_amount, sort_order)
    values (v_template, v_field_id, v_amount, v_order);

    v_fields := v_fields || jsonb_build_object('id', v_field_id, 'kind', v_kind::text, 'amount', v_amount);
    v_order := v_order + 1;
  end loop;

  -- ══ ٤ · الخطة الافتراضية ══
  -- أيامٌ بعد نفاد المادة بلا حقلٍ عددي تبقى بلا نشاط — فتقصر الخطة عندها.
  v_days := case when v_counted then p_day_count else least(p_day_count, (
    select max(ceil(v_units / (x ->> 'amount')::numeric))::int
    from jsonb_array_elements(v_fields) x where x ->> 'kind' = 'ranged'
  )) end;

  for d in 1 .. v_days loop
    for f in select * from jsonb_array_elements(v_fields)
    loop
      if f ->> 'kind' = 'counted' then
        v_values := v_values || jsonb_build_object('day', d, 'field_id', f ->> 'id', 'value', (f ->> 'amount')::numeric);
      else
        v_left := v_units - ((f ->> 'amount')::int * (d - 1));
        if v_left > 0 then
          v_values := v_values || jsonb_build_object(
            'day', d, 'field_id', f ->> 'id', 'amount', least((f ->> 'amount')::int, v_left));
        end if;
      end if;
    end loop;
  end loop;

  v_plan := public.fn_create_plan(p_program_id, null, false);
  perform public.fn_save_plan(
    v_plan, jsonb_build_object('day_count', v_days, 'values', v_values), 'الإعداد السريع'
  );

  return jsonb_build_object(
    'units', v_units,
    'tracks', v_tracks,
    'fields', v_order,
    'days', v_days
  );
end;
$$;

-- ══ حذف القديم ══

drop trigger if exists trg_plans_history_guard on public.plans;
drop function public.fn_guard_plan_history();
drop trigger if exists trg_day_templates_delete on public.day_templates;
drop function public.fn_guard_day_template_delete();
drop trigger if exists trg_day_template_fields_delete on public.day_template_fields;
drop function public.fn_guard_template_field_delete();

drop function public.fn_journey_days(uuid);
drop function public.fn_plan_day_tasks(uuid, uuid);
drop function public.fn_submit_day(uuid, uuid[]);
drop function public.fn_plan_insert_day(uuid, int, public.day_type, uuid, numeric, uuid);
drop function public.fn_plan_move_day(uuid, int);
drop function public.fn_plan_remove_day(uuid);
drop function public.fn_plan_max_days();

drop table public.achievements;
drop table public.plan_days;
drop function public.fn_guard_plan_day_delete();
drop type public.day_type;

-- ══ المنح ══
-- الدوالّ المُعاد إنشاؤها بعد `drop` تولد بمنح `public` الافتراضية — تُسحب ثم يُمنح ما يُستدعى من الواجهة.

revoke all on function public.fn_track_has_plan(uuid) from public, anon, authenticated;
revoke all on function public.fn_program_readiness(uuid) from public, anon;
revoke all on function public.fn_my_duties() from public, anon;
revoke all on function public.fn_participant_record(uuid) from public, anon;
revoke all on function public.fn_program_participants(uuid, int, int) from public, anon;
revoke all on function public.fn_quick_setup(uuid, text[], jsonb, int) from public, anon;

grant execute on function public.fn_program_readiness(uuid) to authenticated;
grant execute on function public.fn_my_duties() to authenticated;
grant execute on function public.fn_participant_record(uuid) to authenticated;
grant execute on function public.fn_program_participants(uuid, int, int) to authenticated;
grant execute on function public.fn_quick_setup(uuid, text[], jsonb, int) to authenticated;
