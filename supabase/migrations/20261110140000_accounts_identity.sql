-- البحث برقم الوثيقة في «المشاركون في المنصة» (الدفعة ٤ · قرار الراعي ١٠ نوفمبر).
--
-- رقم الهوية في `profile_identities` لا يقرؤه إلا صاحبه (adr/0047)، والإدارة تراه مقنّعاً لحامل
-- `users.read` وكاملاً لحامل `identities.read`. فالبحث به لكل من يرى القائمة يكشف ما يُخفيه القناع:
-- من يجرّب الأرقام يعرف صاحب أيّها. فـ`fn_account_by_identity`:
-- - **لحامل `identities.read` و`users.read` معاً وحده** — ومن سواه يُرفض.
-- - **تطابقٌ تامّ** بعد التطبيع (بلا مسافات ولا شَرطات، أحرفٌ كبيرة) — لا جزءٌ من رقم.
-- - **تُرجع الحساب لا الرقم**، و**كل بحثٍ يُسجَّل** (وُجد أم لا) بلا الرقم — فلا يصير التجريب خفيّاً.
--
-- و`fn_accounts_list` و`fn_export_accounts` يُضاف لهما `p_user_id` ليُعرض الحساب الموجود ويُصدَّر كما
-- يُعرض. وتغيّر التوقيع يوجب الحذف ثم الإنشاء، والمنح والتعليقات تُعاد.
--
-- تراجع: نعم — حذف fn_account_by_identity، وإعادة الدالتين بنصّهما في 20261110130000.

drop function public.fn_export_accounts(text[], text, text, text, text, boolean, text);
drop function public.fn_accounts_list(text[], text, text, text, text, boolean, int, int, text);

