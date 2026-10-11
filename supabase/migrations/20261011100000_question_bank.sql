-- 077 | بنك الأسئلة وإعدادات الاختبار المخصَّصة (adr/0048)
--
-- ١ · `exams`: نسبة الدخول، والاختبار الشرط، وعدد المحاولات، ونافذة البدء —
--     إعداداتٌ لكل اختبار يخصّصها المسؤول (قرار الراعي).
-- ٢ · صلاحيات قسم `exams`: الإدارة والتحكيم، ودور النظام يحملهما. والنشر مع شاشته.
-- ٣ · البنك: `questions` و`question_options` و`deduction_criteria`.
-- ٤ · الكتابة بدالّتين: `fn_save_question` لسؤالٍ بخياراته، و`fn_import_questions`
--     لملفٍ كاملٍ كلّه أو لا شيء. **واتساق الخيارات يُفرض فيهما** — فالسؤال
--     وخياراته يُكتبان معاً، ولا لحظة يكون فيها سؤالٌ بلا جوابٍ صحيح.
--
-- تراجع: نعم — حذف الجداول الثلاثة والدالتين والنوع والأعمدة الخمسة، وإعادة
-- قيد `chk_exams_settings_by_type` وسياسات `exams` من الهجرة ٠١٤.

-- ══ ١ · إعدادات الاختبار ══
alter table public.exams add constraint uq_exams_id_program unique (id, program_id);

alter table public.exams
  add column entry_percentage numeric(5,2),
  add column prerequisite_exam_id uuid,
  add column max_attempts int,
  add column opens_at timestamptz,
  add column closes_at timestamptz,
  -- الاختبار الشرط من البرنامج نفسه، ولا يشترط الاختبار نفسه.
  add constraint fk_exams_prerequisite foreign key (prerequisite_exam_id, program_id)
    references public.exams (id, program_id) on delete restrict,
  add constraint chk_exams_prerequisite_self check (prerequisite_exam_id is distinct from id),
  add constraint chk_exams_entry check (entry_percentage is null or entry_percentage between 0 and 100),
  add constraint chk_exams_attempts check (max_attempts is null or max_attempts between 1 and 10),
  add constraint chk_exams_window check (opens_at is null or closes_at is null or closes_at > opens_at);

comment on column public.exams.entry_percentage is
  'adr/0048 | نسبة الإنجاز اللازمة للدخول من fn_progress_at. تُقرأ لحظة البدء (remote) أو لحظة الفرز (oral).';
comment on column public.exams.prerequisite_exam_id is
  'adr/0048 | اختبارٌ يُشترط اجتيازه قبل هذا.';

-- المحاولات والنافذة من إعدادات `remote`، وفارغةٌ في `oral`.
alter table public.exams drop constraint chk_exams_settings_by_type;
alter table public.exams add constraint chk_exams_settings_by_type
  check (
    case exam_type
      when 'remote' then
        seconds_per_question is not null and max_skips is not null and max_attempts is not null
        and judge_count is null and award_percentage is null
      when 'oral' then
        judge_count is not null and award_percentage is not null
        and seconds_per_question is null and max_skips is null and max_attempts is null
        and opens_at is null and closes_at is null
      else false
    end
  ) not valid;

-- الاختبارات القائمة `remote` بلا عدد محاولات: محاولة واحدة، ثم يُتحقَّق القيد.
update public.exams set max_attempts = 1 where exam_type = 'remote' and max_attempts is null;
alter table public.exams validate constraint chk_exams_settings_by_type;

-- ══ ٢ · الصلاحيات ══
-- دور النظام يحمل الكتالوج كاملاً (`catalog.db-test.ts`)، والبذرة للإقلاع المحلي وحده.
insert into public.role_permissions (role_id, permission_code)
select r.id, code
from public.roles r
cross join (values ('exams.manage'), ('exams.judge')) as codes(code)
where r.is_system = true and r.deleted_at is null
on conflict do nothing;

-- تعريف الاختبار: بصلاحية البرنامج كما كان، أو بإدارة الاختبارات.
drop policy exams_read on public.exams;
drop policy exams_insert on public.exams;
drop policy exams_update on public.exams;

