-- 014 | الخطة وأيامها، وبنية الاختبار
--
-- الخطة **قائمة أيام مرتّبة** لا جدول أعمدة ثابت. ولأن اليوم قابل للتحريك،
-- فالإدراج والحذف والنقل تُزيح ما بعدها — والإزاحة في القاعدة لا في التطبيق:
-- نصف إزاحة تترك خطةً بترقيم مكسور، ومن ترقيم مكسور يولَّد واجبٌ مكسور.
--
-- جدول `exams` يُبنى **بنيةً فقط** (adr/0022): `plan_days.exam_id` يشير إليه
-- ولا تكتمل الخطة بدونه، وكل تدفّقات الاختبار مؤجَّلة للمرحلة الثانية.
--
-- تراجع: نعم.

-- ══ بنية الاختبار — بنيةً فقط ══
create type public.exam_type as enum ('remote', 'oral');
create type public.exam_stage as enum ('interim', 'final');

-- يلزم للمفتاح المركّب أدناه: الاختبار على مسار يجب أن يكون من برنامجه نفسه.
alter table public.tracks add constraint uq_tracks_id_program unique (id, program_id);

create table public.exams (
  id                   uuid primary key default gen_random_uuid(),
  program_id           uuid not null references public.programs (id) on delete restrict,
  track_id             uuid,
  name                 text not null,
  exam_type            public.exam_type not null,
  stage                public.exam_stage not null,
  pass_percentage      numeric(5,2) not null,
  question_count       int not null,
  seconds_per_question int,
  max_skips            int,
  judge_count          int,
  award_percentage     numeric(5,2),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  -- مركّب لا مفرد: يمنع إسناد اختبار إلى مسار من برنامج آخر. والفراغ يمرّ
  -- لأن MATCH SIMPLE لا يفرض المفتاح حين يكون أحد أعمدته فارغاً — وهو المراد:
  -- track_id فارغ = يسري على كل المسارات.
  foreign key (track_id, program_id) references public.tracks (id, program_id) on delete restrict
);

comment on table public.exams is
  'adr/0022 | بنية فقط في المرحلة الأولى. تدفّقات الاختبار والتحكيم مؤجَّلة.';
comment on column public.exams.track_id is
  'فارغ = يسري على كل المسارات. **وهذه هي آلية التجاوز**: اختبار بمسار محدَّد يتقدّم على اختبار بمسار فارغ — لا آلية خاصة.';

-- الشفهي نهائيٌّ دائماً: لا معنى لتصفية شفهية مرحلية في نموذج المسابقة.
alter table public.exams add constraint chk_exams_oral_is_final
  check (exam_type <> 'oral' or stage = 'final');

-- إعدادات كل نوع إلزامية لنوعها وفارغة لغيره. `else false` احتياطاً: لو زيد
-- عضو للنوع لاحقاً، يفشل القيد بدل أن يمرّ صفٌّ بلا إعدادات.
alter table public.exams add constraint chk_exams_settings_by_type
  check (
    case exam_type
      when 'remote' then
        seconds_per_question is not null and max_skips is not null
        and judge_count is null and award_percentage is null
      when 'oral' then
        judge_count is not null and award_percentage is not null
        and seconds_per_question is null and max_skips is null
      else false
    end
  );

alter table public.exams add constraint chk_exams_numbers
  check (
    question_count > 0
    and pass_percentage between 0 and 100
    and (seconds_per_question is null or seconds_per_question > 0)
    and (max_skips is null or max_skips >= 0)
    and (judge_count is null or judge_count > 0)
    and (award_percentage is null or award_percentage between 0 and 100)
  );

create index idx_exams_program on public.exams (program_id) where deleted_at is null;
create index idx_exams_track on public.exams (track_id) where deleted_at is null;

create trigger trg_exams_updated_at before update on public.exams
  for each row execute function public.fn_set_updated_at();
alter table public.exams enable row level security;

