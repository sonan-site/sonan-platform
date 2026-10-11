-- 082 | قراءات إدارة الجلسات (adr/0048)
--
-- ١ · `fn_exam_judge_candidates`: من يصلح للجنة — حاملو `exams.judge` على البرنامج.
--     مدير الاختبارات قد لا يقرأ الأدوار ولا المستخدمين، واللجنة تُختار منهم.
-- ٢ · `fn_session_evaluations`: حال كل محكّم مع كل مشارك في الجلسة — للإدارة
--     تتابع بها، وتُدخل الورقة الناقصة، وتعيد فتح المعتمد.
--
-- تراجع: نعم — حذف الدالتين.

create or replace function public.fn_exam_judge_candidates(p_program_id uuid)
returns table (user_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('exams.manage', p_program_id) then
    raise exception 'لا تملك إدارة الاختبارات' using errcode = '42501';
  end if;
  return query
    select distinct ur.user_id, pr.full_name
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.deleted_at is null
    join public.profiles pr on pr.user_id = ur.user_id and pr.deleted_at is null
    where ur.deleted_at is null and rp.permission_code = 'exams.judge'
      and (ur.scope_program_id is null or ur.scope_program_id = p_program_id)
    order by pr.full_name;
end;
$$;
revoke all on function public.fn_exam_judge_candidates(uuid) from public;
grant execute on function public.fn_exam_judge_candidates(uuid) to authenticated;

create or replace function public.fn_session_evaluations(p_session_id uuid)
returns table (
  participant_id uuid, judge_id uuid, judge_name text,
  evaluated int, total int, score numeric, approved boolean, retroactive boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('exams.manage', public.fn_session_program(p_session_id)) then
    raise exception 'لا تملك إدارة هذه الجلسة' using errcode = '42501';
  end if;
  return query
    select sp.participant_id, j.user_id, pr.full_name,
           coalesce((select count(*)::int from public.evaluation_answers ea where ea.evaluation_id = je.id and ea.deleted_at is null), 0),
           cardinality(sp.question_ids),
           case when je.id is null then null else public.fn_evaluation_total(je.id) end,
           coalesce(je.approved_at is not null, false),
           exists (select 1 from public.retroactive_entries r where r.evaluation_id = je.id and r.deleted_at is null)
    from public.session_participants sp
    cross join public.session_judges j
    join public.profiles pr on pr.user_id = j.user_id
    left join public.judge_evaluations je
      on je.session_id = sp.session_id and je.participant_id = sp.participant_id
     and je.judge_id = j.user_id and je.deleted_at is null
    where sp.session_id = p_session_id and sp.deleted_at is null
      and j.session_id = p_session_id and j.deleted_at is null
    order by sp.sort_order, pr.full_name;
end;
$$;
revoke all on function public.fn_session_evaluations(uuid) from public;
grant execute on function public.fn_session_evaluations(uuid) to authenticated;