create policy exams_read on public.exams
  for select to authenticated
  using (
    (select public.fn_has_permission('programs.read', program_id))
    or (select public.fn_has_permission('exams.manage', program_id))
    or (select public.fn_has_permission('exams.judge', program_id))
  );
create policy exams_insert on public.exams
  for insert to authenticated
  with check (
    (select public.fn_has_permission('programs.write', program_id))
    or (select public.fn_has_permission('exams.manage', program_id))
  );
create policy exams_update on public.exams
  for update to authenticated
  using (
    (select public.fn_has_permission('programs.write', program_id))
    or (select public.fn_has_permission('exams.manage', program_id))
  )
  with check (
    (select public.fn_has_permission('programs.write', program_id))
    or (select public.fn_has_permission('exams.manage', program_id))
  );

-- ══ ٣ · البنك ══
create type public.question_type as enum ('single', 'multiple', 'true_false');

-- يلزم للمفتاح المركّب: وحدة السؤال من برنامجه نفسه.
alter table public.content_units add constraint uq_content_units_id_program unique (id, program_id);

create table public.questions (
  id                  uuid primary key default gen_random_uuid(),
  program_id          uuid not null references public.programs (id) on delete restrict,
  track_id            uuid,
  content_unit_id     uuid not null,
  text                text not null,
  question_type       public.question_type not null,
  score               numeric(6,2) not null default 1,
  correct_answer_text text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  foreign key (track_id, program_id) references public.tracks (id, program_id) on delete restrict,
  foreign key (content_unit_id, program_id) references public.content_units (id, program_id) on delete restrict,
  constraint chk_questions_text check (char_length(btrim(text)) between 3 and 1000),
  constraint chk_questions_score check (score > 0 and score <= 1000),
  constraint chk_questions_answer check (char_length(correct_answer_text) <= 2000)
);

comment on table public.questions is
  'adr/0048 | بنك واحد بعرضين: عن بعد بخياراته، وشفهياً بلا خيارات والمحكّم يرى correct_answer_text.';

create index idx_questions_program on public.questions (program_id) where deleted_at is null;
create index idx_questions_unit on public.questions (content_unit_id) where deleted_at is null;
create trigger trg_questions_updated_at before update on public.questions
  for each row execute function public.fn_set_updated_at();
alter table public.questions enable row level security;

create table public.question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete restrict,
  text        text not null,
  is_correct  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint chk_question_options_text check (char_length(btrim(text)) between 1 and 300)
);

create index idx_question_options_question on public.question_options (question_id) where deleted_at is null;
create trigger trg_question_options_updated_at before update on public.question_options
  for each row execute function public.fn_set_updated_at();
alter table public.question_options enable row level security;

create table public.deduction_criteria (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.programs (id) on delete restrict,
  question_id     uuid references public.questions (id) on delete restrict,
  label           text not null,
  deduction_value numeric(6,2) not null,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint chk_deduction_criteria_label check (char_length(btrim(label)) between 2 and 60),
  constraint chk_deduction_criteria_value check (deduction_value > 0 and deduction_value <= 1000)
);

comment on table public.deduction_criteria is
  'adr/0048 | question_id فارغ = معيار افتراضي للبرنامج. المحكّم يعلّم عليها ولا يكتب رقماً.';

create index idx_deduction_criteria_program on public.deduction_criteria (program_id) where deleted_at is null;
create trigger trg_deduction_criteria_updated_at before update on public.deduction_criteria
  for each row execute function public.fn_set_updated_at();
alter table public.deduction_criteria enable row level security;

-- ══ السياسات ══
-- البنك سرٌّ عن المشاركين: لا يقرؤه إلا مدير الاختبارات. والمشارك يرى سؤاله
-- عبر دالة المحاولة، والمحكّم عبر دالة جلسته — حين تُبنيان.
create policy questions_manage_read on public.questions
  for select to authenticated
  using ((select public.fn_has_permission('exams.manage', program_id)));
