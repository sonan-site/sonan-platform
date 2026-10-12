-- 085 | استعمال السؤال: عن بعد · شفهي · كلاهما (مراجعة ١١ أكتوبر، أ٥؛ قرار الراعي ١٢ أكتوبر)
--
-- ١ · `questions.usage`، وقيدان: **الشفهي وحده مفتوح** (والمفتوح شفهيٌّ وحده)،
--     **وما يدخل الشفهي له جوابٌ مكتوب للمحكّم**. وصح/خطأ لا يكون شفهياً.
--     و«كلاهما» لسؤالٍ يقوم نصّه وحده بلا خيارات (قرار الراعي — يُكتب في القالب).
-- ٢ · `fn_save_question` يفرض القواعد، ويضبط «مفتوح» للشفهي بنفسه.
-- ٣ · `fn_exam_pool` يصفّي باستعمال الاختبار: عن بعد ← `remote`/`both` بلا المفتوح؛
--     شفهي ← `oral`/`both` بجوابٍ مكتوب. فالبدء والتخطّي والسحب الشفهي يرثونها.
-- ٤ · `fn_bank_coverage`: الصالح لكل اختبارٍ في كل مسار **ضمن نطاق الدخول**
--     (للمرحلي أول ٧٥٪ من وحدات المسار) — العدد العامّ مضلِّل.
--
-- تراجع: نعم — حذف العمود والقيدين ونوعه، وإعادة الدالتين من ٠٧٧ و٠٧٨، وحذف الثالثة.

-- ══ ١ · البنية ══
create type public.question_usage as enum ('remote', 'oral', 'both');

alter table public.questions
  add column usage public.question_usage not null default 'remote',
  add constraint chk_questions_open_is_oral check ((usage = 'oral') = (question_type = 'open')),
  add constraint chk_questions_oral_answer check (usage = 'remote' or btrim(correct_answer_text) <> ''),
  add constraint chk_questions_tf_remote check (question_type <> 'true_false' or usage = 'remote');

comment on column public.questions.usage is
  'أ٥ | remote: المرحلي بخياراته · oral: الشفهي مفتوحاً بجوابٍ للمحكّم · both: الاثنان، لسؤالٍ يقوم نصّه وحده.';

-- ══ ٢ · الحفظ ══
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
  v_usage    public.question_usage;
  v_type     public.question_type;
  v_unit     uuid;
  v_track    uuid := nullif(p_q ->> 'track_id', '')::uuid;
  v_options  jsonb := coalesce(p_q -> 'options', '[]'::jsonb);
  v_answer   text := btrim(coalesce(p_q ->> 'answer', ''));
  v_count    int;
  v_correct  int;
  v_id       uuid;
begin
  if not public.fn_has_permission('exams.manage', p_program_id) then
    raise exception 'لا تملك إدارة بنك الأسئلة في هذا البرنامج' using errcode = '42501';
  end if;

  begin
    v_usage := coalesce(nullif(p_q ->> 'usage', ''), 'remote')::public.question_usage;
  exception when others then
    raise exception 'الاستعمال: عن بعد أو شفهي أو كلاهما' using errcode = '23514';
  end;

  -- الشفهي مفتوحٌ دائماً: لا يُنتظر نوعه من الشاشة.
  if v_usage = 'oral' then
    v_type := 'open';
  else
    begin
      v_type := (p_q ->> 'type')::public.question_type;
    exception when others then
      raise exception 'نوع السؤال غير معروف — مفرد أو متعدّد أو صح/خطأ' using errcode = '23514';
    end;
    if v_type is null or v_type = 'open' then
      raise exception 'السؤال المفتوح للشفهي وحده — والمرحلي مفرد أو متعدّد أو صح/خطأ' using errcode = '23514';
    end if;
  end if;

  if v_type = 'true_false' and v_usage <> 'remote' then
    raise exception 'صح/خطأ لا يكون شفهياً — اجعله «عن بعد»' using errcode = '23514';
  end if;
  if v_usage <> 'remote' and v_answer = '' then
    raise exception 'اكتب الجواب للمحكّم — يُشترط لما يدخل الشفهي' using errcode = '23514';
  end if;

  select u.id into v_unit
  from public.content_units u
  where u.program_id = p_program_id and u.deleted_at is null
    and u.sequence = nullif(p_q ->> 'unit_sequence', '')::int;
  if v_unit is null then
    raise exception 'رقم الوحدة % ليس في مادة البرنامج', coalesce(p_q ->> 'unit_sequence', '(فارغ)')
      using errcode = '23514';
  end if;

  if v_type = 'open' then
    v_options := '[]'::jsonb;
  elsif v_type = 'true_false' then
    if lower(btrim(coalesce(p_q ->> 'tf_answer', ''))) not in ('صح', 'خطأ') then
      raise exception 'جواب صح/خطأ يُكتب «صح» أو «خطأ»' using errcode = '23514';
    end if;
    v_options := jsonb_build_array(
      jsonb_build_object('text', 'صح', 'correct', btrim(p_q ->> 'tf_answer') = 'صح'),
      jsonb_build_object('text', 'خطأ', 'correct', btrim(p_q ->> 'tf_answer') = 'خطأ')
    );
  end if;

  if v_type <> 'open' then
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
  end if;

  if p_question_id is null then
    insert into public.questions (program_id, track_id, content_unit_id, text, question_type, usage, score, correct_answer_text)
    values (
      p_program_id, v_track, v_unit, btrim(p_q ->> 'text'), v_type, v_usage,
      coalesce(nullif(p_q ->> 'score', '')::numeric, 1), v_answer
    )
    returning id into v_id;
  else
    update public.questions
       set track_id = v_track, content_unit_id = v_unit, text = btrim(p_q ->> 'text'),
           question_type = v_type, usage = v_usage, score = coalesce(nullif(p_q ->> 'score', '')::numeric, 1),
           correct_answer_text = v_answer
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

