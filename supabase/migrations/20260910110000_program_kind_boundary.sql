-- 025 | حدّ الوعاء — النمط يُغيّر السلوك لا الاسم  `[BR-KIND-01]`
--
-- `adr/0003` جعل «البرنامج» حاوية عامة بثلاثة أنماط. والقياس بعد بناء
-- المرحلة الأولى كشف أن الحجز **اسمٌ بلا أثر**: `program_kind` يُخزَّن
-- ويُتحقَّق منه، ولا قيد واحد في القاعدة يتفرّع عليه.
--
-- فبرنامج `weekly_followup` اليوم يقبل تعريف اختبارات، وتُسنَد لمشاركيه حالة
-- «اجتاز التصفيات»، وتُطلَب له عتبتا اجتياز وجوائز — وكلها بلا معنى فيه.
--
-- `adr/0024` يرسم الحدّ ويقرّر إنفاذه هنا. **وليس أدبَ واجهة**: ما يُفرض في
-- التطبيق فقط غير مفروض (`platform.md §٧`).
--
-- **لا جدول جديد فيها** — فلا سياسات ولا منح. وهذا مقصود لا منسيّ:
-- `adr/0023` يوجبهما على منشئ الجدول، وهذه تعدّل قائماً.
--
-- **ولا مفتاح مركّب.** أول ما يخطر `(program_id, kind)` على غرار
-- `uq_tracks_id_program`، لكنه يوجب إسقاط `exams_program_id_fkey` و
-- `participants_program_id_fkey` وإلا صار للجدول مفتاحان يتقاسمان عموداً —
-- وهو عين الشكل الذي عطّل شاشة «رحلتي» (الهجرة ٠٢٤). والمشغّل الحارس أقوى:
-- يمنع تغيير النمط **دائماً** لا حين وُجد تابع فقط.
--
-- تراجع: نعم.

-- ══ إجهاض ذاتي: الهجرة تتحقّق من شرطها قبل أن تفرضه ══
-- `platform.md §٦`: الهجرة الخطرة تُجهض نفسها برسالة تسمّي الصفوف، بدل أن
-- تفشل بقيدٍ غامض بعد أن تكون طبّقت نصفها.
do $$
declare
  v_count int;
  v_names text;
begin
  select count(*), string_agg(distinct p.name, ' · ')
  into v_count, v_names
  from public.exams e
  join public.programs p on p.id = e.program_id
  where p.kind <> 'competition' and e.deleted_at is null;
  if v_count > 0 then
    raise exception 'يوجد % اختباراً في برامج غير تنافسية (%). احذفها أو حوّل البرنامج قبل الهجرة.',
      v_count, v_names;
  end if;

  select count(*), string_agg(distinct p.name, ' · ')
  into v_count, v_names
  from public.participants pt
  join public.programs p on p.id = pt.program_id
  where p.kind <> 'competition'
    and pt.status not in ('registered', 'memorizing')
    and pt.deleted_at is null;
  if v_count > 0 then
    raise exception 'يوجد % مشاركاً بحالة تنافسية في برامج غير تنافسية (%).', v_count, v_names;
  end if;

  select count(*), string_agg(distinct name, ' · ')
  into v_count, v_names
  from public.programs
  where kind <> 'competition'
    and (passing_percentage is not null or award_percentage is not null)
    and deleted_at is null;
  if v_count > 0 then
    raise exception 'يوجد % برنامجاً غير تنافسي بعتبات (%). أفرِغها قبل الهجرة.', v_count, v_names;
  end if;
end;
$$;

-- ══ ١ · النمط يُختار مرّة ══
/**
 * تغيير النمط بعد البناء فوقه يترك صفوفاً لا يقبلها النمط الجديد — اختباراتٍ
 * في برنامج صار غير تنافسي، أو حالاتٍ لا معنى لها. ولا تصحيح آلي لذلك.
 *
 * والمنع **مطلق** لا مشروط بوجود تابع: من غيّر نمطاً فارغاً اليوم بنى عليه
 * غداً، والمنع عند البناء أشقّ من المنع عند الاختيار.
 */
create or replace function public.fn_guard_program_kind_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'نمط البرنامج يُختار مرّة ولا يُغيَّر'
      using errcode = '23514',
            hint = 'أنشئ برنامجاً بالنمط المطلوب — تغييره يترك صفوفاً لا يقبلها النمط الجديد.';
  end if;
  return new;
