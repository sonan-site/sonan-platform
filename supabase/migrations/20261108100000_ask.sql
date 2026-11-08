-- مساعد «اسأل عن المسابقة» (adr/0057 · خطة ٨ نوفمبر ق١–ق٧)
--
-- ١. ask_answers: الإجابات المعتمدة — يكتبها حامل programs.write، ولا يقرؤها الزائر.
--    المنشور منها مصدرٌ للمساعد ونموذجُ أسلوبه، بـ fn_ask_sources لـ service_role وحده.
-- ٢. ask_reports: ما يحتاج نظر الإدارة — سؤالٌ بلا جواب · جوابٌ أُبلغ عنه · جوابٌ ردّه الحارس.
--    **بلا معرّف مستخدم ولا عنوان** (ق٤)، محجوبٌ قبل الحفظ. لا إدراج مباشر: fn_ask_report
--    لـ service_role وحده، وهي التي تحجب وتمحو ما انقضت مدّته (ق٥) — بلا مجدوِل.
--    ويقرؤه حامل programs.write ويحدّث **حاله وحدها** (منحة عمود).
-- ٣. fn_ask_resolve: ينشئ إجابةً معتمدة منشورة ويغلق التقرير — ذرّياً.
-- ٤. fn_ask_overview: عدّاد اللوحة — المفتوح بأنواعه وأسئلة آخر ٢٤ ساعة (من دلو البرنامج).
-- ٥. الإعدادات (ق٦): المفتاح · النموذج · حدود fn_rate_limit القائمة.
--
-- تصنيف الدوالّ (platform.md §٧):
--   fn_ask_sources · fn_ask_report — مغلقتان: لـ service_role وحده (الخادم).
--   fn_ask_resolve · fn_ask_overview — لـ authenticated، تحرسان نفسيهما بـ programs.write.
--
-- تراجع: نعم — drop functions/tables، وحذف مفاتيح ask.* من settings.

-- ══ ١ · الإجابات المعتمدة ══
create table public.ask_answers (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  question   text not null,
  answer     text not null,
  status     public.publish_status not null default 'published',
  origin     text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_ask_answers_question check (char_length(btrim(question)) between 3 and 300),
  constraint chk_ask_answers_answer check (char_length(btrim(answer)) between 2 and 1000),
  constraint chk_ask_answers_origin check (origin in ('manual', 'unanswered', 'flagged', 'blocked'))
);

comment on table public.ask_answers is
  'إجابات المساعد المعتمدة (adr/0057) — مصدرٌ له ونموذج أسلوب، ولا تُعرض للزائر.';

create index idx_ask_answers_program
  on public.ask_answers (program_id, created_at) where deleted_at is null;

create trigger trg_ask_answers_updated_at before update on public.ask_answers
  for each row execute function public.fn_set_updated_at();
alter table public.ask_answers enable row level security;

create policy ask_answers_read on public.ask_answers
  for select to authenticated
  using (public.fn_has_permission('programs.write', program_id));

create policy ask_answers_insert on public.ask_answers
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));

create policy ask_answers_update on public.ask_answers
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

