-- تصدير «المشاركون في المنصة» في القاعدة (الدفعة ٢ · مراجعتها المستقلة).
--
-- كان التصدير يجمع صفحات `fn_accounts_list` بحلقةٍ من الخادم ثم يكتب التدقيق بطلبٍ آخر: كل دفعةٍ
-- لقطةٌ مستقلة (حسابٌ يُسجَّل أثناء الجمع يكرّر صفّاً أو يُسقطه)، والتدقيق ليس في معاملة القراءة،
-- وقصر التصدير على `users.write` مفروضٌ في التطبيق وحده. فصار في دالةٍ واحدة على نمط
-- `fn_export_results`: **تفحص الصلاحية بنفسها، وتقرأ في استعلامٍ واحد، وتكتب التدقيق في المعاملة
-- نفسها** — فلا ملف بلا سطرٍ في السجلّ، ولا سطرَ لملفٍ لم يُبنَ. وتُرجع `jsonb` واحداً لا صفوفاً، فلا
-- يقصّها سقف `max_rows`.
--
-- **بصلاحية من يطلب** كالقائمة: لا يكشف الملف إلا ما تعرضه له الشاشة. والقصر على `users.write` قصرٌ
-- للتصدير المسجَّل لا للبيانات: حامل `users.read` يقرأ الحسابات أصلاً بسياسة `profiles_read`.
--
-- و`fn_accounts_list` يُرفع سقفها من ١٠٠٠ إلى ١٠٠٠٠٠ لتُقرأ القائمة كلها هنا في استعلامٍ واحد —
-- والصفحة تطلب ٢٥، وما تُرجعه PostgREST صفوفاً يبقى محكوماً بـ`max_rows`.
--
-- تراجع: نعم — حذف fn_export_accounts، وإعادة fn_accounts_list بنصّها في 20261110100000.

create or replace function public.fn_accounts_list(
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
  limit least(greatest(coalesce(p_limit, 25), 0), 100000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create function public.fn_export_accounts(
  p_name_words text[] default '{}',
  p_phone      text default null,
  p_program    text default null,
  p_status     text default null,
  p_sort       text default 'created_at',
  p_desc       boolean default true
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
           'purge_after', l.purge_after
         ) order by l.ordinality), '[]'::jsonb),
         count(*)::int
  into v_rows, v_count
  from public.fn_accounts_list(p_name_words, p_phone, p_program, p_status, p_sort, p_desc, 100000, 0)
       with ordinality as l;

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
    'search', nullif(array_to_string(coalesce(p_name_words, '{}'), ' '), ''),
    'phone', nullif(p_phone, ''),
    'program', v_program,
    'status', p_status
  ));

  return v_rows;
end;
$$;

revoke all on function public.fn_export_accounts(text[], text, text, text, text, boolean) from public, anon;
grant execute on function public.fn_export_accounts(text[], text, text, text, text, boolean) to authenticated;
comment on function public.fn_export_accounts(text[], text, text, text, text, boolean) is
  'تصدير «المشاركون في المنصة» بما تعرضه القائمة بعد البحث والتصفية: لحامل users.read وusers.write، في استعلامٍ واحد، والتدقيق في المعاملة نفسها. بصلاحية من يطلب.';
