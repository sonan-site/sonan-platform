-- 039 | قبول تغيير المسار — المادة من أولها والسجلّ باقٍ (م-٤ · adr/0027)
--
-- **القرار:** من تُقبَل نقلته تبدأ مادة مساره الجديد من يومها الأول، وأيامه في
-- مساره السابق **لا تُمحى**: تظهر له وللإدارة.
--
-- **ما كان:** لا شيء يطبّق النقلة أصلاً، وزرّ القبول معطَّل. وكل عدٍّ محصورٌ بخطة
-- المسار الحالي، فيختفي السجلّ مع أول نقلة. وثلاث طرق حول الطلب:
--   - تغيير `participants.track_id` مباشرة من واجهة REST (سياسة التحديث الإدارية)؛
--   - وسم طلبٍ «مقبولاً» دون تطبيقه (سياسة تحديث الطلبات)؛
--   - وإدراج طلبٍ مقبولٍ من أوّله.
-- ومعها: السعة لا تُفحص عند النقل، وتجميد المقاطع يتبع من في المسار **الآن** —
-- فيُفكّ عن مسارٍ غادره أصحاب الإنجاز، وتُزاح رتب من يعود إليه.
--
-- **المعتمد هنا:** القرار كله (القبول والرفض) دالةٌ واحدة تحرس نفسها وتكتب
-- التدقيق في معاملتها، ولا طريق مباشر حولها.
--
-- تراجع: نعم — يُعاد تعريف الدوال بنسخها السابقة (٠٢٠ · ٠٢٧ · ٠٢٩ · ٠٣٢)،
-- وتُحذف الجديدة، وتُعاد السياسة والمنحة.

-- ══ ١ · طلب معلَّق واحد لكل مشارك ══
do $$
declare
  v_dupes text;
begin
  select string_agg(participant_id::text, ', ') into v_dupes
  from (
    select participant_id
    from public.track_change_requests
    where status = 'pending' and deleted_at is null
    group by participant_id
    having count(*) > 1
  ) d;

  if v_dupes is not null then
    raise exception 'لمشاركين أكثر من طلب معلَّق — يُبتّ فيها قبل الهجرة: %', v_dupes;
  end if;
end;
$$;

create unique index uq_track_change_one_pending
  on public.track_change_requests (participant_id)
  where status = 'pending' and deleted_at is null;

-- ══ ٢ · السعة تُفحص عند النقل ══
-- منسوخة من الهجرة ٠٣٢، والفارق سطر التخطّي: كان يتخطّى كل تحديثٍ لمن له مسار،
-- فيُنقل المشارك إلى مسارٍ مكتمل العدد. صار يتخطّى ما لا يغيّر المسار فقط.
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
  if tg_op = 'UPDATE' then
    if new.track_id is null or new.track_id is not distinct from old.track_id then
      return new;
    end if;
  else
    -- تاريخ الالتحاق لا يختاره المسجِّل.
    if (select auth.uid()) is not null then
      new.joined_at := now();
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('participants:' || new.program_id::text, 0));

  if tg_op = 'INSERT' then
    select capacity into v_capacity from public.programs where id = new.program_id;
    if v_capacity is not null then
      select count(*) into v_count
      from public.participants
      where program_id = new.program_id and deleted_at is null;
      if v_count >= v_capacity then
        raise exception 'اكتمل العدد في هذا البرنامج' using errcode = '23514';
      end if;
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
      where track_id = new.track_id and deleted_at is null and id <> new.id;
      if v_count >= v_capacity then
        raise exception 'اكتمل العدد في هذا المسار' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ══ ٣ · لا تغيير مسارٍ قائم إلا بقبول طلب ══
-- على نمط الهجرة ٠٣٥: الحارس `security invoker`، فـ`current_user` يكشف السياق.
-- الطلب المباشر من REST يُنفَّذ بدور `authenticated` فيُمنع، و`fn_decide_track_change`
-- تُنفَّذ بدور مالكها فتمرّ. وإسناد مسارٍ لمن لا مسار له ليس تغييراً فيبقى متاحاً.
create or replace function public.fn_guard_participant_track_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (old.track_id is not null and new.track_id is distinct from old.track_id)
     or new.baseline_percentage is distinct from old.baseline_percentage then
    raise exception 'تغيير المسار يمرّ بقبول طلب تغييره' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_guard_participant_track_change() from public;

-- الاسم يسبق `trg_participants_capacity_assign` أبجدياً: المشغّلات تعمل بترتيب
-- أسمائها، فيصل المستخدمَ سببُ المنع لا «اكتمل العدد».
create trigger trg_participants_block_track_change
  before update of track_id, baseline_percentage on public.participants
  for each row execute function public.fn_guard_participant_track_change();

