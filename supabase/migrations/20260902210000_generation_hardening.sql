-- 019 | تحصين محرّك التوليد — حدوده لا حسابه
--
-- مراجعة محايدة على الهجرة ٠١٧ خلصت إلى أن الحساب سليم وأن العطب في
-- **الحدود**: ما يحرس المحرّك من العالم حوله. وهذه سبعة منها.
--
-- **١ · القيد المأمور به في `adr/0021` ولم يُبنَ.** نصّه حرفياً: «تعديل
-- المقاطع بعد بدء المشاركين خطر: يُزيح رتب من بعده. يُعامَل معاملة الهجرة
-- الخطرة — يتحقّق من شرطه ويُجهض نفسه إن كان للمسار مشاركون ذوو إنجاز».
-- قبل `س٦` كان بلا أثر إذ لا إنجاز يُزاح، و`س٦` هو ما جعله مستحقّاً.
--
-- وهو **الطريق الوحيد الذي يقفز بالمشارك فوق ما لم يحفظه**: مقطع جديد
-- بترتيب أسبق يُزيح كل الرتب بعده، فمن بلغ الرتبة ٤١ يجدها فجأةً على وحدة
-- أخرى — والوحدات التي بينهما صارت خلفه فلن يراها أبداً. والحذف أصمت:
-- يصير طول المسار أقصر من رتبة المشارك، فتُعرَض له «أتممتَ مادة مسارك»
-- في يومه العاشر، ويتوقّف بلا رسالة خطأ واحدة.
--
-- **٢ · «الجاري وحده يُرسَل» كانت في الواجهة وحدها.** القرار معتمد في
-- `ENTITIES §ز`، ومطبَّق في `canSubmit` — ثم يُستهلَك بإخفاء زرّ. و`fn_submit_day`
-- لا تفحصه، فمن استدعاها بمعرّف اليوم الأربعين وهو في يومه الأول كتب لقطةً
-- كاذبة عليه، وسجّل الوحدتين نفسهما مرتين. `platform.md §٧`: **ما يُفرض في
-- التطبيق فقط غير مفروض**.
--
-- **٣ · انتقال الحالة كان يقع ولو لم يُكتب صفّ.** إرسال يوم راحة يُنتج صفر
-- صفوف، ثم تُقلَب الحالة إلى `memorizing` وتُلتزَم، والواجهة تُعلن خطأً —
-- أثرٌ مُلتزَم مع رسالة فشل، وهو أسوأ من النجاح الصامت.
--
-- ومعها: مفتاح مركّب يمنع إسناد مشارك إلى مسار من برنامج آخر · فحص أن
-- الحساب حيّ في مسار الكتابة الوحيد · حارس التعديل لا الحذف وحده · ونزع
-- تجاوز أمن الصفوف عن دالة لا تحتاجه.
--
-- تراجع: نعم.

-- ══ ١ · تجميد مقاطع المسار متى وُجد إنجاز ══
/**
 * `adr/0021 §قيود إلزامية` — المقاطع تُجمَّد لا تُمنَع.
 *
 * التجميد على **المسار** لا على المشارك: رتبة كل من عليه تُزاح معاً، فيكفي
 * وجود إنجاز واحد ليصير التعديل إتلافاً. ومقدار الضرر لا يُقاس بعدد من
 * تضرّر — واحدٌ يُسنَد له محفوظٌ ليس من مساره عطبٌ تامّ.
 */
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
    join public.participants pt on pt.id = a.participant_id
    where pt.track_id = v_track and a.deleted_at is null
  ) then
    raise exception 'لهذا المسار مشاركون ذوو إنجاز، فمقاطعه لا تُعدَّل'
      using errcode = '23514',
            hint = 'تعديل المقاطع يُزيح رتب من بعده، فيُسنَد للمشارك محفوظٌ ليس من مساره.';
  end if;

  return new;
end;
$$;

create trigger trg_track_ranges_frozen
  before insert or update or delete on public.track_content_ranges
  for each row execute function public.fn_guard_track_ranges_frozen();

comment on function public.fn_guard_track_ranges_frozen() is
  'adr/0021 | يُجهض تعديل مقاطع مسارٍ لمشاركيه إنجاز. الرتبة تُزاح فيُسنَد محفوظٌ ليس من المسار.';

revoke all on function public.fn_guard_track_ranges_frozen() from public;

-- ══ ٢ · حارس تعديل اليوم لا حذفه وحده ══
-- الحذف كان ممنوعاً، والتحويل إلى `rest` يفعل الأثر نفسه: `fn_plan_day_tasks`
-- تُرجِع فارغاً لغير العادي **قبل أن تفحص هل أُرسل**، فيختفي إنجاز المشارك من
-- كل شاشة وصفوفه باقية. والمضاعف يبقى قابلاً للتعديل: أثره على أول يوم لم
-- يُرسَل لا على لقطة مُثبَّتة (`BR-GEN-02`).
create or replace function public.fn_guard_plan_day_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  v_changed :=
    (new.deleted_at is not null and old.deleted_at is null)
    or new.day_type is distinct from old.day_type
    or new.day_template_id is distinct from old.day_template_id
    or new.exam_id is distinct from old.exam_id;

  if v_changed and exists (
    select 1 from public.achievements a
    where a.plan_day_id = old.id and a.deleted_at is null
  ) then
    raise exception 'لهذا اليوم إنجاز مسجَّل فلا يُحذف ولا يُغيَّر نوعه'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_plan_days_delete_guard on public.plan_days;
