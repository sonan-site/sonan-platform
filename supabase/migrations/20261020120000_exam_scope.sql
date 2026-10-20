-- 098 | نطاق أسئلة الاختبار عن بعد، وعدم التكرار حتى يُرى النطاق كله (خطة المدة الثلاثينية · ش٣)
--
-- قرار الراعي (٢٠ أكتوبر ٢٠٢٦):
--   · لكل اختبارٍ حقلا نطاق «من٪ / إلى٪» من نصيب المسار، والافتراض من ٠ إلى نسبة الدخول. فالمرحلي
--     عند ٧٥٪ يسأل من أول ٧٥٪ — لا من كل ما بلغه. والاختبار عن بعد وحده؛ الشفهي كما هو.
--   · لا يتكرر سؤالٌ على المشارك حتى يرى كل أسئلة النطاق، ثم يُعاد الأقل ظهوراً أولاً — في بدء المحاولة
--     وفي التخطّي. والظهور يشمل المتخطّى (يُستبدل في question_ids فيُعدّ من الإجابات).
--   · النطاق مقفلٌ بعد أول محاولة كبقية إعدادات المرحلي — ومعه نسبة الدخول، فهي نهايته الافتراضية
--     (مراجعة ش٣ م١) — ويُعدَّل رجعياً بسبب. ونسبة دخولٍ صفرٌ = بلا شرط، فالنطاق إلى ١٠٠٪.
--   · تغطية البنك (fn_bank_coverage) بالنطاق الجديد، وما يلزم لكل المحاولات بلا تكرار.
--
-- تراجع: نعم — بإعادة التعريفات السابقة وحذف العمودين والدالة الجديدة.

-- ══ العمودان ══
alter table public.exams
  add column scope_from_pct numeric(5,2),
  add column scope_to_pct   numeric(5,2);
alter table public.exams add constraint chk_exams_scope check (
  (scope_from_pct is null or scope_from_pct between 0 and 100)
  and (scope_to_pct is null or scope_to_pct between 0 and 100)
  and (scope_from_pct is null or scope_to_pct is null or scope_from_pct < scope_to_pct)
);
comment on column public.exams.scope_from_pct is
  'الهجرة ٠٩٨ | بداية نطاق أسئلة الاختبار عن بعد نسبةً من نصيب المسار. فارغ = ٠.';
comment on column public.exams.scope_to_pct is
  'الهجرة ٠٩٨ | نهاية النطاق. فارغ = نسبة الدخول (أو ١٠٠). ويُقصّ دائماً بما بلغه المشارك.';

-- ══ ظهور الأسئلة للمشارك في اختبار ══
create function public.fn_exam_seen(p_exam_id uuid, p_participant_id uuid)
returns table (question_id uuid, n int)
language sql
stable
security definer
set search_path = ''
as $$
  select x, count(*)::int
  from (
    -- ما بقي في محاولاته (ما سُئله فعلاً)…
    select unnest(a.question_ids) as x
    from public.remote_attempts a
    where a.exam_id = p_exam_id and a.participant_id = p_participant_id and a.deleted_at is null
    union all
    -- …وما تخطّاه (استُبدل في question_ids فلا يبقى فيها).
    select r.question_id
    from public.remote_answers r
    join public.remote_attempts a on a.id = r.attempt_id
    where a.exam_id = p_exam_id and a.participant_id = p_participant_id and a.deleted_at is null
      and r.is_skipped and r.deleted_at is null
  ) s
  group by x;
$$;
revoke all on function public.fn_exam_seen(uuid, uuid) from public, anon, authenticated;
comment on function public.fn_exam_seen(uuid, uuid) is
  'الهجرة ٠٩٨ | كم مرةً ظهر كل سؤالٍ لمشاركٍ في اختبار (المسؤول والمتخطّى) — لترتيب السحب. داخلية.';

