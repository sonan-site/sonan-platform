-- 049 | الحذف إلى السلّة، والمحو النهائي (adr/0034)
--
-- دالّتان `security definer` مملوكتان لـ`postgres` — **ولا سبيل غيرهما**:
-- لا دور يملك منحة `delete` على أي جدول (الهجرة ٠١٥)، ولا تُقبل سياسة حذف
-- (يفرضها `lib/db/core-schema.db-test.ts`). والمالك يتجاوز أمن الصفوف لغياب
-- `force row level security` عن القاعدة كلها.
--
-- **والاستعادة ليست دالّة ثالثة بقصد:** `restoreUser` القائم يستعيد الموقوف
-- منذ الهجرة ٠٠٢، ويكفيه أن يُفرّغ `purge_after` معه. وطريقان للفعل الواحد
-- يفترقان يوماً ما.
--
-- **والمحو يمشي على ترتيبٍ واحد صحيح**، فكل المفاتيح `restrict`:
--   إجابات القبول ← الإشعارات ← الأدوار ← طمس السجلّ ←
--   تفريغ صاحب المشاركة ← الملف ← حساب المصادقة.
--
-- تراجع: نعم — حذف الدالّتين.

-- ══ ١ · إلى السلّة ══
/**
 * يحذف الإداريُّ حساباً فيدخل السلّة: لا يدخل صاحبه، ومقعده يتحرّر، ويُمحى
 * بعد مدّة الاحتفاظ. ويُستعاد ما دام فيها.
 *
 * **ومقعده يتحرّر اليوم لا يوم محوه** — وهذا يخالف الإيقاف عمداً: الموقوف
 * يبقى مقعده محجوزاً لأنه سيعود، والمحذوف لا يعود. ولولا ذلك لانقلب برنامجٌ
 * من «اكتمل» إلى «مفتوح» بعد شهرٍ بلا حدثٍ ظاهر.
 *
 * **والموقوف يُحذف كما يُحذف الحيّ:** الإيقاف حالةٌ سابقة لا مانعة، وإلا
 * لوجب إعادةُ تفعيل من أُوقف ليُحذف — وهو طريقٌ سخيف.
 */
create or replace function public.fn_delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_profile uuid;
  v_binned  timestamptz;
  v_days    int;
  v_left    int;
begin
  if not public.fn_has_permission('users.write') then
    raise exception 'لا صلاحية لحذف الحسابات' using errcode = '42501';
  end if;

  -- من أراد حذف نفسه فله «أغلق حسابي» — وهو إغلاقٌ لا محو، بقرار الراعي.
  if p_user_id = v_uid then
    raise exception 'لا تحذف حسابك بنفسك' using errcode = '23514';
  end if;

  select id, purge_after into v_profile, v_binned
  from public.profiles
  where user_id = p_user_id;

  if v_profile is null then
    raise exception 'لا حساب بهذا المعرّف' using errcode = '23514';
  end if;

  if v_binned is not null then
    raise exception 'الحساب في السلّة سلفاً' using errcode = '23514';
  end if;

  -- نظير رفض `fn_close_my_account`: لا يختفي إداريٌّ فجأةً وأدواره قائمة.
  if exists (
    select 1 from public.user_roles where user_id = p_user_id and deleted_at is null
  ) then
    raise exception 'للحساب دورٌ إداري. اسحب أدواره أولاً، ثم احذفه' using errcode = '23514';
  end if;

  select coalesce((value->>'days')::int, 30) into v_days
  from public.settings
  where key = 'accounts.retention_days' and scope_program_id is null and deleted_at is null;

  update public.participants
  set deleted_at = now()
  where user_id = p_user_id and deleted_at is null;
  get diagnostics v_left = row_count;

  update public.profiles
  set deleted_at = coalesce(deleted_at, now()),
      purge_after = now() + make_interval(days => coalesce(v_days, 30))
  where id = v_profile;

  perform public.fn_write_audit(
    'account_deleted', 'profiles', v_profile, null,
    jsonb_build_object('participations_left', v_left, 'retention_days', coalesce(v_days, 30))
  );
end;
$$;

revoke all on function public.fn_delete_account(uuid) from public;
grant execute on function public.fn_delete_account(uuid) to authenticated;

-- ══ ٢ · المحو النهائي ══
/**
 * **حسابٌ واحدٌ في كل نداء، لا مسحٌ بالجملة.** والسبب تشغيليّ لا أسلوبيّ:
 * `pnpm test:db` يعمل على القاعدة الحيّة، فدالةٌ تمسح «كل ما انقضى» خطأُ
 * استدعاءٍ واحدٍ من فقدان بيانات حقيقية.
 *
 * **وتقبل المجدوِل كما تقبل الإنسان:** من دخل بدورٍ يحتاج `users.write`،
 * ومن نادى من داخل القاعدة (`postgres`) يمرّ — فتصلح للزرّ اليوم وللجدولة غداً.
 *
 * **وأربعة رفضٍ قبل أي حذف**، وكلٌّ منها يسقط على أي حسابٍ حيّ: خارج السلّة ·
 * غير محذوف · لم تنقضِ مدّته · له دورٌ قائم. فخطأٌ في معرّفٍ يُردّ لا يُنفَّذ.
 *
 * **وما يبقى بقصد:** المشاركة وأيام إنجازها (بلا صاحب)، وقرارات تغيير المسار،
 * وسجلّ التدقيق باسمٍ مطموس. فالشخص يُمحى، وتاريخ البرنامج لا ينقص.
 */
create or replace function public.fn_purge_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_email   text;
  v_staff   boolean;
  v_label   text;
  v_parts   int;
  v_gone    int;
