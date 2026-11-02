-- ══════════════════════════════════════════════════════════════════════
-- التسجيل بابٌ واحد — سدّ الدَّين د-١٣ (adr/0047)
--
-- كان المستخدم يُدرج صفّه في `participants` مباشرةً عبر REST بسياسة
-- `participants_self_register`، فيتجاوز ما لا يفحصه إلا `fn_register`: الجنس وأدنى عمر
-- البرنامج والهوية والجوال واختيار المسار وأسئلة القبول والتدقيق. ويُدرج أجوبة قبولٍ
-- مباشرةً بسياسة `admission_answers_insert`.
--
-- الآن: `fn_register` بصلاحية المالك، وتفحص بنفسها ما كانت السياسة تفحصه (الحساب النشط،
-- ونافذة التسجيل، وحالة البرنامج). وسياستا الإدراج تُحذفان ومنحتاه تُسحبان — فلا إدراج
-- للمستخدم إلا عبرها. وصلاحيات المشرف (التحديث بـ participants.write، و
-- fn_decide_track_change) لا تُمسّ. ولا تغيير يراه المسجِّل: الرسائل نفسها.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.fn_register(
  p_program_id uuid,
  p_track_id   uuid,
  p_answers    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_answers     jsonb := coalesce(p_answers, '{}'::jsonb);
  v_blockers    text[];
  v_missing     text;
  v_bad         text;
  v_participant uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً' using errcode = '42501';
  end if;

  -- ظهور البرنامج كما كانت سياستا قراءته تحكمانه للمستدعي — والمالك يرى كل شيء، فلولا هذا
  -- لكشفت رسائل الموانع والأسئلة إعدادات برنامجٍ مسودّة أو مُغلق (مراجعة البناء ١).
  if not exists (
    select 1 from public.programs p
    where p.id = p_program_id
      and ((p.status = 'published' and p.deleted_at is null) or public.fn_has_permission('programs.read', p.id))
  ) then
    raise exception 'البرنامج غير متاح' using errcode = '23514';
  end if;

  -- الأهلية (adr/0047): أول مانعٍ يُقال، والصفحة عرضتها كلها قبل النموذج.
  v_blockers := public.fn_registration_blockers(p_program_id);
  if cardinality(v_blockers) > 0 then
    raise exception '%', v_blockers[1] using errcode = '23514';
  end if;

  if p_track_id is null and exists (
    select 1 from public.tracks where program_id = p_program_id and deleted_at is null
  ) then
    raise exception 'اختر مسارك في البرنامج' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_each_text(v_answers) where char_length(value) > 2000
  ) then
    raise exception 'إحدى الإجابات أطول من المسموح (2000 حرف)' using errcode = '23514';
  end if;

  -- الأسئلة التي تخصّه: العامّة وأسئلة مساره.
  select string_agg(q.question, ' · ' order by q.sort_order)
  into v_missing
  from public.admission_questions q
  where q.program_id = p_program_id
    and q.deleted_at is null
    and q.is_required
    and (q.track_id is null or q.track_id = p_track_id)
    and btrim(coalesce(v_answers ->> q.id::text, '')) = '';

  if v_missing is not null then
    raise exception 'أجب عن الأسئلة الإلزامية: %', v_missing using errcode = '23514';
  end if;

  -- صرامة الشكل (adr/0047): «نعم/لا» لا يقبل غيرهما، والإقرار لا يمرّ إلا مُقرّاً.
  select string_agg(q.question, ' · ' order by q.sort_order)
  into v_bad
  from public.admission_questions q
  where q.program_id = p_program_id
    and q.deleted_at is null
    and (q.track_id is null or q.track_id = p_track_id)
    and btrim(coalesce(v_answers ->> q.id::text, '')) <> ''
    and (
      (q.kind = 'choice' and btrim(v_answers ->> q.id::text) not in ('نعم', 'لا'))
      or (q.kind = 'consent' and btrim(v_answers ->> q.id::text) <> 'أقرّ')
    );

  if v_bad is not null then
    raise exception 'إجابةٌ بغير الصيغة المقبولة: %', v_bad using errcode = '23514';
  end if;

  -- ما كانت سياسة `participants_self_register` تفحصه، في موضعها نفسه: قبيل الإدراج، بعد
  -- الموانع والمسار والأسئلة. و«ممتلئ» يُترك لمشغّل السعة فيقول «اكتمل العدد» كما كان —
  -- والسياسة تُقيَّم بعد المشغّلات فلم تكن تقوله. و42501 رمز رفض السياسة نفسه، فيقول
  -- الإجراء رسالته العامة كما كان (مراجعة الخطة ١).
  if not public.fn_is_active()
     or coalesce(public.fn_registration_state(p_program_id), 'closed') not in ('open', 'full') then
    raise exception 'التسجيل غير متاح' using errcode = '42501';
  end if;

  -- رقم التسجيل يُسنده مشغّله (`fn_assign_registration_no`) — يرى صفوف البرنامج كلها.
  insert into public.participants (user_id, program_id, track_id)
  values (v_uid, p_program_id, p_track_id)
  returning id into v_participant;

  insert into public.admission_answers (participant_id, question_id, answer)
  select v_participant, q.id, btrim(v_answers ->> q.id::text)
  from public.admission_questions q
  where q.program_id = p_program_id
    and q.deleted_at is null
    and (q.track_id is null or q.track_id = p_track_id)
    and btrim(coalesce(v_answers ->> q.id::text, '')) <> '';

  perform public.fn_write_audit(
    'participant_registered', 'participants', v_participant, null,
    jsonb_build_object('program_id', p_program_id, 'track_id', p_track_id)
  );

  return v_participant;
end;
$$;

revoke all on function public.fn_register(uuid, uuid, jsonb) from public;
grant execute on function public.fn_register(uuid, uuid, jsonb) to authenticated;

-- ══ الباب الواحد ══

drop policy participants_self_register on public.participants;
revoke insert on public.participants from authenticated;

drop policy admission_answers_insert on public.admission_answers;
revoke insert on public.admission_answers from authenticated;

-- تعليقٌ صار خاطئاً: الإنفاذ في الدالة لا في السياسة. (وتعليل `20261102090000_track_age`
-- بالإدراج المباشر انقضى بهذه الهجرة؛ والمشغّل يبقى لإسناد المسار من فراغ.)
comment on function public.fn_registration_state(uuid) is
  'BR-CAP-01 | مشتقّة لا مخزَّنة. مصدر الإنفاذ في fn_register — بابُ التسجيل الوحيد (د-١٣).';
