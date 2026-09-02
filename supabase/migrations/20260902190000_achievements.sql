-- 017 | الإنجاز ومحرّك التوليد
--
-- **أخطر منطق في المرحلة الأولى.** خطأ هنا يُسنِد للمشارك محفوظاً ليس من
-- مساره، أو يقفز به فوق ما لم يحفظه — ولا يظهر إلا بعد أن يبني عليه شهراً.
--
-- القواعد الثلاث (`ENTITIES §ز`):
--
-- `BR-GEN-01` بداية الحقل = نهاية آخر إنجاز **فعليّ** لنفس الحقل + ١،
--   **على الرتبة المحلّية للمسار** لا على رقم الوحدة (`adr/0021`). ويومٌ لم
--   يُتَمّ فيه الحقل لا يُقدّمه — فمن أتمّ الحفظ دون المراجعة تقدّم حفظه
--   وبقيت مراجعته.
--
-- `BR-GEN-02` التوليد **للأمام فقط**: يومٌ أُرسِل تُخزَّن لقطته ولا تُعاد
--   حسابها أبداً. والتعديل الرجعي يؤثر على أول يوم لم يُرسَل بعد لا على ما قبله.
--
-- `BR-GEN-03` يوم الراحة يُتجاوَز تماماً — وهو مجّاني هنا: الراحة بلا قالب
--   فبلا حقول فبلا إنجاز، فلا تدخل السلسلة أصلاً.
--
-- **التوليد في دالة واحدة** `fn_plan_day_tasks`: تستهلكها الشاشة والإرسال
-- معاً. ولو حُسب النطاق في الشاشة ثم أُرسل، لصار المشارك مصدرَ نطاقه —
-- و«الواجهة عرض لا إدخال» تسقط.
--
-- تراجع: نعم.