-- ══ ٢ · التقارير ══
create table public.ask_reports (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.programs (id) on delete restrict,
  kind               text not null,
  audience           text not null,
  question           text not null,
  answer             text,
  status             text not null default 'open',
  resolved_answer_id uuid references public.ask_answers (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint chk_ask_reports_kind check (kind in ('unanswered', 'flagged', 'blocked')),
  constraint chk_ask_reports_audience check (audience in ('visitor', 'student')),
  constraint chk_ask_reports_status check (status in ('open', 'resolved', 'dismissed')),
  constraint chk_ask_reports_question check (char_length(btrim(question)) between 1 and 500),
  constraint chk_ask_reports_answer check (answer is null or char_length(answer) <= 2000),
  -- unanswered بلا جواب، وغيره بجواب: ما أُبلغ عنه وما ردّه الحارس يُقرأ مع جوابه.
  constraint chk_ask_reports_answer_kind check ((kind = 'unanswered') = (answer is null))
);

comment on table public.ask_reports is
  'ما يحتاج نظر الإدارة من أسئلة المساعد (adr/0057) — محجوبٌ، بلا هوية السائل، ويُمحى بانقضاء مدّته.';

create index idx_ask_reports_program
  on public.ask_reports (program_id, status, created_at desc) where deleted_at is null;

create trigger trg_ask_reports_updated_at before update on public.ask_reports
  for each row execute function public.fn_set_updated_at();
alter table public.ask_reports enable row level security;

create policy ask_reports_read on public.ask_reports
  for select to authenticated
  using (public.fn_has_permission('programs.write', program_id));

create policy ask_reports_update on public.ask_reports
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

-- ══ المنح (adr/0023) — السحب أولاً ══
revoke all on public.ask_answers from anon, authenticated, service_role;
revoke all on public.ask_reports from anon, authenticated, service_role;
grant select, insert, update on public.ask_answers to authenticated;
grant select on public.ask_reports to authenticated;
-- الحال وحدها: نصّ السؤال والجواب كما وصلا، لا يُعاد صوغهما.
grant update (status) on public.ask_reports to authenticated;

-- ══ ٣ · الحجب — مصدرٌ واحد للخادم والقاعدة ══
-- الخادم يحجب قبل الإرسال، وهذه تحجب ثانيةً قبل الحفظ: ما يُفرض في التطبيق فقط غير مفروض.
create function private.ask_redact(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p_text, ''),
               '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[محجوب]', 'g'),
             '\+?[0-9٠-٩][0-9٠-٩ -]{7,}[0-9٠-٩]', '[محجوب]', 'g'),
           '[A-Za-z]{1,2}[0-9]{6,}', '[محجوب]', 'g')
$$;

revoke all on function private.ask_redact(text) from public;