begin
  if current_user in ('authenticated', 'anon')
     and not public.fn_has_permission('users.write') then
    raise exception 'لا صلاحية لمحو الحسابات' using errcode = '42501';
  end if;

  -- لا يُمحى إلا من كان في السلّة وانقضت مدّته. والوعد بثلاثين يوماً وعدٌ.
  select id into v_profile
  from public.profiles
  where user_id = p_user_id
    and deleted_at is not null
    and purge_after is not null
    and purge_after <= now()
  for update;

  if v_profile is null then
    raise exception 'لا حساب في السلّة انقضت مدّته بهذا المعرّف' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.user_roles where user_id = p_user_id and deleted_at is null
  ) then
    raise exception 'للحساب دورٌ إداري قائم — لا يُمحى وله سلطان' using errcode = '23514';
  end if;

  /**
   * **المرفقات تُوقف المحو كلَّه، ولا تُصنَّف.** `owner_id` من رفع الملف لا من
   * يخصّه الملف، و`entity_table` نصٌّ حرٌّ بلا قيد — فأي تصنيفٍ هنا تخمين.
   * ولا كاتب للجدول في المنصة بعد، فالشرط لا يقع اليوم؛ ويوم يقع **يفشل
   * صوتاً** بدل أن يمحو مادة برنامج بصمت.
   */
  if exists (select 1 from public.attachments where owner_id = p_user_id) then
    raise exception 'للحساب مرفقات. أحِل ملكيتها قبل محوه' using errcode = '23514';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_user_id;

  -- الصفة تبقى والاسم يذهب. والدور يُقرأ قبل حذفه — ولو كان مسحوباً.
  v_staff := exists (select 1 from public.user_roles where user_id = p_user_id);
  v_label := case when v_staff then 'إداريّ محذوف' else 'مشارك محذوف' end;

  select count(*)::int into v_parts
  from public.participants where user_id = p_user_id;

  -- ١ · كلامه عن نفسه
  delete from public.admission_answers
  where participant_id in (select id from public.participants where user_id = p_user_id);

  -- ٢ · صندوقه
  delete from public.notifications where recipient_id = p_user_id;

  -- ٣ · أدواره المسحوبة
  delete from public.user_roles where user_id = p_user_id;

  -- ٤ · طمس السجلّ: الفعل يبقى، والاسم يصير صفة، والمعرّف يبقى حرّاً بلا
  -- مفتاح — فتُجمع به أفعال الشخص الواحد ولا يدلّ على هويته.
  update public.audit_log set actor_label = v_label where actor_id = p_user_id;

  -- وبريد المدعوّ محفوظٌ نصّاً في فعل الدعوة — لا يشير إليه معرّف، فيُطمس بالبريد.
  if v_email is not null then
    update public.audit_log
    set after = (after - 'email') - 'full_name'
    where action = 'user_invited' and after->>'email' = v_email;
  end if;

  -- ٥ · قراراتُه عن غيره تبقى، ويُثبَّت اسمه فيها كما ثُبِّت في السجلّ.
  update public.track_change_requests
  set decided_by_label = coalesce(decided_by_label, v_label)
  where decided_by = p_user_id;

  -- وسببُه المكتوب بيده يذهب، والقرار يبقى. والعمود `not null`، فالبديل نصّ.
  update public.track_change_requests
  set reason = 'حُذف حساب صاحبه'
  where participant_id in (select id from public.participants where user_id = p_user_id);

  -- ٦ · المشاركة تبقى بلا صاحب — وأيام إنجازها معها.
  update public.participants set user_id = null where user_id = p_user_id;

  -- ٧ · الهوية. **ويُتحقَّق من العدد:** دالّةٌ يملكها `postgres` بشرطٍ مغلوط
  -- هي الشيء الوحيد في هذه القاعدة القادر على إفراغ جدول.
  delete from public.profiles where user_id = p_user_id;
  get diagnostics v_gone = row_count;
  if v_gone <> 1 then
    raise exception 'المحو يمسّ حساباً واحداً لا %', v_gone using errcode = '23514';
  end if;

  -- ٨ · ما لا مفتاح له في مخطط المصادقة فلا يتتالى
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.flow_state where user_id = p_user_id;
  delete from auth.users where id = p_user_id;

  -- التدقيق بإدراجٍ مباشر: `fn_write_audit` ترفض بلا `auth.uid()`، والمجدوِل بلا هوية.
  insert into public.audit_log (actor_id, actor_label, action, entity_table, entity_id, after)
  values (
    (select auth.uid()),
    (select p.full_name from public.profiles p where p.user_id = (select auth.uid())),
    'account_purged', 'profiles', v_profile,
    jsonb_build_object('kind', case when v_staff then 'staff' else 'participant' end,
                       'participations_kept', v_parts)
  );
end;
$$;

revoke all on function public.fn_purge_account(uuid) from public;
grant execute on function public.fn_purge_account(uuid) to authenticated;

-- ══ ٣ · قراءة السلّة ══
/**
 * `security definer` لأن الشاشة تحتاج `purge_after` مع الاسم، والشرط `users.read`
 * يُكتب هنا صراحةً ولا يُترك للسياسة.
 */
create or replace function public.fn_deleted_accounts()
returns table (
  user_id     uuid,
  full_name   text,
  deleted_at  timestamptz,
  purge_after timestamptz,
  is_staff    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.user_id,
    p.full_name,
    p.deleted_at,
    p.purge_after,
    exists (select 1 from public.user_roles ur where ur.user_id = p.user_id)
  from public.profiles p
  where public.fn_has_permission('users.read')
    and p.deleted_at is not null
    and p.purge_after is not null
  order by p.purge_after;
$$;

revoke all on function public.fn_deleted_accounts() from public;
grant execute on function public.fn_deleted_accounts() to authenticated;
