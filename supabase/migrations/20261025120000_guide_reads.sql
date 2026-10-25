-- 100 | دليل المشارك — قاعدته (خطة دليل المشارك · الدفعة ج)
--
-- ١. guide_updates: سجل تحديثات الدليل — سطرٌ مختصر بتاريخه لكل تحديثٍ مهم. على نمط program_schedule
--    مع فرقين: القراءة العامة **تستبعد المحذوف ليّناً** (سطرٌ حُذف لأنه خطأ لا يبقى مقروءاً)، و**بلا
--    عمود كاتب** (الفاعل في سجل التدقيق، فلا يُكشف معرّف مستخدم للزائر). وجدولٌ دائمٌ لكل برنامج، لا مؤقت.
-- ٢. fn_public_exams: إعدادات الاختبارات **للعموم** — مختارةً، ولا تظهر قبل ضبط موعدها (عن بعد:
--    opens_at · شفهي: eligibility_at) فلا تُنشر إعداداتٌ مؤقتة. **ومواعيد الاختبارات من «مواعيد البرنامج»
--    وحدها** — فلا تُرجع الدالة تاريخاً، ولا شيئاً من الجلسات والمحكّمين والنطاق والفرز.
-- ٣. fn_public_track_sections: أبواب كل مسار وعدد أحاديثه منها — material_sections مغلقٌ عن الزائر.
-- وكلتا الدالتين لبرنامجٍ منشور أو لحامل programs.read (المعاينة) — كـ fn_public_tracks.
--
-- تراجع: نعم — drop table/functions.

-- ══ ١ · سجل التحديثات ══
create table public.guide_updates (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  entry_date date not null,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_guide_updates_body check (char_length(btrim(body)) between 5 and 160)
);

comment on table public.guide_updates is
  'سجل تحديثات دليل المشارك (الهجرة ١٠٠) — سطرٌ بتاريخه لكل تحديثٍ مهم، الأحدث أولاً.';

create index idx_guide_updates_program
  on public.guide_updates (program_id, entry_date desc) where deleted_at is null;

create trigger trg_guide_updates_updated_at before update on public.guide_updates
  for each row execute function public.fn_set_updated_at();
alter table public.guide_updates enable row level security;

create policy guide_updates_read on public.guide_updates
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = guide_updates.program_id
        and p.deleted_at is null
        and ((p.status = 'published' and guide_updates.deleted_at is null)
             or public.fn_has_permission('programs.read', p.id))
    )
  );

create policy guide_updates_insert on public.guide_updates
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));

create policy guide_updates_update on public.guide_updates
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

revoke all on public.guide_updates from anon, authenticated, service_role;
grant select on public.guide_updates to anon;
grant select, insert, update on public.guide_updates to authenticated;

-- ══ ٢ · إعدادات الاختبارات للعموم ══
create function public.fn_public_exams(p_program_id uuid)
returns table (
  id                 uuid,
  name               text,
  exam_type          text,
  stage              text,
  track_id           uuid,
  entry_percentage   numeric,
  pass_percentage    numeric,
  max_attempts       int,
  question_count     int,
  seconds_per_question int,
  prerequisite_name  text,
  award_percentage   numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.exam_type::text, e.stage::text, e.track_id,
         e.entry_percentage, e.pass_percentage,
         case when e.exam_type = 'remote' then e.max_attempts end,
         e.question_count,
         case when e.exam_type = 'remote' then e.seconds_per_question end,
         pre.name,
         case when e.exam_type = 'oral' then e.award_percentage end
  from public.exams e
  join public.programs p on p.id = e.program_id
  -- اسم الشرط من اختبارٍ ظاهرٍ وحده — فلا يُكشف اسم اختبارٍ لم يُضبط موعده.
  left join public.exams pre on pre.id = e.prerequisite_exam_id and pre.deleted_at is null
   and case pre.exam_type when 'remote' then pre.opens_at is not null else pre.eligibility_at is not null end
  where e.program_id = p_program_id
    and e.deleted_at is null
    and p.deleted_at is null
    and (p.status = 'published' or public.fn_has_permission('programs.read', p.id))
    -- لا تُنشر إعداداتٌ مؤقتة: الاختبار يظهر بعد ضبط موعده.
    and case e.exam_type when 'remote' then e.opens_at is not null else e.eligibility_at is not null end
  order by e.stage, e.created_at;
$$;
revoke all on function public.fn_public_exams(uuid) from public;
grant execute on function public.fn_public_exams(uuid) to anon, authenticated;
comment on function public.fn_public_exams(uuid) is
  'الهجرة ١٠٠ | إعدادات الاختبارات لدليل المشارك — مختارةً، بعد ضبط الموعد، وبلا تواريخ (المواعيد من مواعيد البرنامج).';

-- ══ ٣ · أبواب المسارات للعموم ══
create function public.fn_public_track_sections(p_program_id uuid)
returns table (track_id uuid, section_name text, sort_order int, units int)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, s.name, s.sort_order, count(u.id)::int
  from public.tracks t
  join public.programs p on p.id = t.program_id
  join public.track_content_ranges r on r.track_id = t.id and r.deleted_at is null
  join public.content_units u
    on u.program_id = t.program_id and u.deleted_at is null
   and u.sequence between r.from_sequence and r.to_sequence
  join public.material_sections s on s.id = u.section_id and s.deleted_at is null
  where t.program_id = p_program_id
    and t.deleted_at is null
    and p.deleted_at is null
    and (p.status = 'published' or public.fn_has_permission('programs.read', p.id))
  group by t.id, t.sort_order, t.created_at, s.id, s.name, s.sort_order
  -- المسارات بترتيبها، وأبواب كلٍّ بترتيب نطاقاته فيه (قد يقدّم مسارٌ باباً متأخراً في الترقيم).
  order by t.sort_order, t.created_at, min(r.sort_order), min(u.sequence);
$$;
revoke all on function public.fn_public_track_sections(uuid) from public;
grant execute on function public.fn_public_track_sections(uuid) to anon, authenticated;
comment on function public.fn_public_track_sections(uuid) is
  'الهجرة ١٠٠ | أبواب كل مسار وعدد وحداته منها — لدليل المشارك. والوحدات بلا باب لا تُعدّ (مادةٌ غير مقسّمة لا أبواب لها).';
