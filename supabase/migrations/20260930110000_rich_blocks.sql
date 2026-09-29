-- 053 | قيد محتوى العناصر الغنية، ومسارات الصفحة بمقاعدها (adr/0035)
--
-- ١ · **القيد يحرس المفاتيح الإلزامية** لكل نوع جديد، كما يحرسها للقديم. وهو
--     الطبقة الثانية تحت مخطّط Zod: «حارسٌ في الطبقتين» (`adr/0012`).
--
-- ٢ · **بطاقات المسارات في الصفحة المعلنة** كانت اسماً ووصفاً وسعةً مكتوبة.
--     وصفحة مسابقة سنن تعرض لكل مسار عدد وحداته و**المقاعد المتبقية** — وكلاهما
--     محسوبٌ حيّ. وكانا يحتاجان نداءً لكل مسار، فصارا صفّاً لكل مسار في نداء.
--
-- تراجع: نعم — يعود القيد إلى صيغة الهجرة ٠١١، وتُحذف الدالة.

-- ══ ١ · المفاتيح الإلزامية لكل نوع ══
alter table public.page_blocks drop constraint chk_page_blocks_content;

alter table public.page_blocks add constraint chk_page_blocks_content check (
  case block_type
    when 'header'      then content ? 'title'
    when 'free_text'   then content ? 'text'
    when 'image'       then content ? 'attachmentId'
    -- الغلاف بلا عنوان لا غلاف.
    when 'hero'        then content ? 'title'
    -- والأرقام والمراحل والجوائز والشروط: قوائمها هي مضمونها.
    when 'stats'       then jsonb_typeof(content -> 'items') = 'array'
    when 'timeline'    then jsonb_typeof(content -> 'stages') = 'array'
    when 'prizes'      then jsonb_typeof(content -> 'places') = 'array'
    when 'terms'       then jsonb_typeof(content -> 'items') = 'array'
    when 'cta'         then content ? 'text'
    else true
  end
);

-- ══ ٢ · مسارات الصفحة المعلنة: الوحدات والمقاعد في نداء واحد ══
/**
 * صفٌّ لكل مسارٍ حيّ في برنامجٍ **منشور**، بما يعرضه الزائر:
 * عدد وحدات المادة في نصيبه، وسعته، والمأخوذ منها.
 *
 * `security definer` لأن عدّ المشاركين محجوبٌ عن الزائر بسياسته — ولا يُعرَض
 * له عددهم بل **المتبقي** وحده. والبرنامج غير المنشور لا يُرجَع له شيء، فلا
 * تُسرَّب مسارات مسوّدةٍ إلى من يعرف معرّفها.
 */
create or replace function public.fn_public_tracks(p_program_id uuid)
returns table (
  id          uuid,
  name        text,
  description text,
  capacity    int,
  taken       int,
  units       int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.name,
    t.description,
    t.capacity,
    (select count(*)::int from public.participants pa
      where pa.track_id = t.id and pa.deleted_at is null),
    coalesce((
      select sum(r.to_sequence - r.from_sequence + 1)::int
      from public.track_content_ranges r
      where r.track_id = t.id and r.deleted_at is null
    ), 0)
  from public.tracks t
  join public.programs p on p.id = t.program_id
  where t.program_id = p_program_id
    and t.deleted_at is null
    and p.deleted_at is null
    and (p.status = 'published' or public.fn_has_permission('programs.read', p.id))
  order by t.sort_order, t.created_at;
$$;

revoke all on function public.fn_public_tracks(uuid) from public;
grant execute on function public.fn_public_tracks(uuid) to anon, authenticated;
