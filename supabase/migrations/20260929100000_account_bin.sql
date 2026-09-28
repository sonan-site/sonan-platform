-- 048 | سلّة المحذوفات: البنية وحدها، بلا محوٍ بعد (adr/0034)
--
-- هذه الهجرة **لا تحذف شيئاً**. تُمهّد لما بعدها: حالةٌ ثالثة للحساب، وسجلٌّ
-- يحفظ اسم فاعله بنفسه فلا يستعيره من جدولٍ سيزول، وقيودٌ تُفكّ لتُمكِن المحو.
-- ودوالّ الحذف والمحو في الهجرة التالية — فلو ظهر فيها عطبٌ بقي هذا قائماً بلا ضرر.
--
-- تراجع: نعم — الأعمدة تُسقَط والقيود تُعاد.

-- ══ ١ · الحالة الثالثة: في السلّة ══
/**
 * `deleted_at` في الملفات يحمل معنيين سلفاً: «أوقفته الإدارة» و«أغلقه صاحبه»،
 * و`accountState()` يردّ «موقوف» على كليهما. وبناء السلّة فوقه يجعل أول محوٍ
 * يمسح **حساباتٍ أُوقفت تأديباً لتبقى شاهدة**. فالعلامة مستقلّة.
 */
alter table public.profiles add column purge_after timestamptz;

comment on column public.profiles.purge_after is
  'موعد المحو النهائي. فارغ = إيقافٌ أو إغلاقٌ لا يُمحى أبداً. وممتلئ = في سلّة المحذوفات.';

-- وتعليق الجدول كان يقول «لا حذف حساب» — يُصحَّح هنا لا يبقى يناقض سلوكه.
comment on table public.profiles is
  'امتداد جدول المصادقة. الإيقاف = deleted_at + إبطال الجلسات. والحذف يزيد purge_after فيدخل السلّة، ويُمحى بعدها محواً لا رجعة فيه (adr/0034).';

-- فهرسٌ على المستحقّ وحده: السلّة قائمة قصيرة، والمسح الكامل لا يلزم.
create index idx_profiles_purge_due on public.profiles (purge_after)
  where deleted_at is not null and purge_after is not null;

/**
 * **والحارس قائمةُ منعٍ لا قائمةُ سماح:** يمنع `deleted_at` و`user_id` وحدهما،
 * وما سواهما يكتبه صاحب الملف بنفسه. فبلا إضافة العمود هنا **يؤجّل المستخدم
 * موعد محوه أو يلغيه بطلبٍ مباشر**. وهي علّة `tracks.deleted_at` نفسها (٠٤٧).
 */
create or replace function public.fn_guard_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- داخل دالة موثوقة، أو من الخادم، أو مالك القاعدة: ليس طلب مستخدمٍ مباشراً.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- بلا هوية = لا يصل هنا من REST. والإداري الحيّ يعدّل ما يشاء.
  if (select auth.uid()) is null or public.fn_has_permission('users.write') then
    return new;
  end if;

  if new.deleted_at is distinct from old.deleted_at
     or new.purge_after is distinct from old.purge_after
     or new.user_id is distinct from old.user_id then
    raise exception 'حالة الحساب لا تُعدَّل إلا من الإدارة'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ══ ٢ · مدّة الاحتفاظ إعدادٌ لا رقمٌ مكتوب ══
insert into public.settings (key, value, scope_program_id, description)
values ('accounts.retention_days', '{"days": 30}'::jsonb, null,
        'كم يوماً يبقى الحساب المحذوف في السلّة قبل محوه نهائياً')
on conflict do nothing;

-- ══ ٣ · السجلّ يحفظ اسم فاعله بنفسه ══
/**
 * الشاشة تستعير اسم الفاعل من `profiles` بوصلة `user_id` — وصفّ الملف سيُمحى.
 * وتفريغ `actor_id` وحده **يفسد المعنى**: الفاعل الفارغ يُعرَض «المنصة»، وهي
 * كلمة أفعال الآلة (`bootstrap_admin` · `rate_limit_exceeded`). فسجلٌّ يقول
 * «المنصة أوقفت حساباً» أسوأ من سجلٍّ ناقص: يوهم بجواب.
 *
 * **والختم لحظة الكتابة لا لحظة المحو:** فلا يُعدَّل السجلّ في التشغيل العادي،
 * ولا يضيع الاسم إن انقطع المحو في منتصفه.
 */
alter table public.audit_log add column actor_label text;