-- ══ السحب ══
CREATE OR REPLACE FUNCTION public.fn_exam_pool(p_exam_id uuid, p_participant_id uuid, p_exclude uuid[])
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as materialized (
    select pa.track_id, e.program_id, e.exam_type,
           public.fn_track_unit_count(pa.track_id) as share,
           coalesce(e.scope_from_pct, 0) as scope_from,
           coalesce(e.scope_to_pct, nullif(e.entry_percentage, 0), 100) as scope_to,
           case when e.exam_type = 'oral'
                then (select x.units from public.exam_eligibility x
                       where x.exam_id = e.id and x.participant_id = pa.id and x.deleted_at is null)
                else (select p.units from public.fn_progress_at_unchecked(pa.id, now()) p)
           end as reached
    from public.participants pa join public.exams e on e.id = p_exam_id
    where pa.id = p_participant_id
  )
  select q.id
  from public.questions q
  join public.content_units u on u.id = q.content_unit_id
  cross join me
  where q.program_id = me.program_id and q.deleted_at is null
    and (q.track_id is null or q.track_id = me.track_id)
    -- عن بعد: بين رتبتَي «من٪» و«إلى٪» من نصيب مساره، مقصوصاً بما بلغه — فلا يُسأل عمّا لم يحفظه مع
    -- التقريب أو القياس بالأيام (مراجعة الخطة م٤ · م٥). والشفهي كما هو: ما بلغه في لقطة الأهلية.
    and public.fn_track_ordinal_of(me.track_id, u.sequence) between
          case when me.exam_type = 'remote' then ceil(me.share * me.scope_from / 100)::int + 1 else 1 end
          and case when me.exam_type = 'remote'
                   then least(ceil(me.share * me.scope_to / 100)::int, coalesce(me.reached, 0))
                   else coalesce(me.reached, 0) end
    and not (q.id = any(coalesce(p_exclude, '{}')))
    and case me.exam_type
          when 'remote' then q.usage in ('remote', 'both') and q.question_type <> 'open'
          else q.usage in ('oral', 'both') and btrim(q.correct_answer_text) <> ''
        end
  order by random();
$function$;

