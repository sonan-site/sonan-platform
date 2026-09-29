-- 051 | تصحيحان كشفتهما مراجعة الهجرة ٠٥٠
--
-- ١ · **الفهرس وُسّع بعمودٍ لا يستعمله استعلام.** صار `(program_id, category,
--     sort_order)`، و`category` بينهما يُبطل قدرته على خدمة `order by sort_order`
--     — وهو ما تفعله **كل** قراءات الأسئلة الأربع. والتجميع بالمجموعة يقع في
--     TypeScript (`lib/programs/faq.ts`) لا في SQL. فيعود كما كان.
--
-- ٢ · **«ما ينقص للنشر» عاد تعريفين.** الهجرة ٠٥٠ استخرجت `fn_program_missing`
--     لتوحيده، لكن `readiness.ts` بقيت تحسب نسختها للوحة الجاهزية وزرّ النشر في
--     شاشة البرنامج — فيقول زرٌّ «ينقص سبعة» ويقول الآخر «ينقص خمسة» **للبرنامج
--     نفسه في اللحظة نفسها**. فتُرجع `fn_program_readiness` القائمة نفسها، وتبقى
--     لوحة الجاهزية دليلَ بناءٍ لا مصدرَ منعٍ ثانياً.
--
-- تراجع: نعم — الفهرس يُعاد إلى صيغة الهجرة ٠٥٠، والدالة إلى نسخة الهجرة ٠٤١.

-- ══ ١ · الفهرس يعود لما تستعمله الاستعلامات ══
drop index if exists public.idx_help_entries_program;
create index idx_help_entries_program
  on public.help_entries (program_id, sort_order) where deleted_at is null;

-- ══ ٢ · الجاهزية تحمل الناقص نفسه الذي يحرسه الحارس ══
/**
 * منسوخة من الهجرة ٠٤١ بعمودٍ واحد جديد: `missing`.
 *
 * والعدادات تبقى كما هي — لوحة الجاهزية تشرح **أين** يُصلَح كلٌّ منها، وهذا
 * لا تعطيه قائمةُ النواقص. المضاف أن **ما يمنع النشر** مصدره واحد.
 */
-- `create or replace` لا يغيّر نوع الإرجاع، فتُحذف أولاً — كما فُعل بـ
-- `fn_program_participants` في الهجرة ٠٣٩ حين زيد عمودان.
drop function public.fn_program_readiness(uuid);

create function public.fn_program_readiness(p_program_id uuid)
returns table (
  tracks                int,
  tracks_with_parts     int,
  content_units         int,
  task_fields           int,
  templates_with_fields int,
  tracks_with_plan_days int,
  public_blocks         int,
  participants          int,
  published             boolean,
  missing               text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select p.id, p.status
    from public.programs p
    where p.id = p_program_id
      and p.deleted_at is null
      and public.fn_has_permission('programs.read', p.id)
  ),
  live_tracks as (
    select t.id from public.tracks t
    join scope on scope.id = t.program_id
    where t.deleted_at is null
  )
  select
    (select count(*) from live_tracks)::int,
    (select count(distinct r.track_id)
       from public.track_content_ranges r
       join live_tracks lt on lt.id = r.track_id
      where r.deleted_at is null)::int,
    (select count(*) from public.content_units u
       join scope on scope.id = u.program_id
      where u.deleted_at is null)::int,
    (select count(*) from public.task_fields f
       join scope on scope.id = f.program_id
      where f.deleted_at is null)::int,
    (select count(distinct f.day_template_id)
       from public.day_template_fields f
       join public.day_templates t on t.id = f.day_template_id and t.deleted_at is null
       join scope on scope.id = t.program_id
      where f.deleted_at is null)::int,
    -- الخطة بلا يومٍ حيّ لا تُعَدّ: المشارك لا يبدأ بها.
    (select count(distinct pl.track_id)
       from public.plans pl
       join live_tracks lt on lt.id = pl.track_id
      where pl.deleted_at is null
        and exists (
          select 1 from public.plan_days d
          where d.plan_id = pl.id and d.deleted_at is null
        ))::int,
    (select count(*) from public.page_blocks b
       join scope on scope.id = b.program_id
      where b.deleted_at is null)::int,
    (select count(*) from public.participants pa
       join scope on scope.id = pa.program_id
      where pa.deleted_at is null)::int,
    (select scope.status = 'published' from scope),
    public.fn_program_missing(scope.id)
  from scope;
$$;

revoke all on function public.fn_program_readiness(uuid) from public;
grant execute on function public.fn_program_readiness(uuid) to authenticated;

-- ══ ٣ · وشاشة النشر تعرف من يكتب ══
/**
 * كانت تعرض «انشر» و«إخفاء» لكل صفّ بلا فحص كتابة — فيُعرض على قارئٍ محضٍ زرٌّ
 * يفشل عند الضغط، وهو نقيض `ق-٢٠`. والصلاحية **بنطاق البرنامج** لا عامّة، فلا
 * تُحسب في الشاشة بنداءٍ واحد — تُرجعها الدالة مع صفّها.
 */
drop function public.fn_programs_publish_state();

create function public.fn_programs_publish_state()
returns table (
  id                 uuid,
  name               text,
  slug               text,
  kind               public.program_kind,
  status             public.program_status,
  sort_order         int,
  registration_state text,
  missing            text[],
  can_write          boolean
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
    public.fn_program_missing(p.id),
    public.fn_has_permission('programs.write', p.id)
  from public.programs p
  where p.deleted_at is null
    and public.fn_has_permission('programs.read', p.id)
  order by p.sort_order, p.created_at desc;
$$;

revoke all on function public.fn_programs_publish_state() from public;
grant execute on function public.fn_programs_publish_state() to authenticated;
