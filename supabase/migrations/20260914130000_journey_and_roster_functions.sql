-- 029 | «رحلتي» وقائمة المشاركين: حسابٌ في القاعدة لا صفوفٌ خام إلى الشاشة
--
-- **عطب صحّة قبل أن يكون بطئاً.** واجهة REST تقطع كل ناتج عند ١٠٠٠ صفّ بلا
-- خطأ. و«رحلتي» كانت تجلب صفّ إنجاز لكل واجب في كل يوم: بأربعة واجبات يُبلَغ
-- السقف بعد ٢٥٠ يوماً، فيُحسب اليوم الجاري من بيانات ناقصة، ويُعرَض للمشارك
-- يومٌ أرسله سلفاً، ويُرفَض إرساله. `tech/load/journey-load.ts` أعاده في
-- المشاركين المئة كلهم.
--
-- وشاشة المشاركين تجلب إنجاز البرنامج كله دفعة واحدة، فتبلغ السقف بعد
-- ثمانين مشاركاً تقريباً، وتضع كل معرّفات المشاركين في عنوان الطلب.
--
-- الحلّ دالتان تُرجعان **صفّاً لكل يوم** و**صفّاً لكل مشارك**، والتجميع في
-- القاعدة. وتحرسان نفسيهما في مطلعهما (`security definer`).
--
-- تراجع: نعم.

/**
 * أيام خطة المشارك، يوماً يوماً، بحالة كلٍّ منها.
 *
 * `has_work`: يوم عادي لشكله واجبٌ واحد على الأقل — شكلٌ بلا واجبات يُتخطّى
 * كالراحة، وإلا علق المشارك عنده. `task_count` و`done_count`: لليوم المُرسَل
 * من لقطته، ولغير المُرسَل عددُ واجبات شكله. فيُفرَّق «مكتمل» عن «جزئي».
 */
create or replace function public.fn_journey_days(p_participant_id uuid)
returns table (
  id          uuid,
  day_number  int,
  day_type    public.day_type,
  has_work    boolean,
  submitted   boolean,
  task_count  int,
  done_count  int
)
language sql
stable
security definer
set search_path = ''
as $$
  with participant as (
    select p.id, p.track_id
    from public.participants p
    where p.id = p_participant_id
      and p.deleted_at is null
      and (
        p.user_id = (select auth.uid())
        or public.fn_has_permission('participants.read', p.program_id)
      )
  ),
  plan_days as (
    select d.id, d.day_number, d.day_type, d.day_template_id
    from public.plan_days d
    join public.plans pl on pl.id = d.plan_id and pl.deleted_at is null
    join participant pt on pt.track_id = pl.track_id
    where d.deleted_at is null
  ),
  template_sizes as (
    select f.day_template_id, count(*)::int as n
    from public.day_template_fields f
    where f.deleted_at is null
      and f.day_template_id in (select day_template_id from plan_days)
    group by f.day_template_id
  ),
  submitted as (
    select a.plan_day_id, count(*)::int as n, (count(*) filter (where a.is_done))::int as done
    from public.achievements a
    where a.participant_id = (select id from participant)
      and a.deleted_at is null
    group by a.plan_day_id
  )
  select
    d.id,
    d.day_number,
    d.day_type,
    d.day_type = 'normal' and coalesce(t.n, 0) > 0,
    s.plan_day_id is not null,
    coalesce(s.n, t.n, 0),
    coalesce(s.done, 0)
  from plan_days d
  left join template_sizes t on t.day_template_id = d.day_template_id
  left join submitted s on s.plan_day_id = d.id
  order by d.day_number;
$$;

revoke all on function public.fn_journey_days(uuid) from public;
grant execute on function public.fn_journey_days(uuid) to authenticated;

/**
 * مشاركو البرنامج، صفّاً لكل مشارك، بصفحات.
 *
 * الاسم من ملفه — فمنسّقُ برنامجٍ لا يملك `users.read` يرى أسماء مشاركيه لا
 * أجزاء معرّفاتهم. والعدّ على **خطة مساره الحالي** وحدها: أيام العمل،
 * والمُرسَل منها، والمكتمل (أُتمّت واجباته كلها).
 */
create or replace function public.fn_program_participants(
  p_program_id uuid,
  p_limit      int default 200,
  p_offset     int default 0
)
returns table (
  id                  uuid,
  full_name           text,
  track_id            uuid,
  status              public.participant_status,
  joined_at           timestamptz,
  baseline_percentage numeric,
  work_days           int,
  submitted_days      int,
  complete_days       int,
  total               bigint
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
    select a.participant_id, a.plan_day_id, bool_and(a.is_done) as complete
    from public.achievements a
    join roster r on r.id = a.participant_id
    join public.plan_days d on d.id = a.plan_day_id and d.deleted_at is null
    join public.plans pl on pl.id = d.plan_id and pl.track_id = r.track_id
    where a.deleted_at is null
    group by a.participant_id, a.plan_day_id
  ),
  totals as (
    select participant_id,
           count(*)::int as submitted,
           (count(*) filter (where complete))::int as complete
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

-- ══ فهارس المفاتيح الأجنبية الناقصة ══
-- مفتاحٌ بلا فهرس يجعل كل حذفٍ أو تحقّقٍ على الجدول الأمّ مسحاً كاملاً للابن،
-- ويجعل الربط عليه مسحاً كذلك.
create index idx_user_roles_role on public.user_roles (role_id) where deleted_at is null;
create index idx_user_roles_scope on public.user_roles (scope_program_id) where deleted_at is null;
create index idx_notifications_kind on public.notifications (kind);
create index idx_admission_questions_track on public.admission_questions (track_id) where deleted_at is null;
create index idx_admission_answers_question on public.admission_answers (question_id) where deleted_at is null;
create index idx_track_change_from on public.track_change_requests (from_track_id);
create index idx_track_change_to on public.track_change_requests (to_track_id);
create index idx_track_change_decided_by on public.track_change_requests (decided_by);
create index idx_day_template_fields_field on public.day_template_fields (task_field_id) where deleted_at is null;
create index idx_plan_days_template on public.plan_days (day_template_id) where deleted_at is null;
create index idx_plan_days_exam on public.plan_days (exam_id) where deleted_at is null;
create index idx_achievements_field on public.achievements (task_field_id) where deleted_at is null;