create function public.fn_accounts_list(
  p_name_words text[] default '{}',
  p_phone      text default null,
  p_program    text default null,
  p_status     text default null,
  p_sort       text default 'created_at',
  p_desc       boolean default true,
  p_limit      int default 25,
  p_offset     int default 0,
  p_duplicate  text default null,
  p_user_id    uuid default null
)
returns table (
  id          uuid,
  user_id     uuid,
  full_name   text,
  phone       text,
  created_at  timestamptz,
  deleted_at  timestamptz,
  purge_after timestamptz,
  programs    text[],
  has_program boolean,
  same_identity text[],
  same_phone  text[],
  total       bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with norm as materialized (
    -- الاسم مطبَّعاً مرةً لكل حساب: بلا مسافاتٍ ولا تشكيلٍ ولا تطويل، والهمزات ألفاً والتاء هاءً
    -- والألف المقصورة ياءً — فـ«عبد الله» تطابق «عبدالله»، و«أحمد» «احمد».
    select pr.id, pr.full_name, pr.phone, pr.birth_date, pr.created_at, pr.deleted_at, pr.purge_after,
           translate(regexp_replace(lower(pr.full_name), '[[:space:]ً-ْـ]', '', 'g'),
                     'أإآىة', 'اااية') as nn
    from public.profiles pr
  ),
  peers as (
    -- النظير يُوصف بما يميّزه عن صاحبه: آخر جواله، ويوم إنشائه، وحاله. ومن في سلّة المحذوفات
    -- ليس نظيراً ولا موسوماً — فإذا حُسم التكرار بالحذف زالت العلامة من الطرفين.
    select o.*,
           o.full_name
             || coalesce(' · …' || right(o.phone, 4), '')
             || ' · ' || to_char(o.created_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD')
             || case when o.deleted_at is not null then ' · موقوف' else '' end as label
    from norm o
    where o.purge_after is null
  ),
  same_id as (
    -- مكرّرٌ محتمل: الميلاد نفسه مع الاسم نفسه أو الجوال نفسه (الإخوة نادراً ما يشتركون في الميلاد).
    select n.id, array_agg(o.label order by o.created_at) as labels
    from norm n
    join peers o on o.birth_date = n.birth_date and o.id <> n.id and (o.nn = n.nn or o.phone = n.phone)
    where n.purge_after is null
    group by n.id
  ),
  same_ph as (
    -- جوالٌ مشترك بميلادٍ آخر — أغلبه إخوةٌ سجّلهم وليّهم: معلومةٌ لا تهمة.
    select n.id, array_agg(o.label order by o.created_at) as labels
    from norm n
    join peers o on o.phone = n.phone and o.id <> n.id and o.birth_date is distinct from n.birth_date
    where n.purge_after is null
    group by n.id
  ),
  twins as (
    select n.id, coalesce(i.labels, '{}') as same_identity, coalesce(p.labels, '{}') as same_phone
    from norm n
    left join same_id i on i.id = n.id
    left join same_ph p on p.id = n.id
  ),
  enrolled as (
    select p.user_id,
           coalesce(array_agg(g.name order by g.name) filter (where g.name is not null), '{}') as names,
           array_agg(p.program_id) as program_ids
    from public.participants p
    left join public.programs g on g.id = p.program_id
    where p.deleted_at is null and p.user_id is not null
    group by p.user_id
  ),
  matched as (
    select pr.id, pr.user_id, pr.full_name, pr.phone, pr.created_at, pr.deleted_at, pr.purge_after,
           coalesce(e.names, '{}') as programs, e.user_id is not null as has_program, e.program_ids,
           coalesce(t.same_identity, '{}') as same_identity, coalesce(t.same_phone, '{}') as same_phone
    from public.profiles pr
    left join enrolled e on e.user_id = pr.user_id
    left join twins t on t.id = pr.id
    where (p_user_id is null or pr.user_id = p_user_id)
      and not exists (
            select 1 from unnest(coalesce(p_name_words, '{}')) w
            where strpos(lower(pr.full_name), lower(w)) = 0
          )
      and (coalesce(p_phone, '') = '' or strpos(coalesce(pr.phone, ''), p_phone) > 0)
      and case
            when p_program is null then true
            when p_program = 'none' then e.user_id is null
            when p_program = 'any' then e.user_id is not null
            when p_program ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then p_program::uuid = any (coalesce(e.program_ids, '{}'))
            else false
          end
      and case p_status
            when 'active' then pr.deleted_at is null
            when 'suspended' then pr.deleted_at is not null and pr.purge_after is null
            when 'bin' then pr.purge_after is not null
            else p_status is null
          end
      and case p_duplicate
            when 'identity' then cardinality(coalesce(t.same_identity, '{}')) > 0
            when 'phone' then cardinality(coalesce(t.same_phone, '{}')) > 0
            else p_duplicate is null
          end
  )
  select m.id, m.user_id, m.full_name, m.phone, m.created_at, m.deleted_at, m.purge_after, m.programs,
         m.has_program, m.same_identity, m.same_phone, count(*) over ()
  from matched m
  order by
    case when p_sort = 'full_name' and not p_desc then m.full_name end asc,
    case when p_sort = 'full_name' and p_desc then m.full_name end desc,
    case when p_sort is distinct from 'full_name' and not p_desc then m.created_at end asc,
    case when p_sort is distinct from 'full_name' and p_desc then m.created_at end desc,
    m.id
  limit least(greatest(coalesce(p_limit, 25), 0), 100000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.fn_accounts_list(text[], text, text, text, text, boolean, int, int, text, uuid) from public, anon;
grant execute on function public.fn_accounts_list(text[], text, text, text, text, boolean, int, int, text, uuid) to authenticated;
comment on function public.fn_accounts_list(text[], text, text, text, text, boolean, int, int, text, uuid) is
  '«المشاركون في المنصة»: صفحة الحسابات بالبحث (كلمات الاسم، الجوال، أو حسابٍ بعينه من رقم الوثيقة) والتصفية (البرنامج، الحالة، التكرار المحتمل) والفرز، بعددها الكلّي وبرامج كل حساب ونظرائه. بصلاحية من يطلب.';

create function public.fn_export_accounts(
  p_name_words text[] default '{}',
  p_phone      text default null,
  p_program    text default null,
  p_status     text default null,
  p_sort       text default 'created_at',
  p_desc       boolean default true,
  p_duplicate  text default null,
  p_user_id    uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_rows    jsonb;
  v_count   int;
  v_total   bigint;
  v_program text;
begin
  if not (public.fn_has_permission('users.read') and public.fn_has_permission('users.write')) then
    raise exception 'لا صلاحية لتصدير الحسابات' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'full_name', l.full_name,
           'phone', l.phone,
           'programs', l.programs,
           'has_program', l.has_program,
           'created_at', l.created_at,
           'deleted_at', l.deleted_at,
           'purge_after', l.purge_after,
           'same_identity', cardinality(l.same_identity) > 0,
           'same_phone', cardinality(l.same_phone) > 0
         ) order by l.ordinality), '[]'::jsonb),
         count(*)::int,
         max(l.total)
  into v_rows, v_count, v_total
  from public.fn_accounts_list(p_name_words, p_phone, p_program, p_status, p_sort, p_desc, 100000, 0, p_duplicate, p_user_id)
       with ordinality as l;

  -- ما جاوز سقف القراءة لا يُصدَّر ناقصاً بصمت.
  if v_total > v_count then
    raise exception 'المطابق (%) أكثر مما يُصدَّر دفعةً واحدة — ضيّق بالتصفية', v_total using errcode = '54000';
  end if;

  -- البرنامج باسمه في السجلّ لا بمعرّفه — يقرؤه المدير.
  v_program := case
    when p_program is null then null
    when p_program = 'none' then 'بلا برنامج'
    when p_program ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then coalesce((select g.name from public.programs g where g.id = p_program::uuid), 'برنامجٌ واحد')
    else null
  end;

  perform public.fn_write_audit('accounts_exported', 'profiles', null, null, jsonb_build_object(
    'count', v_count,
    'name_words', nullif(cardinality(coalesce(p_name_words, '{}')), 0),
    'phone_tail', nullif(right(coalesce(p_phone, ''), 4), ''),
    'program', v_program,
    'status', case when p_status in ('active', 'suspended', 'bin') then p_status end,
    'duplicate', case when p_duplicate in ('identity', 'phone') then p_duplicate end,
    -- البحث برقم الوثيقة يُذكر أنه وقع — لا الرقم ولا صاحبه.
    'by_document', p_user_id is not null
  ));

  return v_rows;
end;
$$;

revoke all on function public.fn_export_accounts(text[], text, text, text, text, boolean, text, uuid) from public, anon;
grant execute on function public.fn_export_accounts(text[], text, text, text, text, boolean, text, uuid) to authenticated;
comment on function public.fn_export_accounts(text[], text, text, text, text, boolean, text, uuid) is
  'تصدير «المشاركون في المنصة» بما تعرضه القائمة بعد البحث والتصفية: لحامل users.read وusers.write، في استعلامٍ واحد، والتدقيق في المعاملة نفسها بلا بيانات أشخاص. بصلاحية من يطلب.';


create function public.fn_account_by_identity(p_national_id text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   text := upper(regexp_replace(coalesce(p_national_id, ''), '[[:space:]-]', '', 'g'));
  v_user uuid;
begin
  if not (public.fn_has_permission('identities.read') and public.fn_has_permission('users.read')) then
    raise exception 'لا صلاحية للبحث برقم الوثيقة' using errcode = '42501';
  end if;
  -- ما لا يصلح رقمَ وثيقة لا يُبحث به ولا يُسجَّل — توأم chk_profile_identities_national_id.
  if v_id !~ '^[A-Z0-9]{5,20}$' then
    return null;
  end if;

  select i.user_id into v_user
  from public.profile_identities i
  where i.national_id = v_id and i.deleted_at is null;

  perform public.fn_write_audit('identity_searched', 'profile_identities', null, null,
    jsonb_build_object('found', v_user is not null));

  return v_user;
end;
$$;

revoke all on function public.fn_account_by_identity(text) from public, anon;
grant execute on function public.fn_account_by_identity(text) to authenticated;
comment on function public.fn_account_by_identity(text) is
  'البحث برقم الوثيقة: تطابقٌ تامّ لحامل identities.read وusers.read، يُرجع الحساب لا الرقم، وكل بحثٍ يُسجَّل بلا الرقم.';
