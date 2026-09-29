-- 050 | شاشة النشر: ترتيب المتجر، ومجموعات الأسئلة، وحالة النشر صفّاً واحداً
--
-- ثلاثة نواقص يسدّها هذا:
--   ١ · **المتجر العام يرتّب بتاريخ الإنشاء وحده** — فلا سبيل لتقديم برنامجٍ
--       على آخر مهما كان أولى بالواجهة.
--   ٢ · الأسئلة الشائعة قائمةٌ مسطّحة بلا مجموعات، وصفحة مسابقة سنن تجمعها في ستّ.
--   ٣ · حالة النشر تُسأل **مرّةً لكل برنامج** (`fn_registration_state`)، والناقص
--       للنشر يُحسب في ثلاثة مواضع: حارسُ النشر بـplpgsql، و`readiness.ts`
--       بـTypeScript، وشاشةٌ ثالثة لو كُتبت. فيُستخرج الحساب إلى دالةٍ واحدة
--       يناديها الحارس والشاشة معاً — **فلا يختلف المعروض عن المفروض**.
--
-- تراجع: نعم — العمودان يُسقطان، والحارس يعود إلى نسخة الهجرة ٠٤٣.

-- ══ ١ · ترتيب البرامج في الواجهة العامة ══
alter table public.programs add column sort_order int not null default 0;

comment on column public.programs.sort_order is
  'ترتيب البطاقة في المتجر العام — الأصغر أولاً، ثم الأحدث إنشاءً عند التساوي.';

create index idx_programs_sort on public.programs (sort_order) where deleted_at is null;

-- ══ ٢ · مجموعة السؤال الشائع ══
-- `group` كلمة محجوزة، فالاسم `category` — والتسمية في الشاشة «المجموعة».
alter table public.help_entries add column category text not null default '';

comment on column public.help_entries.category is
  'مجموعة السؤال في الصفحة المعلنة («التسجيل» · «الجوائز»…). فارغة = بلا مجموعة، تُعرض أولاً.';

alter table public.help_entries
  add constraint chk_help_entries_category check (char_length(category) <= 60);

drop index if exists public.idx_help_entries_program;
create index idx_help_entries_program
  on public.help_entries (program_id, category, sort_order) where deleted_at is null;

-- ══ ٣ · ما ينقص البرنامج قبل نشره — تعريفٌ واحد ══
/**
 * منسوخةٌ حرفاً عن حارس النشر (الهجرة ٠٤٣)، ويناديها الحارس نفسه بعدها.
 *
 * **بلا بوابة صلاحية بقصد:** يناديها المشغّل الداخلي والبذرة كما كان يفعل
 * الحارس. والبوابة موضعها الدالة التي تعرضها على الشاشة.
 */
create or replace function public.fn_program_missing(p_program_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tracks     int;
  v_with_parts int;
  v_with_plan  int;
  v_units      int;
  v_fields     int;
  v_templates  int;
  v_blocks     int;
  v_missing    text[] := array[]::text[];
begin
  select count(*) into v_tracks
  from public.tracks t where t.program_id = p_program_id and t.deleted_at is null;

  select count(distinct r.track_id) into v_with_parts
  from public.track_content_ranges r
  join public.tracks t on t.id = r.track_id and t.deleted_at is null
  where t.program_id = p_program_id and r.deleted_at is null;

  select count(distinct pl.track_id) into v_with_plan
  from public.plans pl
  join public.tracks t on t.id = pl.track_id and t.deleted_at is null
  where t.program_id = p_program_id
    and pl.deleted_at is null
    and exists (select 1 from public.plan_days d where d.plan_id = pl.id and d.deleted_at is null);

  select count(*) into v_units
  from public.content_units u where u.program_id = p_program_id and u.deleted_at is null;

  select count(*) into v_fields
  from public.task_fields f where f.program_id = p_program_id and f.deleted_at is null;

  select count(distinct f.day_template_id) into v_templates
  from public.day_template_fields f
  join public.day_templates t on t.id = f.day_template_id and t.deleted_at is null
  where t.program_id = p_program_id and f.deleted_at is null;

  select count(*) into v_blocks
  from public.page_blocks b where b.program_id = p_program_id and b.deleted_at is null;

  if v_tracks = 0 then v_missing := array_append(v_missing, 'المسارات'); end if;
  if v_units = 0 then v_missing := array_append(v_missing, 'المادة'); end if;
  if v_tracks > 0 and v_with_parts < v_tracks then
    v_missing := array_append(v_missing, 'نصيب كل مسار من المادة');
  end if;
  if v_fields = 0 then v_missing := array_append(v_missing, 'واجبات اليوم'); end if;
  if v_templates = 0 then v_missing := array_append(v_missing, 'شكل يوم بواجباته'); end if;
  if v_tracks > 0 and v_with_plan < v_tracks then
    v_missing := array_append(v_missing, 'خطة لكل مسار');
  end if;
  if v_blocks = 0 then v_missing := array_append(v_missing, 'الصفحة المعلنة'); end if;

  return v_missing;
end;
$$;

revoke all on function public.fn_program_missing(uuid) from public;

-- والحارس يصير مناديّاً لا حاسباً: تعريفٌ واحدٌ لا يختلف عن نفسه.
create or replace function public.fn_guard_program_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[];
begin
  if new.status is not distinct from old.status or new.status <> 'published' then
    return new;
  end if;

  v_missing := public.fn_program_missing(new.id);

  if cardinality(v_missing) > 0 then
    raise exception 'لا يُنشر البرنامج قبل: %', array_to_string(v_missing, ' · ')
      using errcode = '23514',
            hint = 'شاشة النشر تقول أين يُصلَح كلٌّ منها.';
  end if;

  return new;
end;
$$;

-- ══ ٤ · حالة كل برنامج في نداءٍ واحد ══
/**
 * صفٌّ لكل برنامجٍ يملك العارض قراءته: حالته، وحالة تسجيله، **وما ينقصه**.
 *
 * وكانت الشاشة تنادي `fn_registration_state` مرّةً لكل برنامج، ولا تعرف الناقص
 * أصلاً — فزرّ النشر يُعرَض ثم يفشل. وهذا يجعل الزرّ يعرف قبل أن يُضغط (`ق-٢٠`).
 */
create or replace function public.fn_programs_publish_state()
returns table (
  id                 uuid,
  name               text,
  slug               text,
  kind               public.program_kind,
  status             public.program_status,
  sort_order         int,
  registration_state text,
  missing            text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.slug,
    p.kind,
    p.status,
    p.sort_order,
    public.fn_registration_state(p.id),
    public.fn_program_missing(p.id)
  from public.programs p
  where p.deleted_at is null
    and public.fn_has_permission('programs.read', p.id)
  order by p.sort_order, p.created_at desc;
$$;

revoke all on function public.fn_programs_publish_state() from public;
grant execute on function public.fn_programs_publish_state() to authenticated;
