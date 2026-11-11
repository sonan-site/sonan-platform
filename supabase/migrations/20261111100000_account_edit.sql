-- تعديل الإدارة لبيانات المشارك، وسجلّ تعديلات البيانات (adr/0059 · قرار الراعي ١١ نوفمبر).
--
-- **كل تعديلٍ يُسجَّل** — بيد صاحبه أو بيد الإدارة — فلا تكون الإدارة غائبةً عمّا تغيّر بعد التسجيل.
-- والتسجيل بمشغّلَين على الجدولين لا في دوال الشاشة: أي طريقٍ إلى الصفّ (الشاشة، PostgREST مباشرةً،
-- دالةٌ بصلاحية المالك تعمل باسم مستخدم) يمرّ به.
--
-- ما لا يُسجَّل: صاحب الحساب يملأ حقلاً **فارغاً** (الاستكمال عند التسجيل) — فالسجلّ للتغيير لا للإنشاء.
-- والإدارة تُسجَّل في كل حال، ومنه ملء الفارغ.
--
-- تراجع: نعم — حذف المشغّلين والدوال والسياسة، وإرجاع رقعتي المحو والإشعارات.

-- ══ ١ · الأهلية: مصدرٌ واحد للفحص والسجلّ ══
/**
 * ما يُخرج الحساب عن شرط مشاركاته الحيّة لو صار ميلاده وجنسه كما يُمرَّر — كلٌّ بمفتاحه (`kind` + `scope`
 * = المسار أو البرنامج)، فيُقارَن ما قبل التعديل بما بعده:
 * - **العمر يوم التسجيل** (`joined_at` بتوقيت الرياض، adr/0047) — لا اليوم، فمن كبر بعد دخوله لا يُوسَم.
 * - حدّ المسار (`tracks.min_age/max_age`) وأدنى عمر البرنامج (`programs.min_age`).
 * - جنس البرنامج (`programs.allowed_gender`).
 * - والبرنامج المحذوف والمسار المؤرشف خارج الحساب.
 *
 * النواة بلا منح: يستدعيها المشغّل (بصلاحية المالك) والغلاف وحدهما — فلا يسأل مشاركٌ عن أهلية غيره.
 */
create function public.fn_account_fit_core(p_user_id uuid, p_birth date, p_gender public.gender)
returns table (kind text, scope uuid, message text)
language sql
stable
set search_path = ''
as $$
  with live as (
    select pa.joined_at, g.id as program_id, g.name as program_name, g.min_age as program_min, g.allowed_gender,
           t.id as track_id, t.name as track_name, t.min_age, t.max_age,
           case when p_birth is null then null
                else date_part('year', age((pa.joined_at at time zone 'Asia/Riyadh')::date, p_birth))::int
           end as age_then
    from public.participants pa
    join public.programs g on g.id = pa.program_id and g.deleted_at is null
    left join public.tracks t on t.id = pa.track_id and t.deleted_at is null
    where pa.user_id = p_user_id and pa.deleted_at is null
  )
  select 'age', l.track_id,
         format('عمره يوم تسجيله %s، وحدّ مسار «%s» %s', coalesce(l.age_then::text, 'مجهول'), l.track_name,
           case when l.min_age is not null and l.max_age is not null then format('من %s إلى %s', l.min_age, l.max_age)
                when l.min_age is not null then format('من %s فأكثر', l.min_age)
                else format('حتى %s', l.max_age) end)
  from live l
  where l.track_id is not null and not public.fn_age_fits(l.min_age, l.max_age, l.age_then)
  union all
  select 'age', l.program_id,
         format('عمره يوم تسجيله %s، وأدنى عمرٍ في برنامج «%s» %s', coalesce(l.age_then::text, 'مجهول'),
           l.program_name, l.program_min)
  from live l
  where l.program_min is not null and (l.age_then is null or l.age_then < l.program_min)
  union all
  select 'gender', l.program_id,
         format('برنامج «%s» %s', l.program_name,
           case l.allowed_gender when 'male' then 'للذكور وحدهم' else 'للإناث وحدهن' end)
  from live l
  where l.allowed_gender is not null and p_gender is distinct from l.allowed_gender;
$$;

/**
 * **ما يُحدثه التعديل وحده:** ما يُخرجه عنه الجديد ولم يكن يُخرجه عنه القديم. فحسابٌ خارجُ شرطٍ قبل
 * التعديل لا يُنبَّه عليه في كل حفظ — تنبيهٌ يتكرّر بلا داعٍ يعوّد الضغط على «احفظ رغم ذلك».
 */