create trigger trg_plan_days_delete_guard
  before update of deleted_at, day_type, day_template_id, exam_id on public.plan_days
  for each row execute function public.fn_guard_plan_day_delete();

-- ══ ٣ · مسار المشارك من برنامجه ══
-- `fn_plan_day_tasks` تشتقّ المسار ← الخطة ← القالب ← المقاطع من `track_id`
-- وحده. فمشارك في برنامج أُسنِد إلى مسار برنامجٍ آخر يأخذ خطة الآخر وقوالبه،
-- بينما تسميات وحداته من برنامجه — أرقام برنامج بأسماء برنامج. والمفتاح
-- المركّب `uq_tracks_id_program` موجود منذ الهجرة ٠١٤ لهذا الغرض بعينه.
alter table public.participants
  add constraint fk_participants_track_program
  foreign key (track_id, program_id) references public.tracks (id, program_id)
  on delete restrict;

-- ══ ٤ · الإرسال: الجاري وحده، والحساب حيّ، ولا انتقال بلا كتابة ══
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
  v_track       uuid;
  v_expected    uuid;
  v_written     int;
begin
  select pt.id, pt.track_id into v_participant, v_track
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

  -- الطبقة الرابعة من الفحص الرباعي (`platform.md §٧`): حسابٌ أُوقِف ورمزه
  -- حيّ لا يواصل الكتابة. وهذا مسار الكتابة الوحيد الذي يتجاوز طبقة الصفحة.
  if not public.fn_is_active() then
    raise exception 'الحساب موقوف' using errcode = '42501';
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

  -- **الجاري وحده يُرسَل.** أول يوم عمل له حقول ولم يُرسَل. والحساب تحت
  -- القفل، فمن أرسل يوماً بينهما لا يمرّ اثنان على الموضع نفسه.
  select pd.id into v_expected
  from public.plan_days pd
  join public.plans pl on pl.id = pd.plan_id and pl.deleted_at is null
  where pl.track_id = v_track
    and pd.deleted_at is null
    and pd.day_type = 'normal'
    and exists (
      select 1 from public.day_template_fields dtf
      where dtf.day_template_id = pd.day_template_id and dtf.deleted_at is null
    )
    and not exists (
      select 1 from public.achievements a
      where a.participant_id = v_participant
        and a.plan_day_id = pd.id
        and a.deleted_at is null
    )
  order by pd.day_number
  limit 1;

  if v_expected is distinct from p_plan_day_id then
    raise exception 'يُرسَل اليوم الجاري وحده'
      using errcode = '42501',
            hint = 'الماضي أُرسل، والمستقبل يخلق سلسلة فيها ثقوب.';
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

  -- **لا انتقال حالةٍ بلا كتابة.** صفرُ صفوف يعني يوماً لا واجب فيه، وقلبُ
  -- الحالة عليه أثرٌ مُلتزَم مع رسالة فشل — أسوأ من النجاح الصامت.
  if v_written = 0 then
    raise exception 'لا واجب في هذا اليوم' using errcode = '23514';
  end if;

  -- أول إرسال يُنهي «سُجِّل ولم يبدأ». الحالة واقعةٌ تتبع الفعل لا خطوة إدارية.
  update public.participants
  set status = 'memorizing'
  where id = v_participant and status = 'registered';

  return v_written;
end;
$$;

comment on function public.fn_submit_day(uuid, uuid[]) is
  'إرسال اليوم الجاري وحده، مرة واحدة. النطاق يُحسَب هنا لا يُستقبَل، والحساب يُفحَص حيّاً.';

revoke all on function public.fn_submit_day(uuid, uuid[]) from public;
grant execute on function public.fn_submit_day(uuid, uuid[]) to authenticated;

-- ══ ٥ · نزع تجاوز أمن الصفوف عمّا لا يحتاجه ══
-- كانت `security definer` وممنوحة لكل مصادَق بلا شرط داخلي، فيقرأ أيٌّ كان
-- بنية مقاطع أي مسار. ولم تعد تحتاجه: للمشارك `track_ranges_read_participant`
-- وللإدارة `track_ranges_read`. و`platform.md §٧`: الدالة مرتفعة الامتياز
-- تحرس نفسها — وأهون منها ألا ترتفع.
create or replace function public.fn_track_ordinal_span(
  p_track_id uuid,
  p_from     int,
  p_to       int
)
returns table (from_sequence int, to_sequence int, part_order int)
language sql
stable
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

revoke all on function public.fn_track_ordinal_span(uuid, int, int) from public;
grant execute on function public.fn_track_ordinal_span(uuid, int, int) to authenticated;