CREATE OR REPLACE FUNCTION public.fn_start_attempt(p_exam_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e        record;
  v_pid    uuid := public.fn_exam_participant(p_exam_id);
  v_gate   text[];
  v_open   uuid;
  v_ids    uuid[];
  v_no     int;
  v_id     uuid;
begin
  if not public.fn_is_active() then
    raise exception 'حسابك موقوف' using errcode = '42501';
  end if;
  v_gate := public.fn_exam_gate(p_exam_id);
  if cardinality(v_gate) > 0 then
    raise exception '%', v_gate[1] using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attempt:' || p_exam_id::text || v_pid::text, 0));

  -- المنقضية تُختم أولاً: لا تحجز مكان المحاولة المفتوحة.
  perform public.fn_seal_expired_attempts(p_exam_id);

  select id into v_open from public.remote_attempts
  where exam_id = p_exam_id and participant_id = v_pid and submitted_at is null and deleted_at is null;
  if v_open is not null then
    return v_open;
  end if;

  select * into e from public.exams where id = p_exam_id;
  -- لا يتكرر سؤال حتى يرى النطاق كله، ثم الأقل ظهوراً (قرار الراعي · الهجرة ٠٩٨) — والظهور يشمل المتخطّى.
  select array_agg(x) into v_ids from (
    select x from public.fn_exam_pool(p_exam_id, v_pid, '{}') x
    left join public.fn_exam_seen(p_exam_id, v_pid) s on s.question_id = x
    order by coalesce(s.n, 0), random()
    limit e.question_count
  ) t;
  if coalesce(cardinality(v_ids), 0) < e.question_count then
    raise exception 'أسئلة الاختبار لما بلغته لم تكتمل بعد — تواصل مع إدارة البرنامج'
      using errcode = '23514';
  end if;

  select coalesce(max(attempt_no), 0) + 1 into v_no from public.remote_attempts
  where exam_id = p_exam_id and participant_id = v_pid and deleted_at is null;

  insert into public.remote_attempts (exam_id, participant_id, attempt_no, question_ids)
  values (p_exam_id, v_pid, v_no, v_ids)
  returning id into v_id;
  -- لا تدقيق: سجلّ التدقيق للأفعال الإدارية، والمحاولة نفسها سجلٌّ بوقت بدئها.
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_skip_question(p_attempt_id uuid, p_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a       record;
  e       record;
  v_new   uuid;
  v_seen  uuid[];
begin
  select at.* into a from public.remote_attempts at
  join public.participants pa on pa.id = at.participant_id
  where at.id = p_attempt_id and at.deleted_at is null and at.submitted_at is null
    and pa.user_id = (select auth.uid())
  for update of at;
  if a.id is null then
    return public.fn_attempt_state(p_attempt_id);
  end if;
  select * into e from public.exams where id = a.exam_id;

  if public.fn_attempt_done(a.id)
     or a.question_ids[a.current_index + 1] <> p_question_id
     or now() > a.current_started_at + make_interval(secs => e.seconds_per_question + 2) then
    return public.fn_attempt_state(p_attempt_id) || jsonb_build_object('late', true);
  end if;
  if a.skips_used >= e.max_skips then
    raise exception 'استنفدت حدّ التخطّي' using errcode = '23514';
  end if;

  v_seen := a.question_ids || coalesce((select array_agg(question_id) from public.remote_answers where attempt_id = a.id), '{}');
  -- الأقل ظهوراً له أولاً — كالسحب في بدء المحاولة (الهجرة ٠٩٨).
  select x into v_new from public.fn_exam_pool(a.exam_id, a.participant_id, v_seen) x
  left join public.fn_exam_seen(a.exam_id, a.participant_id) s on s.question_id = x
  order by coalesce(s.n, 0), random() limit 1;
  if v_new is null then
    raise exception 'لا سؤال بديلاً — أجب عن هذا السؤال' using errcode = '23514';
  end if;

  insert into public.remote_answers (attempt_id, question_id, is_skipped, answered_at)
  values (a.id, p_question_id, true, now())
  on conflict (attempt_id, question_id) do nothing;
  update public.remote_attempts
     set question_ids[current_index + 1] = v_new, skips_used = skips_used + 1, current_started_at = now()
   where id = a.id and current_index = a.current_index;

  return public.fn_attempt_state(p_attempt_id);
end;
$function$;

-- ══ الحارس والتعديل الرجعي ══
CREATE OR REPLACE FUNCTION public.fn_guard_exam_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_started boolean;
  v_override boolean := coalesce(current_setting('app.exam_override', true), '') = old.id::text;
  v_locked  text[] := '{}';
  v_before  jsonb := '{}';
  v_after   jsonb := '{}';
  k         text;
  v_label   jsonb := '{"pass_percentage": "نسبة الاجتياز", "question_count": "عدد الأسئلة",
                      "seconds_per_question": "زمن السؤال", "max_skips": "حدّ التخطّي", "track_id": "المسار",
                      "judge_count": "عدد المحكّمين", "award_percentage": "نسبة أهلية الجائزة",
                      "entry_percentage": "نسبة الدخول", "prerequisite_exam_id": "الاختبار الشرط",
                      "eligibility_at": "لحظة احتساب الإنجاز", "scope_from_pct": "بداية نطاق الأسئلة",
                      "scope_to_pct": "نهاية نطاق الأسئلة"}';
begin
  if new.exam_type is distinct from old.exam_type or new.program_id is distinct from old.program_id then
    raise exception 'نوع الاختبار وبرنامجه لا يتغيّران' using errcode = '23514';
  end if;
  -- وقت الحسم يكتبه الحسم وحده — إفراغه يفتح ما أقفله.
  if new.sorted_at is distinct from old.sorted_at
     and coalesce(current_setting('app.exam_sorting', true), '') <> old.id::text then
    raise exception 'وقت حسم الفرز لا يُكتب إلا من الحسم' using errcode = '23514';
  end if;

  if old.exam_type = 'remote' then
    v_started := exists (select 1 from public.remote_attempts where exam_id = old.id);
    if v_started then
      v_locked := array['pass_percentage', 'question_count', 'seconds_per_question', 'max_skips', 'track_id',
                        'scope_from_pct', 'scope_to_pct', 'entry_percentage'];
    end if;
  else
    v_started := old.sorted_at is not null
                 or exists (select 1 from public.session_participants sp join public.exam_sessions s on s.id = sp.session_id
                             where s.exam_id = old.id);
    if v_started then
      v_locked := array['pass_percentage', 'question_count', 'judge_count', 'award_percentage',
                        'entry_percentage', 'prerequisite_exam_id', 'eligibility_at', 'track_id'];
    end if;
  end if;

  foreach k in array array['name', 'track_id', 'pass_percentage', 'question_count', 'entry_percentage',
                           'prerequisite_exam_id', 'seconds_per_question', 'max_skips', 'max_attempts',
                           'opens_at', 'closes_at', 'eligibility_at', 'judge_count', 'award_percentage', 'deleted_at',
                           'scope_from_pct', 'scope_to_pct'] loop
    if (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k) then
      if k = any(v_locked) and not v_override then
        raise exception 'بدأ الاختبار: تغيير «%» يغيّر نتائج قائمة — عدّله تعديلاً رجعياً بسبب', coalesce(v_label ->> k, k)
          using errcode = '23514';
      end if;
      v_before := v_before || jsonb_build_object(k, to_jsonb(old) -> k);
      v_after := v_after || jsonb_build_object(k, to_jsonb(new) -> k);
    end if;
  end loop;

  if old.exam_type = 'remote' and new.closes_at is distinct from old.closes_at then
    perform public.fn_seal_expired_attempts(old.id);
  end if;

  if v_after <> '{}'::jsonb and (select auth.uid()) is not null
     and exists (select 1 from public.fn_my_permissions()) then
    perform public.fn_write_audit('exam_settings_changed', 'exams', old.id, v_before,
      v_after || case when v_override
                      then jsonb_build_object('reason', current_setting('app.exam_override_reason', true))
                      else '{}'::jsonb end);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_override_exam_settings(p_exam_id uuid, p_changes jsonb, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c jsonb := coalesce(p_changes, '{}'::jsonb);
begin
  if not public.fn_has_permission('exams.manage', (select program_id from public.exams where id = p_exam_id)) then
    raise exception 'لا تملك إدارة هذا الاختبار' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'اذكر سبب التعديل الرجعي' using errcode = '23514';
  end if;
  perform set_config('app.exam_override', p_exam_id::text, true);
  perform set_config('app.exam_override_reason', btrim(p_reason), true);

  update public.exams set
    pass_percentage      = case when c ? 'pass_percentage' then (c ->> 'pass_percentage')::numeric else pass_percentage end,
    question_count       = case when c ? 'question_count' then (c ->> 'question_count')::int else question_count end,
    seconds_per_question = case when c ? 'seconds_per_question' then (c ->> 'seconds_per_question')::int else seconds_per_question end,
    max_skips            = case when c ? 'max_skips' then (c ->> 'max_skips')::int else max_skips end,
    judge_count          = case when c ? 'judge_count' then (c ->> 'judge_count')::int else judge_count end,
    award_percentage     = case when c ? 'award_percentage' then (c ->> 'award_percentage')::numeric else award_percentage end,
    entry_percentage     = case when c ? 'entry_percentage' then (c ->> 'entry_percentage')::numeric else entry_percentage end,
    prerequisite_exam_id = case when c ? 'prerequisite_exam_id' then (c ->> 'prerequisite_exam_id')::uuid else prerequisite_exam_id end,
    eligibility_at       = case when c ? 'eligibility_at' then (c ->> 'eligibility_at')::timestamptz else eligibility_at end,
    track_id             = case when c ? 'track_id' then (c ->> 'track_id')::uuid else track_id end,
    scope_from_pct       = case when c ? 'scope_from_pct' then (c ->> 'scope_from_pct')::numeric else scope_from_pct end,
    scope_to_pct         = case when c ? 'scope_to_pct' then (c ->> 'scope_to_pct')::numeric else scope_to_pct end
  where id = p_exam_id and deleted_at is null;
  if not found then
    raise exception 'الاختبار غير موجود' using errcode = 'P0002';
  end if;

  perform set_config('app.exam_override', '', true);
end;
$function$;

-- ══ تغطية البنك للإدارة: النطاق الجديد، ولكل المحاولات بلا تكرار ══
CREATE OR REPLACE FUNCTION public.fn_bank_coverage(p_program_id uuid)
 RETURNS TABLE(exam_id uuid, exam_name text, track_id uuid, track_name text, scope_units integer, available integer, needed integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.fn_has_permission('exams.manage', p_program_id) then
    raise exception 'لا تملك إدارة بنك الأسئلة' using errcode = '42501';
  end if;
  return query
    with scope as (
      select e.id as eid, e.name as ename, e.exam_type,
             -- عن بعد: لكل المحاولات بلا تكرار (الهجرة ٠٩٨).
             (e.question_count + coalesce(e.max_skips, 0))
               * case when e.exam_type = 'remote' then coalesce(e.max_attempts, 1) else 1 end as need,
             t.id as tid, t.name as tname, t.sort_order,
             case when e.exam_type = 'remote' and e.entry_percentage is not null
                  then ceil(public.fn_track_unit_count(t.id) * coalesce(e.scope_to_pct, nullif(e.entry_percentage, 0), 100) / 100.0)::int
                  when e.exam_type = 'remote'
                  then ceil(public.fn_track_unit_count(t.id) * coalesce(e.scope_to_pct, 100) / 100.0)::int
                  else public.fn_track_unit_count(t.id) end as lim,
             case when e.exam_type = 'remote'
                  then ceil(public.fn_track_unit_count(t.id) * coalesce(e.scope_from_pct, 0) / 100.0)::int + 1
                  else 1 end as lo
      from public.exams e
      join public.tracks t on t.program_id = e.program_id and t.deleted_at is null
      where e.program_id = p_program_id and e.deleted_at is null
        and (e.track_id is null or e.track_id = t.id)
    )
    select s.eid, s.ename, s.tid, s.tname, greatest(s.lim - s.lo + 1, 0),
           (select count(*)::int
              from public.questions q join public.content_units u on u.id = q.content_unit_id
             where q.program_id = p_program_id and q.deleted_at is null
               and (q.track_id is null or q.track_id = s.tid)
               and public.fn_track_ordinal_of(s.tid, u.sequence) between s.lo and s.lim
               and case s.exam_type
                     when 'remote' then q.usage in ('remote', 'both') and q.question_type <> 'open'
                     else q.usage in ('oral', 'both') and btrim(q.correct_answer_text) <> ''
                   end),
           s.need
    from scope s
    order by s.ename, s.sort_order;
end;
$function$;