create policy questions_manage_insert on public.questions
  for insert to authenticated
  with check ((select public.fn_has_permission('exams.manage', program_id)));
create policy questions_manage_update on public.questions
  for update to authenticated
  using ((select public.fn_has_permission('exams.manage', program_id)))
  with check ((select public.fn_has_permission('exams.manage', program_id)));

create policy question_options_manage_read on public.question_options
  for select to authenticated
  using (exists (
    select 1 from public.questions q
    where q.id = question_id and (select public.fn_has_permission('exams.manage', q.program_id))
  ));
create policy question_options_manage_insert on public.question_options
  for insert to authenticated
  with check (exists (
    select 1 from public.questions q
    where q.id = question_id and (select public.fn_has_permission('exams.manage', q.program_id))
  ));
create policy question_options_manage_update on public.question_options
  for update to authenticated
  using (exists (
    select 1 from public.questions q
    where q.id = question_id and (select public.fn_has_permission('exams.manage', q.program_id))
  ))
  with check (exists (
    select 1 from public.questions q
    where q.id = question_id and (select public.fn_has_permission('exams.manage', q.program_id))
  ));

create policy deduction_criteria_read on public.deduction_criteria
  for select to authenticated
  using (
    (select public.fn_has_permission('exams.manage', program_id))
    or (select public.fn_has_permission('exams.judge', program_id))
  );
create policy deduction_criteria_insert on public.deduction_criteria
  for insert to authenticated
  with check ((select public.fn_has_permission('exams.manage', program_id)));
create policy deduction_criteria_update on public.deduction_criteria
  for update to authenticated
  using ((select public.fn_has_permission('exams.manage', program_id)))
  with check ((select public.fn_has_permission('exams.manage', program_id)));

-- ══ ٤ · الكتابة ══
/**
 * يتحقّق من سؤالٍ بخياراته ويكتبه. `security definer` بفحص `exams.manage` أوّلها:
 * مدير الاختبارات قد لا يقرأ مادة البرنامج بسياستها، والسؤال يُربط بوحدةٍ منها.
 * وكل كتابةٍ فيها مقيّدة بـ`p_program_id` الذي فُحصت صلاحيته.
 *
 * `p_q`: { track_id?, unit_sequence, text, type, score?, answer?, options: [{text, correct}] }.
 * القواعد: صح/خطأ خياراه «صح» و«خطأ» يُولَّدان، والمفرد خيارٌ صحيح واحد من ٢–٦،
 * والمتعدّد صحيحٌ واحد فأكثر من ٢–٦. وتُرجع رسالة الخطأ أو تكتب.
 * `p_question_id` فارغ = سؤال جديد. وإلا تُستبدل خياراته (تُؤرشف القديمة).
 */