-- ══ ٤ · المقاطع تتجمّد بسجلّها لا بمن في المسار الآن ══
-- منسوخة من الهجرة ٠٢٠ (بـ`coalesce(new, old)`). كان الشرط مشاركين **حاليّين**
-- ذوي إنجاز، فمسارٌ غادره أصحابه تُعدَّل مقاطعه، ومن يعود إليه تُزاح رتبه عن
-- محفوظه. صار الشرط: إنجازٌ على أي خطة لهذا المسار — ولو محذوفة.
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
    select 1
    from public.achievements a
    join public.plan_days pd on pd.id = a.plan_day_id
    join public.plans pl on pl.id = pd.plan_id
    where pl.track_id = v_track and a.deleted_at is null
  ) then
    raise exception 'لهذا المسار مشاركون ذوو إنجاز، فمقاطعه لا تُعدَّل'
      using errcode = '23514',
            hint = 'تعديل المقاطع يُزيح رتب من بعده، فيُسنَد للمشارك محفوظٌ ليس من مساره.';
  end if;

  return coalesce(new, old);
end;
$$;

-- ══ ٥ · خطةٌ لها سجلّ لا تُنقل ولا تُحذف ══
-- السجلّ التراكمي يُشتقّ من الإنجاز ← اليوم ← الخطة ← المسار. نقل الخطة إلى
-- مسارٍ آخر ينسب أيام المشارك إلى مسارٍ لم يدخله، وحذفها يُسقطها من سجلّه.
create or replace function public.fn_guard_plan_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.track_id is distinct from old.track_id
      or (new.deleted_at is not null and old.deleted_at is null))
     and exists (
       select 1
       from public.achievements a
       join public.plan_days pd on pd.id = a.plan_day_id
       where pd.plan_id = old.id and a.deleted_at is null
     ) then
    raise exception 'لهذه الخطة سجلّ إنجاز فلا تُنقل ولا تُحذف' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_guard_plan_history() from public;

create trigger trg_plans_history_guard
  before update of track_id, deleted_at on public.plans
  for each row execute function public.fn_guard_plan_history();

-- ══ ٦ · المسار ذو السجلّ لا يُؤرشَف ══
-- منسوخة من الهجرة ٠٢٧. الرفض الجديد برسالة مستقلة، بعد فحص الصلاحية وقبل أي
-- كتابة: كان حارس الأيام يرفضها في منتصفها برسالةٍ عن «يوم».
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
    select 1
    from public.achievements a
    join public.plan_days pd on pd.id = a.plan_day_id
    join public.plans pl on pl.id = pd.plan_id
    where pl.track_id = p_track_id and a.deleted_at is null
  ) then
    raise exception 'للمسار سجلّ إنجاز محفوظ فلا يُؤرشَف' using errcode = '23514';
  end if;

  update public.tracks set deleted_at = v_stamp where id = p_track_id;

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

-- ══ ٧ · القرار في الطلب — قبولاً أو رفضاً ══
/**
 * فعلٌ واحد في معاملة واحدة: فحص ← نقل ← بتّ ← تدقيق. فلا يبقى طلبٌ «مقبول» لم
 * يُطبَّق، ولا نقلةٌ بلا طلب، ولا تدقيقٌ لما لم يقع.
 *
 * **يقفل المشارك ثم الطلب**، فقبولان متزامنان للطلب نفسه يُبتّ أولهما ويُرفض الثاني
 * بـ«مبتوت سلفاً». وإرسالُ يومٍ في اللحظة نفسها ينتظر القفل ثم يُرفض، لأن يومه
 * لم يعد من خطة مساره.
 */
create or replace function public.fn_decide_track_change(
  p_request_id uuid,
  p_program_id uuid,
  p_decision   text
)
returns void
language plpgsql
volatile
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

    select count(distinct a.plan_day_id)::int into v_record_days
    from public.achievements a
    where a.participant_id = v_participant.id and a.deleted_at is null;

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

revoke all on function public.fn_decide_track_change(uuid, uuid, text) from public;
grant execute on function public.fn_decide_track_change(uuid, uuid, text) to authenticated;

-- ══ ٨ · قائمة المشاركين: الحالي ومعه ما سبق ══
-- منسوخة من الهجرة ٠٢٩ بعمودين جديدين. الأعمدة القائمة كما هي: أيام العمل
-- والمُرسَل والمكتمل **على خطة المسار الحالي**. والجديدان إنجازه في مساراتٍ
-- سابقة — بلا ترشيح المحذوف، فالسجلّ لا يسقط بحذفٍ لاحق.
drop function public.fn_program_participants(uuid, int, int);