-- ══ الخطة ══
create table public.plans (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references public.tracks (id) on delete restrict,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.plans is
  'خطة واحدة لكل مسار. الوحدانية قيدٌ لا عرف: بلا علامة «الخطة النافذة» في النموذج، خطتان لمسار واحد تتركان التوليد بلا مرجع.';

create unique index idx_plans_track on public.plans (track_id) where deleted_at is null;

create trigger trg_plans_updated_at before update on public.plans
  for each row execute function public.fn_set_updated_at();
alter table public.plans enable row level security;

-- ══ أيام الخطة ══
create type public.day_type as enum ('normal', 'rest', 'exam');

create table public.plan_days (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references public.plans (id) on delete restrict,
  day_number        int not null,
  day_type          public.day_type not null,
  day_template_id   uuid references public.day_templates (id) on delete restrict,
  amount_multiplier numeric(6,2) not null default 1,
  exam_id           uuid references public.exams (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table public.plan_days is
  'اليوم رقمٌ لا تاريخ: الخطة نسبية، وتاريخ اليوم يُشتقّ من انضمام المشارك. مصادر البناء ثلاثة ونتيجتها صفوف واحدة — والرفع صورة من اليدوي لا مصدر ثالث، فلا يُخزَّن مصدر البناء.';
comment on column public.plan_days.amount_multiplier is
  'مقدار الحقل في هذا اليوم = الأساسي في القالب × هذا المضاعف.';

create unique index idx_plan_days_number
  on public.plan_days (plan_id, day_number) where deleted_at is null;
create index idx_plan_days_plan
  on public.plan_days (plan_id, day_number) where deleted_at is null;

alter table public.plan_days add constraint chk_plan_days_number
  check (day_number > 0);
alter table public.plan_days add constraint chk_plan_days_multiplier
  check (amount_multiplier > 0);

-- اتساق النوع: النوع يحدّد أي مرجع إلزامي وأيّها ممنوع. صفٌّ نوعه `normal`
-- بلا قالب هو يومٌ بلا واجب يدّعي أن له واجباً.
alter table public.plan_days add constraint chk_plan_days_type_consistency
  check (
    case day_type
      when 'normal' then day_template_id is not null and exam_id is null
      when 'exam'   then exam_id is not null and day_template_id is null
      when 'rest'   then day_template_id is null and exam_id is null
      else false
    end
  );

create trigger trg_plan_days_updated_at before update on public.plan_days
  for each row execute function public.fn_set_updated_at();
alter table public.plan_days enable row level security;

/**
 * القالب والاختبار المشار إليهما من برنامج الخطة نفسه.
 *
 * المفتاح المركّب لا يكفي هنا: بين اليوم والبرنامج ثلاث قفزات
 * (يوم ← خطة ← مسار ← برنامج)، ولا يُعبَّر عنها بمفتاح. وحارسٌ يمنع الحالة
 * أهون من صفٍّ يولّد للمشارك واجباً من برنامج لا ينتمي إليه.
 */
create or replace function public.fn_guard_plan_day_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_id uuid;
begin
  select t.program_id into v_program_id
  from public.plans p
  join public.tracks t on t.id = p.track_id
  where p.id = new.plan_id;

  if v_program_id is null then
    raise exception 'خطة اليوم غير موجودة' using errcode = '23503';
  end if;

  if new.day_template_id is not null and not exists (
    select 1 from public.day_templates d
    where d.id = new.day_template_id
      and d.program_id = v_program_id
      and d.deleted_at is null
  ) then
    raise exception 'القالب ليس من برنامج الخطة' using errcode = '23514';
  end if;

  if new.exam_id is not null and not exists (
    select 1 from public.exams e
    where e.id = new.exam_id
      and e.program_id = v_program_id
      and e.deleted_at is null
  ) then
    raise exception 'الاختبار ليس من برنامج الخطة' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_plan_days_refs
  before insert or update of plan_id, day_template_id, exam_id on public.plan_days
  for each row execute function public.fn_guard_plan_day_refs();

-- ══ ترقيم الأيام — الإزاحة والتحريك ══

/**
 * إزاحة مدى من أيام الخطة بمقدار موجب أو سالب.
 *
 * **مرحلتان لا واحدة.** فهرس التفرّد يُفحَص صفاً صفاً لا في نهاية الجملة،
 * فإزاحة كتلة متتابعة إزاحةً مباشرة تصطدم بنفسها: الصف الذي ينتقل إلى موضع
 * صفٍّ لم ينتقل بعدُ يُرفض. المرحلة الأولى تنقل الكتلة إلى مدىً عالٍ فارغ،
 * والثانية تُنزلها إلى موضعها النهائي.
 *
 * الإزاحة `security invoker`: التحقّق من الصلاحية يبقى في سياسات الصفوف،
 * ومن لا يملك تعديل الخطة لا يزيح منها شيئاً.
 */
create or replace function public.fn_plan_shift_days(
  p_plan_id     uuid,
  p_from_number int,
  p_to_number   int,
  p_by          int
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_offset int;
begin
  if p_by = 0 then
    return;
  end if;

  -- الفجوة تُحسب من أعلى رقم قائم: مدى العمل أعلى من كل رقم حيّ، فلا تقاطع.
  select coalesce(max(day_number), 0) + 1000 into v_offset
  from public.plan_days
  where plan_id = p_plan_id and deleted_at is null;

  update public.plan_days
  set day_number = day_number + v_offset
  where plan_id = p_plan_id
    and deleted_at is null
    and day_number >= p_from_number
    and (p_to_number is null or day_number <= p_to_number);

  update public.plan_days
  set day_number = day_number - v_offset + p_by
  where plan_id = p_plan_id
    and deleted_at is null
    and day_number > v_offset;
end;
$$;

/**
 * إدراج يوم في موضع. ما بعده يُزاح، والرقم يُقصَر على [1، آخر+1] فلا تُفتح
 * فجوة في الترقيم: **الخطة متّصلة ببنائها لا بانضباط من يبنيها.**
 */
create or replace function public.fn_plan_insert_day(
  p_plan_id           uuid,
  p_at_number         int,
  p_day_type          public.day_type,
  p_day_template_id   uuid    default null,
  p_amount_multiplier numeric default 1,
  p_exam_id           uuid    default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_at   int;
  v_next int;
  v_id   uuid;
begin
  select coalesce(max(day_number), 0) + 1 into v_next
  from public.plan_days
  where plan_id = p_plan_id and deleted_at is null;

  v_at := least(greatest(coalesce(p_at_number, v_next), 1), v_next);

  perform public.fn_plan_shift_days(p_plan_id, v_at, null, 1);

  insert into public.plan_days
    (plan_id, day_number, day_type, day_template_id, amount_multiplier, exam_id)
  values
    (p_plan_id, v_at, p_day_type, p_day_template_id, coalesce(p_amount_multiplier, 1), p_exam_id)
  returning id into v_id;

  return v_id;
end;
$$;

/** حذف يوم: يُحذف حذفاً ليّناً، وما بعده يُسحب فيُغلق مكانه. */
create or replace function public.fn_plan_remove_day(p_plan_day_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_number  int;
begin
  select plan_id, day_number into v_plan_id, v_number
  from public.plan_days
  where id = p_plan_day_id and deleted_at is null;

  if v_plan_id is null then
    return;
  end if;

  -- الحذف أولاً: الصف المحذوف يخرج من فهرس التفرّد، فتنزل بقيّة الأيام بلا اصطدام.
  update public.plan_days set deleted_at = now() where id = p_plan_day_id;

  perform public.fn_plan_shift_days(v_plan_id, v_number + 1, null, -1);
end;
$$;

/** نقل يوم إلى موضع آخر: يُركن جانباً، ثم تُزاح الكتلة بينهما، ثم يُوضع. */
create or replace function public.fn_plan_move_day(p_plan_day_id uuid, p_to_number int)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_from    int;
  v_to      int;
  v_last    int;
  v_park    int;
begin
  select plan_id, day_number into v_plan_id, v_from
  from public.plan_days
  where id = p_plan_day_id and deleted_at is null;

  if v_plan_id is null then
    return;
  end if;

  select max(day_number) into v_last
  from public.plan_days
  where plan_id = v_plan_id and deleted_at is null;

  v_to := least(greatest(coalesce(p_to_number, v_from), 1), v_last);
  if v_to = v_from then
    return;
  end if;

  -- الركن أعلى من كل رقم حيّ، فلا يدخل مدى الإزاحة ولا يصطدم بها.
  v_park := v_last + 1;
  update public.plan_days set day_number = v_park where id = p_plan_day_id;

  if v_to > v_from then
    perform public.fn_plan_shift_days(v_plan_id, v_from + 1, v_to, -1);
  else
    perform public.fn_plan_shift_days(v_plan_id, v_to, v_from - 1, 1);
  end if;

  update public.plan_days set day_number = v_to where id = p_plan_day_id;
end;
$$;

comment on function public.fn_plan_shift_days(uuid, int, int, int) is
  'إزاحة أيام الخطة على مرحلتين — فهرس التفرّد يُفحَص صفاً صفاً فلا تصحّ الإزاحة المباشرة.';
comment on function public.fn_plan_insert_day(uuid, int, public.day_type, uuid, numeric, uuid) is
  'إدراج يوم مع إزاحة ما بعده. الترقيم يبقى متّصلاً من ١.';
comment on function public.fn_plan_remove_day(uuid) is
  'حذف ليّن ليوم مع سحب ما بعده.';
comment on function public.fn_plan_move_day(uuid, int) is
  'نقل يوم إلى موضع آخر داخل خطته.';

revoke all on function public.fn_plan_shift_days(uuid, int, int, int) from public;
revoke all on function public.fn_plan_insert_day(uuid, int, public.day_type, uuid, numeric, uuid) from public;
revoke all on function public.fn_plan_remove_day(uuid) from public;
revoke all on function public.fn_plan_move_day(uuid, int) from public;
grant execute on function public.fn_plan_shift_days(uuid, int, int, int) to authenticated;
grant execute on function public.fn_plan_insert_day(uuid, int, public.day_type, uuid, numeric, uuid) to authenticated;
grant execute on function public.fn_plan_remove_day(uuid) to authenticated;
grant execute on function public.fn_plan_move_day(uuid, int) to authenticated;

-- ══ السياسات ══
-- الخطة إعداد برنامج: تُقرأ بصلاحية قراءته وتُكتب بصلاحية كتابته.
-- قراءة المشارك لخطته تُضاف في س٦ مع الشاشة التي تستهلكها — سياسة بلا
-- مستهلك لا تُتحقَّق من طرف إلى طرف.

create policy exams_read on public.exams
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));
create policy exams_insert on public.exams
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy exams_update on public.exams
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

create policy plans_read on public.plans
  for select to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = plans.track_id
        and public.fn_has_permission('programs.read', t.program_id)
    )
  );
create policy plans_insert on public.plans
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = plans.track_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  );
create policy plans_update on public.plans
  for update to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = plans.track_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = plans.track_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  );

create policy plan_days_read on public.plan_days
  for select to authenticated
  using (
    exists (
      select 1
      from public.plans p
      join public.tracks t on t.id = p.track_id
      where p.id = plan_days.plan_id
        and public.fn_has_permission('programs.read', t.program_id)
    )
  );
create policy plan_days_insert on public.plan_days
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.plans p
      join public.tracks t on t.id = p.track_id
      where p.id = plan_days.plan_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  );
create policy plan_days_update on public.plan_days
  for update to authenticated
  using (
    exists (
      select 1
      from public.plans p
      join public.tracks t on t.id = p.track_id
      where p.id = plan_days.plan_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  )
  with check (
    exists (
      select 1
      from public.plans p
      join public.tracks t on t.id = p.track_id
      where p.id = plan_days.plan_id
        and public.fn_has_permission('programs.write', t.program_id)
    )
  );