-- ══ ٤ · مصادر المساعد ══
create function public.fn_ask_sources(p_program_id uuid)
returns table (question text, answer text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.question, a.answer
  from public.ask_answers a
  join public.programs p on p.id = a.program_id
  where a.program_id = p_program_id
    and a.status = 'published'
    and a.deleted_at is null
    and p.status = 'published'
    and p.deleted_at is null
  order by a.created_at
$$;

comment on function public.fn_ask_sources(uuid) is
  'الإجابات المعتمدة المنشورة لبرنامجٍ منشور — للخادم وحده (adr/0057).';

revoke all on function public.fn_ask_sources(uuid) from public, anon, authenticated;
grant execute on function public.fn_ask_sources(uuid) to service_role;

-- ══ ٥ · التقرير — حجبٌ ثم حفظٌ ثم محو ما انقضى ══
create function public.fn_ask_report(
  p_program_id uuid,
  p_kind       text,
  p_audience   text,
  p_question   text,
  p_answer     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_last date;
begin
  if not exists (
    select 1 from public.programs
    where id = p_program_id and status = 'published' and deleted_at is null
  ) then
    raise exception 'برنامج غير منشور' using errcode = 'P0001';
  end if;

  insert into public.ask_reports (program_id, kind, audience, question, answer)
  values (
    p_program_id, p_kind, p_audience,
    left(btrim(private.ask_redact(p_question)), 500),
    case when p_kind = 'unanswered' then null else left(private.ask_redact(p_answer), 2000) end
  )
  returning id into v_id;

  -- ق٥: آخر موعدٍ في جدول البرنامج + ٣٠ يوماً، وإلا ٩٠ يوماً من الإنشاء.
  select max(coalesce(ends_on, starts_on)) into v_last
  from public.program_schedule
  where program_id = p_program_id and deleted_at is null;

  delete from public.ask_reports
  where program_id = p_program_id
    and case
          when v_last is not null then current_date > v_last + 30
          else created_at < now() - interval '90 days'
        end;

  return v_id;
end;
$$;

comment on function public.fn_ask_report(uuid, text, text, text, text) is
  'يحفظ تقرير المساعد محجوباً ويمحو ما انقضت مدّته — للخادم وحده (adr/0057 ق٤ ق٥).';

revoke all on function public.fn_ask_report(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_ask_report(uuid, text, text, text, text) to service_role;

-- ══ ٦ · الحلّ: إجابةٌ معتمدة وإغلاقٌ معاً ══
create function public.fn_ask_resolve(p_report_id uuid, p_question text, p_answer text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.ask_reports;
  v_id     uuid;
begin
  select * into v_report from public.ask_reports
  where id = p_report_id and deleted_at is null
  for update;

  if v_report.id is null or not public.fn_has_permission('programs.write', v_report.program_id) then
    raise exception 'غير مصرَّح' using errcode = '42501';
  end if;
  if v_report.status <> 'open' then
    raise exception 'التقرير ليس مفتوحاً' using errcode = 'P0001';
  end if;

  insert into public.ask_answers (program_id, question, answer, status, origin)
  values (v_report.program_id, btrim(p_question), btrim(p_answer), 'published', v_report.kind)
  returning id into v_id;

  update public.ask_reports
  set status = 'resolved', resolved_answer_id = v_id
  where id = p_report_id;

  perform public.fn_write_audit(
    'ask_report_resolved', 'ask_reports', p_report_id, null,
    jsonb_build_object('answer_id', v_id, 'kind', v_report.kind)
  );

  return v_id;
end;
$$;

revoke all on function public.fn_ask_resolve(uuid, text, text) from public, anon;
grant execute on function public.fn_ask_resolve(uuid, text, text) to authenticated;

-- ══ ٧ · عدّاد اللوحة ══
create function public.fn_ask_overview(p_program_id uuid)
returns table (open_unanswered int, open_flagged int, open_blocked int, asked_24h int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'غير مصرَّح' using errcode = '42501';
  end if;

  return query
  select
    count(*) filter (where r.kind = 'unanswered')::int,
    count(*) filter (where r.kind = 'flagged')::int,
    count(*) filter (where r.kind = 'blocked')::int,
    (select count(*)::int from public.rate_limit_events e
      where e.bucket = 'ask.program:' || p_program_id::text
        and e.occurred_at > now() - interval '24 hours')
  from public.ask_reports r
  where r.program_id = p_program_id and r.status = 'open' and r.deleted_at is null;
end;
$$;

revoke all on function public.fn_ask_overview(uuid) from public, anon;
grant execute on function public.fn_ask_overview(uuid) to authenticated;

-- ══ ٨ · الإعدادات (ق٦) ══
insert into public.settings (key, value, scope_program_id, description) values
  ('ask.enabled', 'true'::jsonb, null, 'مفتاح المساعد — false يوقفه فوراً للجميع'),
  ('ask.model', '"claude-haiku-5-5"'::jsonb, null, 'نموذج المساعد'),
  ('ask.visitor_minute.max_attempts', '6'::jsonb, null, 'أسئلة الزائر في النافذة القصيرة'),
  ('ask.visitor_minute.window_seconds', '60'::jsonb, null, 'النافذة القصيرة بالثواني'),
  ('ask.visitor_day.max_attempts', '40'::jsonb, null, 'أسئلة الزائر في اليوم'),
  ('ask.visitor_day.window_seconds', '86400'::jsonb, null, 'نافذة اليوم بالثواني'),
  ('ask.program.max_attempts', '1500'::jsonb, null, 'سقف أسئلة البرنامج في اليوم — حدّ الكلفة'),
  ('ask.program.window_seconds', '86400'::jsonb, null, 'نافذة سقف البرنامج بالثواني')
on conflict do nothing;

alter table public.settings
  add constraint settings_ask_shape check (
    key not like 'ask.%'
    or (key = 'ask.enabled' and jsonb_typeof(value) = 'boolean')
    or (key = 'ask.model' and jsonb_typeof(value) = 'string')
    or (key like 'ask.%.max_attempts' and jsonb_typeof(value) = 'number')
    or (key like 'ask.%.window_seconds' and jsonb_typeof(value) = 'number')
  );
