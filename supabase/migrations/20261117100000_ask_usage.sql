-- عدّاد استخدام المساعد (adr/0057 · خطة ١٧ نوفمبر المعتمدة): كم سؤالاً وصله في اليوم، وبأي نتيجة.
--
-- **التسجيل:** الخادم وحده (`fn_ask_count`، لـ service_role) بعد كل سؤالٍ تجاوز الإعداد والمصادر.
-- **بلا هوية:** أعدادٌ لكل (برنامج × يوم بتوقيت الرياض × سائل × نتيجة) — لا نص السؤال ولا السائل ولا عنوانه.
-- **القراءة:** `fn_ask_usage` لحامل programs.write في نطاقه — كتبويب المساعد نفسه.
-- **لا حذف:** ولا ليّناً — `deleted_at` عمود النواة وحده، والإضافة تزيد السطر القائم.
-- **حدّه:** يبدأ من يوم النشر؛ ما قبله لم يُسجَّل (سجلّ الحدّ يُمحى بعد ٢٤ ساعة).
--
-- تصنيف الدوالّ (platform.md §٧):
--   fn_ask_count — مغلقة: لـ service_role وحده (الخادم).
--   fn_ask_usage — لـ authenticated، تحرس نفسها بـ programs.write.
--
-- تراجع: نعم — drop functions/table.

create table public.ask_counts (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  day        date not null,
  audience   text not null,
  outcome    text not null,
  asked      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_ask_counts_audience check (audience in ('visitor', 'student')),
  constraint chk_ask_counts_outcome check (
    outcome in ('answer', 'student_affairs', 'voices', 'off_topic', 'blocked', 'limited', 'error')
  ),
  constraint chk_ask_counts_count check (asked >= 0)
);
comment on table public.ask_counts is
  'أعداد أسئلة المساعد في اليوم بنتائجها — بلا هوية (adr/0057). يكتبها fn_ask_count ويقرؤها fn_ask_usage.';

create unique index idx_ask_counts_key on public.ask_counts (program_id, day, audience, outcome);
create trigger trg_ask_counts_updated_at before update on public.ask_counts
  for each row execute function public.fn_set_updated_at();
alter table public.ask_counts enable row level security;
revoke all on public.ask_counts from anon, authenticated, service_role;
-- قراءةٌ ممنوحة بسياسةٍ لا تُرجع صفّاً — فلا جدول بلا سياسة ولا سياسة بلا منحة (`grants.db-test`).
grant select on public.ask_counts to authenticated;
create policy ask_counts_functions_only on public.ask_counts
  for select to authenticated using (false);

-- ══ التسجيل: واحدٌ لكل سؤال ══
create function public.fn_ask_count(p_program_id uuid, p_audience text, p_outcome text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  -- القيود تردّ السائل والنتيجة غير المعروفين (23514)، والمفتاح الأجنبي البرنامجَ المجهول.
  insert into public.ask_counts (program_id, day, audience, outcome, asked)
  values (p_program_id, (now() at time zone 'Asia/Riyadh')::date, p_audience, p_outcome, 1)
  on conflict (program_id, day, audience, outcome)
  do update set asked = public.ask_counts.asked + 1;
$$;

comment on function public.fn_ask_count(uuid, text, text) is
  'يعدّ سؤالاً للمساعد في يومه بتوقيت الرياض — للخادم وحده (adr/0057).';

revoke all on function public.fn_ask_count(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_ask_count(uuid, text, text) to service_role;

-- ══ القراءة: اليوم · آخر ٧ أيام · منذ البدء — لكل نتيجة، والأصفار ظاهرة ══
create function public.fn_ask_usage(p_program_id uuid)
returns table (outcome text, today int, last_7 int, total int, student_total int, first_day date)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'غير مصرَّح' using errcode = '42501';
  end if;

  return query
  select
    o.outcome,
    coalesce(sum(c.asked) filter (where c.day = v_today), 0)::int,
    coalesce(sum(c.asked) filter (where c.day > v_today - 7), 0)::int,
    coalesce(sum(c.asked), 0)::int,
    coalesce(sum(c.asked) filter (where c.audience = 'student'), 0)::int,
    (select min(a.day) from public.ask_counts a where a.program_id = p_program_id and a.deleted_at is null)
  from unnest(array['answer', 'student_affairs', 'voices', 'off_topic', 'blocked', 'limited', 'error'])
    with ordinality as o(outcome, ord)
  left join public.ask_counts c
    on c.outcome = o.outcome and c.program_id = p_program_id and c.deleted_at is null
  group by o.outcome, o.ord
  order by o.ord;
end;
$$;

comment on function public.fn_ask_usage(uuid) is
  'أعداد المساعد لبرنامجٍ بنتائجها — لحامل programs.write في نطاقه (adr/0057).';

revoke all on function public.fn_ask_usage(uuid) from public, anon;
grant execute on function public.fn_ask_usage(uuid) to authenticated;