-- ══ الإنجاز ══
create table public.achievements (
  id            uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete restrict,
  plan_day_id   uuid not null references public.plan_days (id) on delete restrict,
  task_field_id uuid not null references public.task_fields (id) on delete restrict,
  is_done       boolean not null default false,
  ordinal_start int,
  ordinal_end   int,
  range_start   int,
  range_end     int,
  amount        numeric(10,2),
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.achievements is
  'لا يُسجَّل إنجاز يوم إلا بإرساله. والإنجاز الجزئي مرصود: أتمّ الحفظ ولم يُتمّ المراجعة.';
comment on column public.achievements.ordinal_end is
  'موضع السلسلة — الرتبة المحلّية. عليها يُبنى اليوم التالي، فتبقى صحيحة ولو تغيّرت مقاطع المسار.';
comment on column public.achievements.range_end is
  'لقطة رقم الوحدة — **الواقعة المسجَّلة**: ما حفظه المشارك فعلاً. تُعرَض ولا يُبنى عليها حساب.';

-- **رقمان لا واحد، ولقطتان لا تكرار.** الرتبة موضعٌ في السلسلة، ورقم الوحدة
-- واقعةٌ في المادة. لو خُزّنت الرتبة وحدها، وتغيّرت مقاطع المسار، لتغيّر سجلّ
-- ما حفظه المشارك بأثر رجعي. ولو خُزّن الرقم وحده، لانقطعت السلسلة عند أول
-- وحدة تخرج من المسار. وكلاهما يُكتب مرة واحدة لحظة الإرسال فلا ينحرفان.

create unique index idx_achievements_unique
  on public.achievements (participant_id, plan_day_id, task_field_id)
  where deleted_at is null;
create index idx_achievements_chain
  on public.achievements (participant_id, task_field_id, ordinal_end)
  where deleted_at is null and is_done;
create index idx_achievements_day
  on public.achievements (plan_day_id) where deleted_at is null;

alter table public.achievements add constraint chk_achievements_ordinals
  check (
    (ordinal_start is null and ordinal_end is null)
    or (ordinal_start > 0 and ordinal_end >= ordinal_start)
  );
alter table public.achievements add constraint chk_achievements_ranges
  check (
    (range_start is null and range_end is null)
    or (range_start > 0 and range_end > 0)
  );
-- غير المُتَمّ بلا لقطة: اللقطة تثبيتُ واقعةٍ حدثت، ولم تحدث.
alter table public.achievements add constraint chk_achievements_done_snapshot
  check (is_done or (ordinal_start is null and range_start is null));

create trigger trg_achievements_updated_at before update on public.achievements
  for each row execute function public.fn_set_updated_at();
alter table public.achievements enable row level security;

-- ══ عرض النطاق العابر لفجوة ══

/**
 * تفكيك مدى رُتَبٍ إلى مقاطع وحدات.
 *
 * مدىً يعبر حدّ مقطعين **يُعرَض مقطعين**: «من ٢٨ إلى ٣٠، ومن ٩٥ إلى ١٠٢».
 * و«من ٢٨ إلى ١٠٢» كذبٌ على المشارك — بينهما أبوابٌ ليست من مساره.
 */
create or replace function public.fn_track_ordinal_span(
  p_track_id uuid,
  p_from     int,
  p_to       int
)
returns table (from_sequence int, to_sequence int, part_order int)
language sql
stable
security definer
set search_path = ''
as $$
  with segments as (
    select
      from_sequence,
      to_sequence,
      sort_order,
      coalesce(
        sum(to_sequence - from_sequence + 1) over (
          order by sort_order, from_sequence
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as preceding_units
    from public.track_content_ranges
    where track_id = p_track_id and deleted_at is null
  )
  select
    (from_sequence + greatest(p_from - preceding_units - 1, 0))::int,
    (from_sequence + least(
      p_to - preceding_units - 1,
      to_sequence - from_sequence
    ))::int,
    (row_number() over (order by sort_order, from_sequence))::int
  from segments
  where p_from <= preceding_units + (to_sequence - from_sequence + 1)
    and p_to > preceding_units
  order by sort_order, from_sequence;
$$;

comment on function public.fn_track_ordinal_span(uuid, int, int) is
  'adr/0021 | مدى الرُّتَب إلى مقاطع وحدات. مقطعان لا مدىً واحد حين تُعبَر فجوة.';

-- ══ من يتبع الخطة ══
/**
 * الحالات التي يُتابَع فيها الواجب اليومي — **في موضع واحد**.
 *
 * `registered` منها: من سُجّل ولم يبدأ لا يبدأ إن لم يرَ خطته. وأول إرسال
 * ينقله إلى `memorizing`. و`qualified` منها: من اجتاز التصفيات يواصل حفظه
 * إلى النهائي. والخارجون — `not_qualified` · `not_passed` · `passed` —
 * انتهت رحلتهم فلا واجب يومي لهم.
 *
 * `immutable` فيُدمَج في خطة الاستعلام ولا يُكلّف السياسة نداءً لكل صفّ.
 */
create or replace function public.fn_follows_plan(p_status public.participant_status)
returns boolean language sql immutable set search_path = '' as $$
  select p_status in ('registered', 'memorizing', 'qualified');
$$;

-- ══ المشارك ومساره ══

/** مسار المشارك — تعبر أمن الصفوف لتُستعمَل في السياسات (adr/0023 نظير). */
create or replace function public.fn_participant_track_id(p_participant_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select track_id from public.participants
  where id = p_participant_id and deleted_at is null;
$$;

/** مشارك المستخدم الحالي في برنامج. فارغ = ليس مشاركاً فيه. */
create or replace function public.fn_my_participant(p_program_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.participants
  where user_id = (select auth.uid())
    and program_id = p_program_id
    and public.fn_follows_plan(status)
    and deleted_at is null
  limit 1;
$$;

/** خطة المشارك عبر مساره. فارغ = بلا مسار أو بلا خطة. */
create or replace function public.fn_participant_plan_id(p_participant_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select pl.id
  from public.participants pt
  join public.plans pl on pl.track_id = pt.track_id and pl.deleted_at is null
  where pt.id = p_participant_id and pt.deleted_at is null;
$$;

-- ══ محرّك التوليد ══

/**
 * واجبات يومٍ لمشارك — **المصدر الوحيد**، تستهلكها الشاشة والإرسال معاً.
 *
 * اليوم المُرسَل يُرجَع من لقطته المخزَّنة (`BR-GEN-02`)، وغير المُرسَل يُحسَب
 * حيّاً. فالتعديل الرجعي لا يمسّ ما أُرسِل، ويظهر أثره في أول يوم لم يُرسَل.
 */
create or replace function public.fn_plan_day_tasks(
  p_participant_id uuid,
  p_plan_day_id    uuid
)
returns table (
  task_field_id uuid,
  label         text,
  kind          public.field_kind,
  sort_order    int,
  amount        numeric,
  ordinal_start int,
  ordinal_end   int,
  is_done       boolean,
  range_start   int,
  range_end     int,
  submitted     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_track_id   uuid;
  v_program_id uuid;
  v_owner      uuid;
  v_plan_id    uuid;
  v_day_number int;
  v_day_type   public.day_type;
  v_template   uuid;
  v_multiplier numeric;
  v_units      int;
  v_submitted  boolean;
begin
  select pt.track_id, pt.program_id, pt.user_id
  into v_track_id, v_program_id, v_owner
  from public.participants pt
  where pt.id = p_participant_id and pt.deleted_at is null;
  if v_track_id is null then
    return;
  end if;

  -- **تحرس نفسها.** الدالة تتجاوز أمن الصفوف، فبلا هذا الشرط يقرأ أي مصادَق
  -- واجبَ أي مشارك بتمرير معرّفه. المشارك نفسه، أو من يملك قراءة مشاركي البرنامج.
  if v_owner is distinct from (select auth.uid())
     and not public.fn_has_permission('participants.read', v_program_id) then
    raise exception 'لا صلاحية لك على واجب هذا المشارك' using errcode = '42501';
  end if;

  select pd.plan_id, pd.day_number, pd.day_type, pd.day_template_id, pd.amount_multiplier
  into v_plan_id, v_day_number, v_day_type, v_template, v_multiplier
  from public.plan_days pd
  where pd.id = p_plan_day_id and pd.deleted_at is null;

  -- اليوم من خطة مسار المشارك أو لا شيء: يومُ مسارٍ آخر ليس واجبه.
  if v_plan_id is null or v_plan_id is distinct from public.fn_participant_plan_id(p_participant_id) then
    return;
  end if;

  if v_day_type <> 'normal' then
    return;
  end if;

  select exists (
    select 1 from public.achievements a
    where a.participant_id = p_participant_id
      and a.plan_day_id = p_plan_day_id
      and a.deleted_at is null
  ) into v_submitted;

  -- ══ المُرسَل: لقطته وحدها ══
  if v_submitted then
    return query
    select
      a.task_field_id,
      tf.label,
      tf.kind,
      dtf.sort_order,
      a.amount,
      a.ordinal_start,
      a.ordinal_end,
      a.is_done,
      a.range_start,
      a.range_end,
      true
    from public.achievements a
    join public.task_fields tf on tf.id = a.task_field_id
    left join public.day_template_fields dtf
      on dtf.day_template_id = v_template and dtf.task_field_id = a.task_field_id
    where a.participant_id = p_participant_id
      and a.plan_day_id = p_plan_day_id
      and a.deleted_at is null
    order by coalesce(dtf.sort_order, 0), tf.label;
    return;
  end if;

  -- ══ غير المُرسَل: يُحسَب حيّاً ══
  v_units := public.fn_track_unit_count(v_track_id);

  return query
  with fields as (
    select
      tf.id,
      tf.label,
      tf.kind,
      dtf.sort_order,
      -- مقدار اليوم = الأساسي × مضاعف اليوم، ولا ينزل عن واحد.
      greatest(1, round(dtf.base_amount * v_multiplier))::int as qty
    from public.day_template_fields dtf
    join public.task_fields tf on tf.id = dtf.task_field_id and tf.deleted_at is null
    where dtf.day_template_id = v_template and dtf.deleted_at is null
  ),
  starts as (
    select
      f.*,
      -- BR-GEN-01: نهاية آخر إنجاز **مُتَمّ** لنفس الحقل في يوم أسبق، + ١.
      coalesce((
        select max(a.ordinal_end)
        from public.achievements a
        join public.plan_days pd on pd.id = a.plan_day_id
        where a.participant_id = p_participant_id
          and a.task_field_id = f.id
          and a.is_done
          and a.ordinal_end is not null
          and a.deleted_at is null
          and pd.plan_id = v_plan_id
          and pd.day_number < v_day_number
          and pd.deleted_at is null
      ), 0) + 1 as o_start
    from fields f
  )
  select
    s.id,
    s.label,
    s.kind,
    s.sort_order,
    s.qty::numeric,
    -- الحقل العددي لا يدخل التوليد إطلاقاً: مستقلٌّ يوماً بيوم.
    case when s.kind = 'ranged' and s.o_start <= v_units then s.o_start end,
    case when s.kind = 'ranged' and s.o_start <= v_units
         then least(s.o_start + s.qty - 1, v_units) end,
    false,
    case when s.kind = 'ranged' and s.o_start <= v_units
         then public.fn_track_unit_at(v_track_id, s.o_start) end,
    case when s.kind = 'ranged' and s.o_start <= v_units
         then public.fn_track_unit_at(v_track_id, least(s.o_start + s.qty - 1, v_units)) end,
    false
  from starts s
  order by s.sort_order, s.label;
end;
$$;

comment on function public.fn_plan_day_tasks(uuid, uuid) is
  'BR-GEN-01/02/03 | المصدر الوحيد لواجب اليوم. المُرسَل من لقطته، وغيره يُحسَب حيّاً.';

/**
 * إرسال اليوم.
 *
 * **المشارك يرسل علامات إتمام لا أرقاماً.** النطاق والمقدار يُحسبان هنا من
 * الدالة نفسها التي عرضتهما — فلا يصير المشارك مصدر نطاقه. ولا إرسال مرتين:
 * اللقطة تُثبَّت مرة واحدة (`BR-GEN-02`).
 *
 * `security definer` **لأن `achievements` بلا سياسة إدراج قصداً**: لو فُتحت
 * لكتب المشارك نطاقه بيده. فالكتابة محصورة هنا، والدالة تفحص بنفسها أن
 * المستدعي هو صاحب المشاركة وأنها نشطة — لا تتّكل على سياسة تحتها.
 */
create or replace function public.fn_submit_day(
  p_plan_day_id uuid,
  p_done_fields uuid[]
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant uuid;
  v_program     uuid;
  v_track       uuid;
  v_written     int;
begin
  select pt.id, pt.program_id, pt.track_id into v_participant, v_program, v_track
  from public.participants pt
  join public.plans pl on pl.track_id = pt.track_id and pl.deleted_at is null
  join public.plan_days pd on pd.plan_id = pl.id and pd.deleted_at is null
  where pd.id = p_plan_day_id
    and pt.user_id = (select auth.uid())
    and public.fn_follows_plan(pt.status)
    and pt.deleted_at is null;

  if v_participant is null then
    raise exception 'لست مشاركاً في خطة هذا اليوم' using errcode = '42501';
  end if;

  -- قفل المشارك: إرسالان متزامنان لليوم نفسه يكتبان لقطتين متعارضتين.
  perform 1 from public.participants where id = v_participant for update;

  if exists (
    select 1 from public.achievements
    where participant_id = v_participant
      and plan_day_id = p_plan_day_id
      and deleted_at is null
  ) then
    raise exception 'أُرسل هذا اليوم سلفاً' using errcode = '23505';
  end if;

  insert into public.achievements (
    participant_id, plan_day_id, task_field_id,
    is_done, ordinal_start, ordinal_end, range_start, range_end, amount
  )
  select
    v_participant,
    p_plan_day_id,
    t.task_field_id,
    done.marked,
    case when done.marked then t.ordinal_start end,
    case when done.marked then t.ordinal_end end,
    case when done.marked then t.range_start end,
    case when done.marked then t.range_end end,
    t.amount
  from public.fn_plan_day_tasks(v_participant, p_plan_day_id) t
  cross join lateral (
    select t.task_field_id = any(coalesce(p_done_fields, '{}'::uuid[])) as marked
  ) done;

  get diagnostics v_written = row_count;

  -- أول إرسال يُنهي «سُجِّل ولم يبدأ». الحالة واقعةٌ تتبع الفعل لا خطوة إدارية.
  update public.participants
  set status = 'memorizing'
  where id = v_participant and status = 'registered';

  return v_written;
end;
$$;

comment on function public.fn_submit_day(uuid, uuid[]) is
  'إرسال يوم مرة واحدة. النطاق يُحسَب هنا لا يُستقبَل — الواجهة عرض لا إدخال.';

-- ══ منع مسح خطةٍ لها إنجاز ══
/**
 * الوعد المكتوب في `س٥`: «حين تُبنى achievements يُمنع المسح على خطة لها
 * إنجاز مسجَّل». المسح قبلها تصحيحُ خطة، وبعدها إتلافُ عمل مشاركين.
 */
create or replace function public.fn_guard_plan_day_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1 from public.achievements a
      where a.plan_day_id = old.id and a.deleted_at is null
    ) then
      raise exception 'لهذا اليوم إنجاز مسجَّل فلا يُحذف' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_plan_days_delete_guard
  before update of deleted_at on public.plan_days
  for each row execute function public.fn_guard_plan_day_delete();

-- ══ السياسات ══

-- الإدارة تقرأ إنجاز برنامجها؛ والمشارك يقرأ إنجازه وحده.
create policy achievements_read_admin on public.achievements
  for select to authenticated
  using (
    exists (
      select 1 from public.participants pt
      where pt.id = achievements.participant_id
        and public.fn_has_permission('participants.read', pt.program_id)
    )
  );

create policy achievements_read_own on public.achievements
  for select to authenticated
  using (
    achievements.participant_id in (
      select id from public.participants
      where user_id = (select auth.uid()) and deleted_at is null
    )
  );

-- لا سياسة إدراج ولا تحديث: الكتابة عبر `fn_submit_day` وحدها، وهي تحسب
-- النطاق بنفسها. سياسةُ إدراج مفتوحة تعني أن المشارك يكتب نطاقه بيده.

-- ══ قراءة المشارك لخطته — الوعد الثاني من `س٥` ══
-- المشارك ليس له `programs.read`، ويحتاج خطته ومادته وحقوله ليرى واجبه.

create policy plans_read_participant on public.plans
  for select to authenticated
  using (
    plans.track_id in (
      select track_id from public.participants
      where user_id = (select auth.uid()) and public.fn_follows_plan(status) and deleted_at is null
    )
  );

create policy plan_days_read_participant on public.plan_days
  for select to authenticated
  using (
    exists (
      select 1 from public.participants pt
      join public.plans pl on pl.track_id = pt.track_id and pl.deleted_at is null
      where pt.user_id = (select auth.uid())
        and public.fn_follows_plan(pt.status)
        and pt.deleted_at is null
        and pl.id = plan_days.plan_id
    )
  );

create policy day_templates_read_participant on public.day_templates
  for select to authenticated
  using (
    day_templates.program_id in (
      select program_id from public.participants
      where user_id = (select auth.uid()) and public.fn_follows_plan(status) and deleted_at is null
    )
  );

create policy day_template_fields_read_participant on public.day_template_fields
  for select to authenticated
  using (
    public.fn_day_template_program_id(day_template_id) in (
      select program_id from public.participants
      where user_id = (select auth.uid()) and public.fn_follows_plan(status) and deleted_at is null
    )
  );

create policy task_fields_read_participant on public.task_fields
  for select to authenticated
  using (
    task_fields.program_id in (
      select program_id from public.participants
      where user_id = (select auth.uid()) and public.fn_follows_plan(status) and deleted_at is null
    )
  );

create policy content_units_read_participant on public.content_units
  for select to authenticated
  using (
    content_units.program_id in (
      select program_id from public.participants
      where user_id = (select auth.uid()) and public.fn_follows_plan(status) and deleted_at is null
    )
  );

create policy track_ranges_read_participant on public.track_content_ranges
  for select to authenticated
  using (
    track_content_ranges.track_id in (
      select track_id from public.participants
      where user_id = (select auth.uid()) and public.fn_follows_plan(status) and deleted_at is null
    )
  );

-- ══ المنح — adr/0023: الهجرة تحمل ثلاثة لا اثنين ══
grant select on public.achievements to authenticated;
-- لا `insert` ولا `update`: لا سياسة تحتهما، والكتابة بدالة `security definer`.

revoke all on function public.fn_track_ordinal_span(uuid, int, int) from public;
revoke all on function public.fn_follows_plan(public.participant_status) from public;
grant execute on function public.fn_follows_plan(public.participant_status) to authenticated;
revoke all on function public.fn_participant_track_id(uuid) from public;
revoke all on function public.fn_my_participant(uuid) from public;
revoke all on function public.fn_participant_plan_id(uuid) from public;
revoke all on function public.fn_guard_plan_day_delete() from public;
revoke all on function public.fn_plan_day_tasks(uuid, uuid) from public;
revoke all on function public.fn_submit_day(uuid, uuid[]) from public;

-- `fn_participant_track_id` و`fn_participant_plan_id` بلا منحة: مساعدتان
-- داخليتان تُستدعيان من دوال `security definer` فتُنفَّذان بحقّ المالك.
grant execute on function public.fn_track_ordinal_span(uuid, int, int) to authenticated;
grant execute on function public.fn_my_participant(uuid) to authenticated;
grant execute on function public.fn_plan_day_tasks(uuid, uuid) to authenticated;
grant execute on function public.fn_submit_day(uuid, uuid[]) to authenticated;