comment on column public.audit_log.actor_label is
  'اسم الفاعل وقت الفعل. يُختم عند الكتابة فيبقى بعد زوال حسابه، ويُطمس عند المحو.';

-- ردمٌ مرّةً واحدة للصفوف القائمة — وهي عشرة.
update public.audit_log a
   set actor_label = p.full_name
  from public.profiles p
 where p.user_id = a.actor_id and a.actor_label is null;

/**
 * نسخةٌ خامسة: تختم الاسم وتُبقي ما قبلها كما هو (الهجرة ٠٤٥).
 *
 * والفاعل يبقى من `auth.uid()` لا من معامل — فلا كتابة باسم غير.
 */
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

  if p_action in ('participant_registered', 'participation_withdrawn') then
    -- الأفعال الذاتية: على مشاركة صاحبها، ومرّةً لكلٍّ.
    if p_entity_table <> 'participants'
       or not exists (
         select 1 from public.participants
         where id = p_entity_id and user_id = (select auth.uid())
       )
       or exists (
         select 1 from public.audit_log
         where action = p_action and entity_id = p_entity_id
       ) then
      raise exception 'تدقيق ذاتيّ غير مطابق' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.fn_my_permissions()) then
    raise exception 'لا يُكتب تدقيق إداري بلا صلاحية' using errcode = '42501';
  end if;

  insert into public.audit_log
    (actor_id, actor_label, action, entity_table, entity_id, before, after)
  values (
    (select auth.uid()),
    (select p.full_name from public.profiles p where p.user_id = (select auth.uid())),
    p_action, p_entity_table, p_entity_id, p_before, p_after
  )
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * وإغلاق الحساب يكتب تدقيقه بإدراجٍ مباشر (لأن صاحبه لا يملك صلاحية)، فيختم
 * اسمه هو الآخر — والملف ما زال قائماً لحظة الكتابة.
 */
create or replace function public.fn_close_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_profile uuid;
  v_name    text;
  v_left    int;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;

  select id, full_name into v_profile, v_name
  from public.profiles
  where user_id = v_uid and deleted_at is null;

  if v_profile is null then
    raise exception 'الحساب مغلق سلفاً أو غير مكتمل' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.user_roles where user_id = v_uid and deleted_at is null
  ) then
    raise exception 'لديك دور إداري. اطلب سحب أدوارك قبل إغلاق حسابك' using errcode = '23514';
  end if;

  update public.participants
  set deleted_at = now()
  where user_id = v_uid and deleted_at is null;
  get diagnostics v_left = row_count;

  update public.profiles set deleted_at = now() where id = v_profile;

  -- مباشرة لا عبر `fn_write_audit`: تلك تشترط صلاحية، والمستخدم العادي لا يملكها.
  insert into public.audit_log (actor_id, actor_label, action, entity_table, entity_id, after)
  values (v_uid, v_name, 'account_closed', 'profiles', v_profile,
          jsonb_build_object('participations_left', v_left));
end;
$$;

-- ══ ٤ · القيود تُفكّ ليُمكِن المحو ══
/**
 * القيدان يمنعان حذف `auth.users` ما بقي للشخص فعلٌ في السجلّ أو قرارٌ بتّ فيه.
 * ويُسقَطان لا يُفرَّغ عمودهما: المعرّف يبقى **حرّاً بلا مفتاح**، فيُجمع به فعل
 * الشخص الواحد ولو زال، ولا يدلّ على هويته — وهو معرّفٌ عشوائيّ لا يُقرَأ منه شيء.
 */
alter table public.audit_log drop constraint audit_log_actor_id_fkey;

alter table public.track_change_requests
  drop constraint track_change_requests_decided_by_fkey;

alter table public.track_change_requests add column decided_by_label text;

comment on column public.track_change_requests.decided_by_label is
  'اسم من بتّ في الطلب وقت بتّه. يبقى بعد زوال حسابه — فالقرار لا يبقى بلا صاحب.';

/**
 * ومشاركةُ المحذوف **تبقى بلا صاحب** (قرار الراعي): الأيام والإنجاز لا تُمحى،
 * فأرقام البرنامج لا تنقص بأثر رجعي. والمفتاح يبقى حارساً ما دامت القيمة موجودة —
 * يُرفع عنه `not null` وحده.
 */
alter table public.participants alter column user_id drop not null;

comment on column public.participants.user_id is
  'فارغ = مُحي حساب صاحبه، والسجلّ باقٍ بلا هوية. ولا يُدرَج فارغاً — السياسة تشترط المطابقة.';