create function public.fn_account_fit_change(
  p_user_id uuid, p_old_birth date, p_old_gender public.gender, p_new_birth date, p_new_gender public.gender
)
returns table (kind text, message text)
language sql
stable
set search_path = ''
as $$
  select n.kind, n.message
  from public.fn_account_fit_core(p_user_id, p_new_birth, p_new_gender) n
  where not exists (
    select 1 from public.fn_account_fit_core(p_user_id, p_old_birth, p_old_gender) o
    where o.kind = n.kind and o.scope = n.scope
  );
$$;

revoke all on function public.fn_account_fit_core(uuid, date, public.gender) from public, anon, authenticated;
revoke all on function public.fn_account_fit_change(uuid, date, public.gender, date, public.gender)
  from public, anon, authenticated;

/**
 * الغلاف للإدارة: ما يُحدثه ميلادٌ وجنسٌ جديدان مقابل المخزَّن. بصلاحية المالك لأن حامل `users.write` قد لا
 * يقرأ مشاركات كل البرامج (`participants_read` بنطاق) — فبلاها يمرّ التعديل بلا تنبيه ويَسِمه السجلّ.
 * ويفحص الصلاحية بلا شرطٍ على `current_user`: داخل دالة المالك هو المالك دائماً.
 */
create function public.fn_account_fit_issues(p_user_id uuid, p_birth date, p_gender public.gender)
returns table (kind text, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('users.write') then
    raise exception 'لا صلاحية لفحص أهلية الحسابات' using errcode = '42501';
  end if;
  return query
    select c.kind, c.message
    from public.profiles p
    cross join lateral public.fn_account_fit_change(p_user_id, p.birth_date, p.gender, p_birth, p_gender) c
    where p.user_id = p_user_id;
end;
$$;

revoke all on function public.fn_account_fit_issues(uuid, date, public.gender) from public, anon;
grant execute on function public.fn_account_fit_issues(uuid, date, public.gender) to authenticated;
comment on function public.fn_account_fit_issues(uuid, date, public.gender) is
  'adr/0059 | ما يُخرج الحساب عن شرط مشاركاته الحيّة لو صار ميلاده وجنسه كما يُمرَّر ولم يكن يُخرجه قبلُ — لحامل users.write.';

-- ══ ٢ · كتابة التعديل في السجلّ ══
/**
 * سطر التعديل: `before = {fields}` و`after = {fields, names, by_admin, …علامات}`. و`names` أسماء الحقول
 * بلا قيم (ومنها ما لا قيمة له أصلاً كرقم الهوية) — فالمحو يُسقط `fields` وتبقى الأسماء والعلامات.
 *
 * **الدمج ضد الإغراق:** تعديلُ الفاعل نفسه على الكيان نفسه خلال عشر دقائق يُضمّ إلى سطره الأخير —
 * القديم الأول يبقى، والجديد يتحدّث. فمن يبدّل جواله آلاف المرات بطلبٍ مباشر يملأ سطراً واحداً.
 *
 * وإن كان المعدِّل غير صاحب الحساب يُشعَر صاحبه بأسماء الحقول (`profile_corrected`). والإشعار ثانويّ:
 * خللُه يُنذَر به ولا يُفشل الحفظ (نمط `fn_notify_results_published`).
 */
create function public.fn_audit_field_change(
  p_action text, p_table text, p_entity uuid, p_owner uuid,
  p_before jsonb, p_after jsonb, p_hidden text[], p_flags jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean := v_actor is distinct from p_owner;
  v_row   public.audit_log;
  v_before jsonb;
  v_after  jsonb;
  v_names  jsonb;
  v_id     uuid;
begin
  select * into v_row
  from public.audit_log
  where entity_table = p_table and entity_id = p_entity and action = p_action and actor_id = v_actor
    and created_at > now() - interval '10 minutes'
  order by created_at desc
  limit 1
  for update;

  if found then
    -- القديم الأول يبقى (لا يُكتب فوقه)، والجديد يتحدّث.
    v_before := p_before || coalesce(v_row.before -> 'fields', '{}'::jsonb);
    v_after  := coalesce(v_row.after -> 'fields', '{}'::jsonb) || p_after;
    select coalesce(jsonb_agg(distinct n), '[]'::jsonb) into v_names
    from (
      select jsonb_array_elements_text(coalesce(v_row.after -> 'names', '[]'::jsonb)) as n
      union select jsonb_object_keys(p_after)
      union select unnest(p_hidden)
    ) s;
    update public.audit_log
    set before = jsonb_build_object('fields', v_before),
        after = jsonb_build_object('fields', v_after, 'names', v_names, 'by_admin', v_admin)
                || coalesce(v_row.after - 'fields' - 'names' - 'by_admin', '{}'::jsonb)
                || p_flags
    where id = v_row.id;
    v_id := v_row.id;
  else
    select coalesce(jsonb_agg(distinct n), '[]'::jsonb) into v_names
    from (select jsonb_object_keys(p_after) as n union select unnest(p_hidden)) s;
    insert into public.audit_log (actor_id, actor_label, action, entity_table, entity_id, before, after)
    values (
      v_actor,
      (select p.full_name from public.profiles p where p.user_id = v_actor),
      p_action, p_table, p_entity,
      jsonb_build_object('fields', p_before),
      jsonb_build_object('fields', p_after, 'names', v_names, 'by_admin', v_admin) || p_flags
    )
    returning id into v_id;
  end if;

  if v_admin then
    begin
      insert into public.notifications (recipient_id, kind, payload, status, sent_at, ref_key)
      values (p_owner, 'profile_corrected', jsonb_build_object('names', v_names), 'sent', now(),
              'profile_corrected:' || v_id)
      on conflict (recipient_id, ref_key) where deleted_at is null
      do update set payload = excluded.payload, status = 'sent', read_at = null;
    exception when others then
      raise warning 'إشعار تعديل البيانات لم يُكتب (%): %', v_id, sqlerrm;
    end;
  end if;
end;
$$;

revoke all on function public.fn_audit_field_change(text, text, uuid, uuid, jsonb, jsonb, text[], jsonb)
  from public, anon, authenticated;

-- ══ ٣ · المشغّلان ══
create function public.fn_log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_admin  boolean;
  v_old    jsonb := to_jsonb(old);
  v_new    jsonb := to_jsonb(new);
  v_before jsonb;
  v_after  jsonb;
  v_flags  jsonb := '{}'::jsonb;
  v_filling boolean;
begin
  -- بلا فاعلٍ مصادَق عليه (هجرة، خادم بمفتاح الخدمة) لا سطر — لا «المنصة عدّلت اسمه».
  if v_actor is null then
    return null;
  end if;
  v_admin := v_actor is distinct from new.user_id;

  /*
   * **الاستكمال وحده يُعفى:** صاحبه يملأ فارغاً والملف ناقص، ولم يُسجَّل له تعديلٌ قط. فبعد أول سطرٍ أو بعد
   * الاكتمال يُسجَّل ملء الفارغ أيضاً — وإلا مسح قيمةً (سطرٌ إلى «فارغ») ثم ملأها بغيرها بلا سطر.
   */
  v_filling := not v_admin
    and not public.fn_profile_is_complete(old)
    and not exists (
      select 1 from public.audit_log a
      where a.entity_table = 'profiles' and a.entity_id = new.id and a.action = 'profile_changed'
    );

  select coalesce(jsonb_object_agg(k, v_old -> k), '{}'::jsonb), coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb)
  into v_before, v_after
  from unnest(array['first_name', 'father_name', 'grandfather_name', 'family_name', 'gender',
                    'birth_date', 'nationality', 'phone', 'phone_secondary']) as k
  where (v_old -> k) is distinct from (v_new -> k)
    and not (v_filling and jsonb_typeof(v_old -> k) = 'null');

  if v_after = '{}'::jsonb then
    return null;
  end if;

  -- «صار خارج…»: ما أحدثه هذا التعديل وحده، لا ما كان قبله.
  if v_after ? 'birth_date' or v_after ? 'gender' then
    v_flags := jsonb_build_object(
      'out_of_track', exists (
        select 1 from public.fn_account_fit_change(new.user_id, old.birth_date, old.gender, new.birth_date, new.gender) i
        where i.kind = 'age'),
      'out_of_gender', exists (
        select 1 from public.fn_account_fit_change(new.user_id, old.birth_date, old.gender, new.birth_date, new.gender) i
        where i.kind = 'gender'));
  end if;

  perform public.fn_audit_field_change('profile_changed', 'profiles', new.id, new.user_id,
    v_before, v_after, '{}'::text[], v_flags);
  return null;
end;
$$;

create trigger trg_profiles_log_change
  after update of first_name, father_name, grandfather_name, family_name, gender, birth_date,
                  nationality, phone, phone_secondary
  on public.profiles
  for each row execute function public.fn_log_profile_change();

/**
 * الهوية: **رقم الوثيقة بلا قيمة** — يُذكر أنه تغيّر (`names`) ولا يُحفظ رقمٌ قديم ولا جديد، فالسجلّ
 * يقرؤه حامل `audit.read` والرقم لحامل `identities.read` وحده. وجوال وليّ الأمر قديماً وجديداً.
 * والإدراج يُرى أيضاً: الإدارة تُنشئ صفّ هويةٍ لحسابٍ لا صفّ له.
 */
create function public.fn_log_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_admin  boolean;
  v_old_id text := case when tg_op = 'UPDATE' then old.national_id end;
  v_old_ph text := case when tg_op = 'UPDATE' then old.guardian_phone end;
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_hidden text[] := '{}';
  v_filling boolean;
begin
  if v_actor is null then
    return null;
  end if;
  v_admin := v_actor is distinct from new.user_id;
  -- كالملف: صاحبه يملأ فارغاً ولم يُسجَّل لهويته تعديلٌ قط — وبعدها يُسجَّل ملء الفارغ (المسح ثم الملء).
  v_filling := not v_admin and not exists (
    select 1 from public.audit_log a
    where a.entity_table = 'profile_identities' and a.entity_id = new.user_id and a.action = 'identity_changed'
  );

  if new.national_id is distinct from v_old_id and not (v_filling and v_old_id is null) then
    v_hidden := array['national_id'];
  end if;
  if new.guardian_phone is distinct from v_old_ph and not (v_filling and v_old_ph is null) then
    v_before := jsonb_build_object('guardian_phone', v_old_ph);
    v_after := jsonb_build_object('guardian_phone', new.guardian_phone);
  end if;

  if v_after = '{}'::jsonb and cardinality(v_hidden) = 0 then
    return null;
  end if;

  perform public.fn_audit_field_change('identity_changed', 'profile_identities', new.user_id, new.user_id,
    v_before, v_after, v_hidden, '{}'::jsonb);
  return null;
end;
$$;

create trigger trg_profile_identities_log_change
  after insert or update of national_id, guardian_phone
  on public.profile_identities
  for each row execute function public.fn_log_identity_change();

revoke all on function public.fn_log_profile_change() from public, anon, authenticated;
revoke all on function public.fn_log_identity_change() from public, anon, authenticated;

-- ══ ٤ · تعديل الإدارة ══
/**
 * البيانات الستّ من الإدارة — بصلاحية من يطلب: `profiles_update` والحارس يجيزان `users.write`.
 *
 * - الحساب في السلّة لا يُعدَّل (يُستعاد أولاً).
 * - **التزامن:** يُرفض الحفظ إن تغيّر الملف منذ فُتح (`p_seen_updated_at`)، فلا يمحو حفظُ الإداري
 *   تعديلاً متزامناً من صاحبه.
 * - **الأهلية:** إن أخرجه الميلاد أو الجنس الجديدان عن شرط مشاركةٍ حيّة لم يكن خارجه، يُرفض برمز `SNFIT`
 *   ونصّ ما خرج عنه — حتى يُعاد بالنصّ نفسه الذي رآه الإداري (`p_confirmed`). فالتأكيد لما رُئي لا لكل
 *   تنبيه: تعديلٌ آخر بعده يُنبَّه عليه من جديد. ولا نقل مسارٍ تلقائي — قرارٌ منفصل.
 * - الحقول التسعة كلها مطلوبة في `p_data` — لا يُفرَّغ حقلٌ بغيابه.
 * - والتحقّق من الصيغ في الشاشة (`profileSchema`) وقيود الجدول معاً.
 */
create function public.fn_admin_update_profile(
  p_user_id uuid, p_data jsonb, p_seen_updated_at timestamptz, p_confirmed text default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_birth   date := (p_data ->> 'birth_date')::date;
  v_gender  public.gender := (p_data ->> 'gender')::public.gender;
  v_issues  text;
begin
  if not public.fn_has_permission('users.write') then
    raise exception 'لا صلاحية لتعديل بيانات الحسابات' using errcode = '42501';
  end if;
  if p_data is null or not (p_data ?& array['first_name', 'father_name', 'grandfather_name', 'family_name', 'gender',
                                           'birth_date', 'nationality', 'phone', 'phone_secondary']) then
    raise exception 'بيانات الحساب ناقصة' using errcode = '23514';
  end if;

  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception 'لا حساب بهذا المعرّف' using errcode = '23514';
  end if;
  if v_profile.purge_after is not null then
    raise exception 'الحساب في سلّة المحذوفات — استعِده أولاً ثم عدّل بياناته' using errcode = '23514';
  end if;
  if p_seen_updated_at is null or v_profile.updated_at is distinct from p_seen_updated_at then
    raise exception 'تغيّرت بيانات هذا الحساب بعد أن فتحتَ الصفحة — أعد فتحها ثم عدّل' using errcode = '23514';
  end if;

  select string_agg(i.message, '؛ ' order by i.kind, i.message) into v_issues
  from public.fn_account_fit_issues(p_user_id, v_birth, v_gender) i;
  if v_issues is not null and v_issues is distinct from p_confirmed then
    raise exception '%', v_issues using errcode = 'SNFIT';
  end if;

  update public.profiles set
    first_name       = p_data ->> 'first_name',
    father_name      = p_data ->> 'father_name',
    grandfather_name = p_data ->> 'grandfather_name',
    family_name      = p_data ->> 'family_name',
    gender           = v_gender,
    birth_date       = v_birth,
    nationality      = p_data ->> 'nationality',
    phone            = p_data ->> 'phone',
    phone_secondary  = nullif(p_data ->> 'phone_secondary', '')
  where id = v_profile.id;
end;
$$;

revoke all on function public.fn_admin_update_profile(uuid, jsonb, timestamptz, text) from public, anon;
grant execute on function public.fn_admin_update_profile(uuid, jsonb, timestamptz, text) to authenticated;
comment on function public.fn_admin_update_profile(uuid, jsonb, timestamptz, text) is
  'adr/0059 | تعديل الإدارة لبيانات الحساب: users.write، لا في السلّة، بلا تعديلٍ متزامن، وتأكيدٌ إن خرج عن شرط مشاركته. بصلاحية من يطلب، والسجلّ من المشغّل.';

/**
 * الهوية من الإدارة: الإدراج كان لصاحبها وحده، فحسابٌ بلا صفّ هوية لا يُصحَّح. والتعديل والحارس يجيزان
 * `identities.write` أصلاً (الهجرة ٠٧١) — فسياسةٌ للإدراج تكفي، والكتابة بصلاحية من يطلب.
 */
create policy profile_identities_insert_admin on public.profile_identities
  for insert to authenticated
  with check ((select public.fn_has_permission('identities.write')));

-- ══ ٥ · الإشعار ══
insert into public.notification_kinds (code, label) values
  ('profile_corrected', 'تعديل الإدارة لبياناتك')
on conflict (code) do nothing;

-- رقعةٌ على التعريف الحيّ لا إعادة كتابة — فما أضافته هجراتٌ لاحقة يبقى.
create or replace function pg_temp.patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13) || chr(10), chr(10));
begin
  if (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: موضع التبديل غير فريد أو مفقود', p_fn;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- «تنبيهاتي»: إشعار التعديل يحمل أسماء الحقول في `body` (والإعلانات في الدفعة ٢ تملؤه بنصّها).
select pg_temp.patch('public.fn_my_notifications(integer)'::regprocedure,
$o$         null::text, null::text,$o$,
$n$         null::text,
         case when n.kind = 'profile_corrected'
              then (select string_agg(f, ',') from jsonb_array_elements_text(n.payload -> 'names') f) end,$n$);

-- ══ ٦ · المحو ══ — قيم البيانات في سجلّ تعديلاتها تذهب مع صاحبها، وتبقى الأسماء والعلامات ومن عدّل ومتى.
select pg_temp.patch('public.fn_purge_account(uuid)'::regprocedure,
$o$  update public.audit_log set actor_label = v_label where actor_id = p_user_id;$o$,
$n$  update public.audit_log set actor_label = v_label where actor_id = p_user_id;

  -- وقيم بياناته في سجلّ تعديلاتها (adr/0059): الحقل يبقى اسماً، والقيمة تُمحى.
  update public.audit_log
  set before = before - 'fields', after = after - 'fields'
  where (action = 'profile_changed' and entity_id = v_profile)
     or (action = 'identity_changed' and entity_id = p_user_id);$n$);