create or replace function public.fn_save_question(
  p_program_id  uuid,
  p_question_id uuid,
  p_q           jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type     public.question_type;
  v_unit     uuid;
  v_track    uuid := nullif(p_q ->> 'track_id', '')::uuid;
  v_options  jsonb := coalesce(p_q -> 'options', '[]'::jsonb);
  v_count    int;
  v_correct  int;
  v_id       uuid;
begin
  if not public.fn_has_permission('exams.manage', p_program_id) then
    raise exception 'لا تملك إدارة بنك الأسئلة في هذا البرنامج' using errcode = '42501';
  end if;

  begin
    v_type := (p_q ->> 'type')::public.question_type;
  exception when others then
    raise exception 'نوع السؤال غير معروف — مفرد أو متعدّد أو صح/خطأ' using errcode = '23514';
  end;
  if v_type is null then
    raise exception 'نوع السؤال مطلوب' using errcode = '23514';
  end if;

  select u.id into v_unit
  from public.content_units u
  where u.program_id = p_program_id and u.deleted_at is null
    and u.sequence = nullif(p_q ->> 'unit_sequence', '')::int;
  if v_unit is null then
    raise exception 'رقم الوحدة % ليس في مادة البرنامج', coalesce(p_q ->> 'unit_sequence', '(فارغ)')
      using errcode = '23514';
  end if;

  if v_type = 'true_false' then
    if lower(btrim(coalesce(p_q ->> 'tf_answer', ''))) not in ('صح', 'خطأ') then
      raise exception 'جواب صح/خطأ يُكتب «صح» أو «خطأ»' using errcode = '23514';
    end if;
    v_options := jsonb_build_array(
      jsonb_build_object('text', 'صح', 'correct', btrim(p_q ->> 'tf_answer') = 'صح'),
      jsonb_build_object('text', 'خطأ', 'correct', btrim(p_q ->> 'tf_answer') = 'خطأ')
    );
  end if;

  select count(*), count(*) filter (where coalesce((o ->> 'correct')::boolean, false))
    into v_count, v_correct
  from jsonb_array_elements(v_options) o
  where btrim(coalesce(o ->> 'text', '')) <> '';

  if v_count < 2 or v_count > 6 then
    raise exception 'للسؤال من خيارين إلى ستة' using errcode = '23514';
  end if;
  if v_type = 'single' and v_correct <> 1 then
    raise exception 'سؤال الاختيار المفرد له جوابٌ صحيح واحد' using errcode = '23514';
  end if;
  if v_type = 'multiple' and v_correct < 1 then
    raise exception 'حدّد جواباً صحيحاً واحداً على الأقل' using errcode = '23514';
  end if;

  if p_question_id is null then
    insert into public.questions (program_id, track_id, content_unit_id, text, question_type, score, correct_answer_text)
    values (
      p_program_id, v_track, v_unit, btrim(p_q ->> 'text'), v_type,
      coalesce(nullif(p_q ->> 'score', '')::numeric, 1), btrim(coalesce(p_q ->> 'answer', ''))
    )
    returning id into v_id;
  else
    update public.questions
       set track_id = v_track, content_unit_id = v_unit, text = btrim(p_q ->> 'text'),
           question_type = v_type, score = coalesce(nullif(p_q ->> 'score', '')::numeric, 1),
           correct_answer_text = btrim(coalesce(p_q ->> 'answer', ''))
     where id = p_question_id and program_id = p_program_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'السؤال غير موجود' using errcode = 'P0002';
    end if;
    update public.question_options set deleted_at = now()
     where question_id = v_id and deleted_at is null;
  end if;

  insert into public.question_options (question_id, text, is_correct, sort_order)
  select v_id, btrim(o ->> 'text'), coalesce((o ->> 'correct')::boolean, false), (n - 1)::int
  from jsonb_array_elements(v_options) with ordinality as t(o, n)
  where btrim(coalesce(o ->> 'text', '')) <> '';

  return v_id;
end;
$$;

revoke all on function public.fn_save_question(uuid, uuid, jsonb) from public;
grant execute on function public.fn_save_question(uuid, uuid, jsonb) to authenticated;

/**
 * استيراد ملفٍ كامل — **كلّه أو لا شيء**: أول سطرٍ خاطئ يُجهض الاستيراد
 * برسالته ورقم سطره (السطر ٢ أول البيانات بعد سطر العناوين).
 */
create or replace function public.fn_import_questions(p_program_id uuid, p_rows jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_n   int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'الملف بلا أسئلة' using errcode = '23514';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'الملف أكبر من ٢٠٠٠ سؤال — قسّمه' using errcode = '23514';
  end if;

  for v_row, v_n in select r, n from jsonb_array_elements(p_rows) with ordinality as t(r, n) loop
    begin
      perform public.fn_save_question(p_program_id, null, v_row);
    exception when others then
      raise exception 'السطر %: %', v_n + 1, sqlerrm using errcode = '23514';
    end;
  end loop;

  return jsonb_array_length(p_rows);
end;
$$;

revoke all on function public.fn_import_questions(uuid, jsonb) from public;
grant execute on function public.fn_import_questions(uuid, jsonb) to authenticated;

-- ══ المنح (adr/0023) ══
revoke all on public.questions, public.question_options, public.deduction_criteria
  from anon, authenticated, service_role;
grant select, insert, update on public.questions, public.question_options, public.deduction_criteria
  to authenticated;
