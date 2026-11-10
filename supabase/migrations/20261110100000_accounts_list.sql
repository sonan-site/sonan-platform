-- «المشاركون في المنصة»: صفحة الحسابات بالبحث والتصفية والفرز (الدفعة ١ · قرار الراعي ١٠ نوفمبر).
--
-- لا رابط بين `profiles` و`participants` في القاعدة (كلاهما إلى `auth.users`)، فلا تُصفّى الحسابات
-- ببرامجها من PostgREST. فدالةٌ واحدة تُرجع الصفحة المطلوبة بعددها الكلّي وبرامج كل حساب.
--
-- **بصلاحية من يطلب (security invoker):** سياسات `profiles` و`participants` و`programs` تحكم كما تحكم
-- الشاشة اليوم — فلا يرى أحدٌ بها أكثر مما يرى بدونها. ومن لا يقرأ الحسابات لا يرى إلا صفّه.
--
-- **«له برنامج» من `participants` وحدها، واسم البرنامج إضافةٌ إن ظهر:** برنامجٌ مسودّة أو مغلق لا يظهر
-- اسمه لمن لا يقرأ البرامج — فلو بُني الحكم على الاسم لصار مشاركه «بلا برنامج». فـ`has_program` حكمٌ
-- بالمشاركة، و`programs` ما ظهر من أسمائها. وأما من يقرأ مشاركي بعض البرامج دون غيرها فلا يرى غير
-- مشاركاتها أصلاً — والصفحة تُخفي عنه «بلا برنامج» لذلك.
--
-- البرنامج: `null` الكل · `none` بلا برنامج · `any` في برنامجٍ على الأقل (لعدّ رأس الشاشة) · أو معرّف
-- برنامج. والحالة: `null` الكل · `active` نشط · `suspended` موقوف · `bin` في سلّة المحذوفات.
-- والبحث بـ`strpos` لا `ilike` — فلا معنى لـ`%` و`_` فيما يكتبه الباحث.
--
-- تراجع: نعم — drop function.

create function public.fn_accounts_list(
  p_name_words text[] default '{}',
  p_phone      text default null,
  p_program    text default null,
  p_status     text default null,
  p_sort       text default 'created_at',
  p_desc       boolean default true,
  p_limit      int default 25,
  p_offset     int default 0
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
  total       bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with enrolled as (
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
           coalesce(e.names, '{}') as programs, e.user_id is not null as has_program, e.program_ids
    from public.profiles pr
    left join enrolled e on e.user_id = pr.user_id
    where not exists (
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
  )
  select m.id, m.user_id, m.full_name, m.phone, m.created_at, m.deleted_at, m.purge_after, m.programs,
         m.has_program, count(*) over ()
  from matched m
  order by
    case when p_sort = 'full_name' and not p_desc then m.full_name end asc,
    case when p_sort = 'full_name' and p_desc then m.full_name end desc,
    case when p_sort is distinct from 'full_name' and not p_desc then m.created_at end asc,
    case when p_sort is distinct from 'full_name' and p_desc then m.created_at end desc,
    m.id
  limit least(greatest(coalesce(p_limit, 25), 0), 1000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.fn_accounts_list(text[], text, text, text, text, boolean, int, int) from public, anon;
grant execute on function public.fn_accounts_list(text[], text, text, text, text, boolean, int, int) to authenticated;
comment on function public.fn_accounts_list(text[], text, text, text, text, boolean, int, int) is
  '«المشاركون في المنصة»: صفحة الحسابات بالبحث (كلمات الاسم، الجوال) والتصفية (البرنامج، الحالة) والفرز، بعددها الكلّي وبرامج كل حساب. بصلاحية من يطلب.';
