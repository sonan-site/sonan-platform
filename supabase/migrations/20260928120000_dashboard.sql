-- 046 | لوحة المتابعة تسأل القاعدة مرّةً واحدة (adr/0033)
--
-- اللوحة كانت صفحة توجيه: بطاقةٌ لكل مشاركة ورابطٌ إلى البرامج. وما ينتظر
-- الإدارة فعلاً — طلبُ نقلٍ معلَّق، برنامجٌ منشورٌ لا خطة فيه، مقعدٌ اكتمل —
-- لا يظهر في شاشةٍ أصلاً، فلا يُعرف إلا بتفقّد كل برنامج على حدة.
--
-- ثلاث دوال، **كلٌّ صفٌّ واحدٌ في نداء واحد**:
--   ١ · `fn_attention_items` — ما ينتظر قراراً أو إصلاحاً، مرشَّحاً بالصلاحية.
--   ٢ · `fn_my_duties`       — صفٌّ لكل مشاركةٍ لصاحبها، بأرقام رحلته.
--   ٣ · `fn_dashboard_counts`— أعداد مداخل الأقسام.
--
-- **والترشيح بالصلاحية داخل القاعدة لا في الشاشة** كما في `fn_program_readiness`:
-- من لا يملك الرمز لا يُرجَع له صفّ، فلا تُجلب صفوفٌ ثم تُخفى.
--
-- تراجع: نعم — حذف الدوال الثلاث.

-- ══ ١ · ما يحتاج انتباه الإدارة ══
/**
 * صفٌّ لكل حالةٍ تنتظر إنساناً. `kind` مفتاحٌ تقابله الشاشة بنصٍّ ورابط
 * (`lib/dashboard/attention.ts`) — فالنصّ العربي لا يُكتب في القاعدة.
 *
 * **وما ليس عطباً لا يدخل هنا:** المسوّدة عملٌ قيد الإعداد لا حالةٌ عالقة،
 * فلا تُعَدّ إنذاراً يوميّاً يُعتاد حتى يُهمَل.
 */
create or replace function public.fn_attention_items()
returns table (
  kind         text,
  program_id   uuid,
  program_name text,
  amount       int
)
language sql
stable
security definer
set search_path = ''
as $$
  -- مشاركون أحياء على مسارٍ مؤرشف: لا خطة تُقرأ لهم ولا يوم يُرسَل.
  select 'orphan_track'::text, p.id, p.name, (count(*))::int
  from public.participants pa
  join public.tracks t on t.id = pa.track_id
  join public.programs p on p.id = pa.program_id and p.deleted_at is null
  where pa.deleted_at is null
    and t.deleted_at is not null
    and public.fn_has_permission('participants.write', p.id)
  group by p.id, p.name

  union all
  -- مسارٌ في برنامجٍ منشور بلا خطةٍ ذات أيام: من سجّل فيه لا يجد ما يبدأ به.
  -- حارس النشر يفحص عند الانتقال وحده، فكل مسارٍ يُضاف بعده يمرّ بلا فحص.
  select 'track_without_plan', p.id, p.name, (count(*))::int
  from public.programs p
  join public.tracks t on t.program_id = p.id and t.deleted_at is null
  where p.deleted_at is null
    and p.status = 'published'
    and public.fn_has_permission('programs.write', p.id)
    and not exists (
      select 1
      from public.plans pl
      join public.plan_days d on d.plan_id = pl.id and d.deleted_at is null
      where pl.track_id = t.id and pl.deleted_at is null
    )
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
  -- الحالتان واحدةٌ في القاعدة (`fn_pending_invites`)، فلا يُقال «دعوة» عنهما.
  select 'profile_missing', null::uuid, null::text, c.n
  from (select (count(*))::int as n from public.fn_pending_invites()) c
  where c.n > 0;
$$;

revoke all on function public.fn_attention_items() from public;
grant execute on function public.fn_attention_items() to authenticated;

