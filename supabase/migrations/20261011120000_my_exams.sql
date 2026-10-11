-- 079 | اختبارات المشارك في «رحلتي» (adr/0048)
--
-- المشارك لا يقرأ `exams` (سياسته للإدارة)، فاختباراته عن بعد تُقرأ من دالةٍ
-- تحرس ملكية المشاركة: ما يخصّ مساره، بنافذته ومحاولاته وأعلى نسبته وموانعه
-- من البوّابة نفسها التي يرفض بها البدء.
--
-- تراجع: نعم — حذف الدالة.

create or replace function public.fn_my_exams(p_participant_id uuid)
returns table (
  exam_id uuid, name text, stage public.exam_stage,
  opens_at timestamptz, closes_at timestamptz,
  question_count int, seconds_per_question int, max_skips int, max_attempts int,
  pass_percentage numeric, entry_percentage numeric,
  attempts int, best_percent numeric, passed boolean, open_attempt_id uuid, blockers text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pa record;
begin
  select * into pa from public.participants
  where id = p_participant_id and deleted_at is null and user_id = (select auth.uid());
  if pa.id is null then
    return;
  end if;

  return query
    select e.id, e.name, e.stage, e.opens_at, e.closes_at,
           e.question_count, e.seconds_per_question, e.max_skips, e.max_attempts,
           e.pass_percentage, e.entry_percentage,
           coalesce(b.attempts, 0), b.best_percent, coalesce(b.passed, false),
           (select a.id from public.remote_attempts a
             where a.exam_id = e.id and a.participant_id = pa.id and a.submitted_at is null and a.deleted_at is null),
           public.fn_exam_gate(e.id)
    from public.exams e
    cross join lateral public.fn_exam_best(e.id, pa.id) b
    where e.program_id = pa.program_id and e.deleted_at is null and e.exam_type = 'remote'
      and (e.track_id is null or e.track_id = pa.track_id)
    order by e.opens_at nulls first, e.created_at;
end;
$$;

revoke all on function public.fn_my_exams(uuid) from public;
grant execute on function public.fn_my_exams(uuid) to authenticated;