end;
$$;

create trigger trg_programs_kind_immutable
  before update of kind on public.programs
  for each row execute function public.fn_guard_program_kind_immutable();

-- ══ ٢ · الاختبار لا يُعرَّف إلا في مسابقة  `[BR-KIND-01]` ══
create or replace function public.fn_guard_exam_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.program_kind;
begin
  select kind into v_kind from public.programs where id = new.program_id;

  if v_kind is distinct from 'competition' then
    raise exception 'الاختبار لا يُعرَّف إلا في برنامج مسابقة'
      using errcode = '23514',
            hint = 'الأنماط الأخرى بلا تصفيات ولا اختبارات — والخطة فيها أيام عمل وراحة فقط.';
  end if;

  return new;
end;
$$;

create trigger trg_exams_kind
  before insert or update of program_id on public.exams
  for each row execute function public.fn_guard_exam_kind();

-- **ويوم الاختبار مُغلَق تعدّياً لا بقيد ثانٍ:** `chk_plan_days_type_consistency`
-- يوجب `exam_id` غير فارغ ليوم الاختبار، و`fn_guard_plan_day_refs` يوجب أن
-- يكون الاختبار من برنامج الخطة. فبلا اختبار في البرنامج لا يقوم يوم اختبار.
-- **والادّعاء المتعدّي يُختبَر لا يُفترَض** — انظر `lib/programs/kinds.db-test.ts`.

-- ══ ٣ · حالة المشارك تتبع نمط برنامجه  `[BR-KIND-01]` ══
create or replace function public.fn_guard_participant_status_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.program_kind;
begin
  select kind into v_kind from public.programs where id = new.program_id;

  if v_kind is distinct from 'competition'
     and new.status not in ('registered', 'memorizing') then
    raise exception 'هذه الحالة خاصة ببرامج المسابقة'
      using errcode = '23514',
            hint = '«مؤهَّل» و«مجتاز» أحكام تصفيات ونهائي، ولا تصفيات في غير المسابقة.';
  end if;

  return new;
end;
$$;

create trigger trg_participants_status_kind
  before insert or update of status, program_id on public.participants
  for each row execute function public.fn_guard_participant_status_kind();

-- ══ ٤ · العتبتان للمسابقة وحدها ══
-- الافتراضان ٨٠ و٩٠ **يبقيان عمداً**: كل ما يُنشئ برنامجاً بلا ذكرهما يقع
-- على النمط الافتراضي `competition`، فيمرّ كما كان. وغير المسابقة يوجب
-- إرسال `null` صراحةً — وهو ما يجعل القيد يعمل بدل أن يُلتفّ عليه بالسكوت.
alter table public.programs alter column passing_percentage drop not null;
alter table public.programs alter column award_percentage drop not null;

alter table public.programs add constraint chk_programs_thresholds_by_kind
  check (
    case when kind = 'competition'
      then passing_percentage is not null and award_percentage is not null
      else passing_percentage is null and award_percentage is null
    end
  );

-- ══ ٥ · تصحيح تعليقات القاعدة ══
-- الهجرة المطبَّقة لا تُعدَّل، والتعليق الخاطئ يُعاد كتابته هنا.
comment on table public.tracks is
  'عامّ لكل الأنماط — المسار مستوىً يختاره المسجِّل لا أداة تنافس (adr/0024). ومقاطعه في المادة تُضاف في س٤ (adr/0021).';
comment on column public.programs.kind is
  'يُختار مرّة ولا يُغيَّر. competition مبنيّ، والآخران محجوزان بحدٍّ مفروض (adr/0024).';
comment on column public.programs.passing_percentage is
  'للمسابقة وحدها — وفارغ لغيرها بقيد chk_programs_thresholds_by_kind.';
comment on column public.programs.award_percentage is
  'للمسابقة وحدها — عتبة استحقاق الجوائز، منفصلة عن الاجتياز.';

-- ══ ٦ · اسم المنصة ══
-- بشرط ذاتي: لا يمسّ قيمة عدّلها الراعي بيده.
update public.settings
set value = '"منصة سنن"'::jsonb
where key = 'platform.name' and value = '"منصة مسابقة سنن"'::jsonb;

revoke all on function public.fn_guard_program_kind_immutable() from public;
revoke all on function public.fn_guard_exam_kind() from public;
revoke all on function public.fn_guard_participant_status_kind() from public;