create function public.fn_program_participants(
  p_program_id uuid,
  p_limit      int default 200,
  p_offset     int default 0
)
returns table (
  id                   uuid,
  full_name            text,
  track_id             uuid,
  status               public.participant_status,
  joined_at            timestamptz,
  baseline_percentage  numeric,
  work_days            int,
  submitted_days       int,
  complete_days        int,
  prior_submitted_days int,
  prior_complete_days  int,
  total                bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with roster as (
    select p.id, p.user_id, p.track_id, p.status, p.joined_at, p.baseline_percentage
    from public.participants p
    where p.program_id = p_program_id
      and p.deleted_at is null
      and public.fn_has_permission('participants.read', p_program_id)
  ),
  work as (
    select pl.track_id, count(*)::int as n
    from public.plan_days d
    join public.plans pl on pl.id = d.plan_id and pl.deleted_at is null
    join public.tracks t on t.id = pl.track_id and t.program_id = p_program_id
    where d.deleted_at is null
      and d.day_type = 'normal'
      and exists (
        select 1 from public.day_template_fields f
        where f.day_template_id = d.day_template_id and f.deleted_at is null
      )
    group by pl.track_id
  ),
  days as (
    select
      a.participant_id,
      a.plan_day_id,
      bool_and(a.is_done) as complete,
      bool_and(pl.track_id is not distinct from r.track_id) as on_current,
      bool_and(d.deleted_at is null) as live
    from public.achievements a
    join roster r on r.id = a.participant_id
    join public.plan_days d on d.id = a.plan_day_id
    join public.plans pl on pl.id = d.plan_id
    where a.deleted_at is null
    group by a.participant_id, a.plan_day_id
  ),
  totals as (
    select participant_id,
           (count(*) filter (where on_current and live))::int              as submitted,
           (count(*) filter (where on_current and live and complete))::int as complete,
           (count(*) filter (where not on_current))::int                   as prior_submitted,
           (count(*) filter (where not on_current and complete))::int      as prior_complete
    from days
    group by participant_id
  )
  select
    r.id,
    pr.full_name,
    r.track_id,
    r.status,
    r.joined_at,
    r.baseline_percentage,
    coalesce(w.n, 0),
    coalesce(t.submitted, 0),
    coalesce(t.complete, 0),
    coalesce(t.prior_submitted, 0),
    coalesce(t.prior_complete, 0),
    count(*) over ()
  from roster r
  left join public.profiles pr on pr.user_id = r.user_id
  left join work w on w.track_id = r.track_id
  left join totals t on t.participant_id = r.id
  order by r.joined_at desc, r.id
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.fn_program_participants(uuid, int, int) from public;
grant execute on function public.fn_program_participants(uuid, int, int) to authenticated;

-- ══ ٩ · سجلّ المشارك عبر مساراته ══
-- صفٌّ لكل مسارٍ له فيه إنجاز. للمشارك نفسه أو لمن يقرأ مشاركي برنامجه، وإلا
-- فارغة. `security definer` لأن الخطط والأيام لا تُقرأ للمشارك إلا في مساره الحالي.
create or replace function public.fn_participant_record(p_participant_id uuid)
returns table (
  track_id           uuid,
  track_name         text,
  is_current         boolean,
  submitted_days     int,
  complete_days      int,
  first_submitted_at timestamptz,
  last_submitted_at  timestamptz
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
  ),
  days as (
    select pl.track_id,
           a.plan_day_id,
           bool_and(a.is_done) as complete,
           min(a.submitted_at) as first_at,
           max(a.submitted_at) as last_at
    from public.achievements a
    join me on me.id = a.participant_id
    join public.plan_days d on d.id = a.plan_day_id
    join public.plans pl on pl.id = d.plan_id
    where a.deleted_at is null
    group by pl.track_id, a.plan_day_id
  )
  select
    t.id,
    t.name,
    t.id is not distinct from (select me.track_id from me),
    count(*)::int,
    (count(*) filter (where days.complete))::int,
    min(days.first_at),
    max(days.last_at)
  from days
  join public.tracks t on t.id = days.track_id
  group by t.id, t.name
  order by min(days.first_at);
$$;

revoke all on function public.fn_participant_record(uuid) from public;
grant execute on function public.fn_participant_record(uuid) to authenticated;

-- ══ ١٠ · التعليقات ══
comment on column public.participants.baseline_percentage is
  'تقدير الإدارة لمستواه عند قبول نقلته — للعرض والتدقيق، لا نقطة انطلاق للتوليد (adr/0027).';

-- ══ ١١ · السياسات: الطلب يُنشأ معلَّقاً، ويُبتّ فيه بالدالة وحدها ══
drop policy track_change_update on public.track_change_requests;

drop policy track_change_insert on public.track_change_requests;
create policy track_change_insert on public.track_change_requests
  for insert to authenticated
  with check (
    status = 'pending'
    and decided_by is null
    and decided_at is null
    and exists (
      select 1 from public.participants pa
      where pa.id = track_change_requests.participant_id
        and pa.deleted_at is null
        and pa.track_id = track_change_requests.from_track_id
        and public.fn_has_permission('participants.write', pa.program_id)
    )
  );

-- ══ ١٢ · المنح: لا تحديث بلا سياسة ══
revoke update on public.track_change_requests from authenticated;