-- ══ ٢ · واجبات صاحب الحساب ══
/**
 * صفٌّ لكل مشاركةٍ حيّة **للمستدعي وحده**، بأرقامٍ مجموعةٍ في القاعدة.
 *
 * `security definer` لسببٍ بعينه: سياسة قراءة البرامج تُظهر المنشور وحده،
 * فبرنامجٌ انتقل إلى «مغلق» كان يُسقط صفّ صاحبه من اللوحة كلّه — لا بطاقة
 * ولا رسالة. والاسم هنا يُقرأ من الجدول مباشرةً فلا يختفي أحدٌ بصمت.
 *
 * و`fn_journey_days` تُرجع صفّاً لكل يوم — خطة سنةٍ ٣٦٦ صفّاً. فتُجمَع هنا في
 * جانبيٍّ واحد، ولا تُنقل إلى الشاشة.
 */
create or replace function public.fn_my_duties()
returns table (
  participant_id    uuid,
  program_id        uuid,
  program_name      text,
  program_status    public.program_status,
  track_name        text,
  status            public.participant_status,
  follows_plan      boolean,
  work_days         int,
  submitted_days    int,
  complete_days     int,
  current_day       int,
  last_submitted_at timestamptz,
  proposed_track    text,
  contact           text
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
    coalesce(d.work_days, 0),
    coalesce(d.submitted_days, 0),
    coalesce(d.complete_days, 0),
    d.current_day,
    a.last_at,
    r.to_name,
    p.contact
  from public.participants pa
  join public.programs p on p.id = pa.program_id and p.deleted_at is null
  -- بلا شرط `deleted_at` على المسار بقصد: المؤرشف يبقى اسمه ظاهراً لصاحبه.
  left join public.tracks t on t.id = pa.track_id
  left join lateral (
    select
      (count(*) filter (where j.has_work))::int as work_days,
      (count(*) filter (where j.has_work and j.submitted))::int as submitted_days,
      -- المكتمل: أُتمّت واجباته كلها — ومن أرسل فارغاً لا يُعَدّ منها
      -- (`dayState` في `lib/participants/journey.ts`، والمعادلة واحدة).
      (count(*) filter (
        where j.has_work and j.submitted and j.done_count > 0 and j.done_count >= j.task_count
      ))::int as complete_days,
      -- اليوم الجاري: **أول يوم عملٍ لم يُرسَل**. و`has_work` تحمل شرط
      -- `day_type = 'normal'` أصلاً، فالراحة والاختبار متخطّيان.
      (min(j.day_number) filter (where j.has_work and not j.submitted))::int as current_day
    from public.fn_journey_days(pa.id) j
  ) d on true
  left join lateral (
    select max(ac.submitted_at) as last_at
    from public.achievements ac
    where ac.participant_id = pa.id and ac.deleted_at is null
  ) a on true
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

revoke all on function public.fn_my_duties() from public;
grant execute on function public.fn_my_duties() to authenticated;

-- ══ ٣ · أعداد مداخل الأقسام ══
/**
 * أربعة أعداد في صفٍّ واحد، كلٌّ بصلاحيته. ومن لا يملك شيئاً يأخذ أصفاراً —
 * والشاشة لا تعرض مدخلاً لا يملكه أصلاً، فالصفر لا يصل إليه.
 */
create or replace function public.fn_dashboard_counts()
returns table (
  programs     int,
  published    int,
  participants int,
  role_holders int
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select p.id, p.status
    from public.programs p
    where p.deleted_at is null
      and public.fn_has_permission('programs.read', p.id)
  )
  select
    (select count(*) from mine)::int,
    (select count(*) from mine where status = 'published')::int,
    (select count(*)
       from public.participants pa
      where pa.deleted_at is null
        and public.fn_has_permission('participants.read', pa.program_id))::int,
    (case
       when public.fn_has_permission('users.read')
         then (select count(distinct ur.user_id)
                 from public.user_roles ur
                where ur.deleted_at is null)
       else 0
     end)::int;
$$;

revoke all on function public.fn_dashboard_counts() from public;
grant execute on function public.fn_dashboard_counts() to authenticated;