-- ══ ٣ · السحب باستعمال الاختبار ══
create or replace function public.fn_exam_pool(p_exam_id uuid, p_participant_id uuid, p_exclude uuid[])
returns setof uuid
language sql
volatile
security definer
set search_path = ''
as $$
  with me as (
    select pa.track_id, e.program_id, e.exam_type,
           (select p.units from public.fn_progress_at(pa.id, now()) p) as reached
    from public.participants pa join public.exams e on e.id = p_exam_id
    where pa.id = p_participant_id
  )
  select q.id
  from public.questions q
  join public.content_units u on u.id = q.content_unit_id
  cross join me
  where q.program_id = me.program_id and q.deleted_at is null
    and (q.track_id is null or q.track_id = me.track_id)
    and public.fn_track_ordinal_of(me.track_id, u.sequence) between 1 and coalesce(me.reached, 0)
    and not (q.id = any(coalesce(p_exclude, '{}')))
    and case me.exam_type
          when 'remote' then q.usage in ('remote', 'both') and q.question_type <> 'open'
          else q.usage in ('oral', 'both') and btrim(q.correct_answer_text) <> ''
        end
  order by random();
$$;

-- ══ ٤ · تغطية البنك ══
/**
 * لكل اختبارٍ في كل مسار: الأسئلة الصالحة له **ضمن نطاق الدخول** — للمرحلي
 * أول `entry_percentage` من وحدات المسار (من دخل عندها لا يُسأل إلا منها)،
 * وللشفهي المسار كله. ومعها العدد المطلوب للاختبار الواحد.
 */
create or replace function public.fn_bank_coverage(p_program_id uuid)
returns table (exam_id uuid, exam_name text, track_id uuid, track_name text, scope_units int, available int, needed int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('exams.manage', p_program_id) then
    raise exception 'لا تملك إدارة بنك الأسئلة' using errcode = '42501';
  end if;
  return query
    with scope as (
      select e.id as eid, e.name as ename, e.exam_type, e.question_count, t.id as tid, t.name as tname, t.sort_order,
             case when e.exam_type = 'remote' and e.entry_percentage is not null
                  then ceil(public.fn_track_unit_count(t.id) * e.entry_percentage / 100.0)::int
                  else public.fn_track_unit_count(t.id) end as lim
      from public.exams e
      join public.tracks t on t.program_id = e.program_id and t.deleted_at is null
      where e.program_id = p_program_id and e.deleted_at is null
        and (e.track_id is null or e.track_id = t.id)
    )
    select s.eid, s.ename, s.tid, s.tname, s.lim,
           (select count(*)::int
              from public.questions q join public.content_units u on u.id = q.content_unit_id
             where q.program_id = p_program_id and q.deleted_at is null
               and (q.track_id is null or q.track_id = s.tid)
               and public.fn_track_ordinal_of(s.tid, u.sequence) between 1 and s.lim
               and case s.exam_type
                     when 'remote' then q.usage in ('remote', 'both') and q.question_type <> 'open'
                     else q.usage in ('oral', 'both') and btrim(q.correct_answer_text) <> ''
                   end),
           s.question_count
    from scope s
    order by s.ename, s.sort_order;
end;
$$;
revoke all on function public.fn_bank_coverage(uuid) from public;
grant execute on function public.fn_bank_coverage(uuid) to authenticated;
