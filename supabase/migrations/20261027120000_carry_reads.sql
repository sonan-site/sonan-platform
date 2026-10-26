-- حمل التقدّم عند النقل (ش٢) — ٣/٣: القراءات والقفل المضيَّق.
--
-- القراءات التي تعدّ الإتمامات مباشرة تضيف المحتسب (وإلا ظهر المنقول متأخراً زيفاً)، وتُعلَم به
-- الواجهة («محتسب» لا «أتمّ في تاريخ»). والقفل المضيَّق (قرار الراعي): المحتسب يمنع ما يغيّر معناه
-- وحده — مقادير الحقل الأساس في أيامه وتقصير الخطة دونه — وتبقى نصوص الأيام ومهامّها الأخرى حرّة.

create or replace function pg_temp.patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13) || chr(10), chr(10));
begin
  if (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: موضع التبديل غير فريد أو مفقود', p_fn;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- تبديلاتٌ متعدّدة تغيّر خرج الدالة: تُحذف وتُنشأ بتعريفها المبدَّل، ويُعاد منحها لـ`authenticated` وحده.
create or replace function pg_temp.recreate(p_fn regprocedure, p_pairs text[])
returns void language plpgsql as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13) || chr(10), chr(10));
  v_sig text := p_fn::text;
  v_cmt text := obj_description(p_fn, 'pg_proc');
  i     int;
begin
  for i in 1 .. array_length(p_pairs, 1) / 2 loop
    if (length(v_def) - length(replace(v_def, p_pairs[2 * i - 1], ''))) / length(p_pairs[2 * i - 1]) <> 1 then
      raise exception '%: التبديل % غير فريد أو مفقود', p_fn, i;
    end if;
    v_def := replace(v_def, p_pairs[2 * i - 1], p_pairs[2 * i]);
  end loop;
  execute 'drop function ' || v_sig;
  execute v_def;
  execute 'revoke all on function ' || v_sig || ' from public, anon';
  execute 'grant execute on function ' || v_sig || ' to authenticated';
  if v_cmt is not null then
    execute format('comment on function %s is %L', v_sig, v_cmt);
  end if;
end;
$$;

-- ══ خطتي: اليوم المحتسب موسوم ══
select pg_temp.recreate('public.fn_my_plan(uuid)'::regprocedure, array[
$o$completed_on date, stumbled boolean, compensated boolean, tasks jsonb)$o$,
$n$completed_on date, stumbled boolean, compensated boolean, tasks jsonb, credited boolean)$n$,
$o$         coalesce(days.tasks, '[]'::jsonb)
  from generate_series(1, e.day_count) g(n)$o$,
$n$         coalesce(days.tasks, '[]'::jsonb),
         -- محتسبٌ من مسارٍ سابق (ش٢): متمٌّ بلا إتمامٍ حيّ — فلا تاريخ له.
         g.n <= v_done and done.day_number is null
  from generate_series(1, e.day_count) g(n)$n$
]);

-- ══ حال الرحلة: عدد المحتسب ══
select pg_temp.patch('public.fn_journey_state_at(uuid, timestamptz)'::regprocedure,
$o$    'carried', v_carried
  );$o$,
$n$    'carried', v_carried,
    'credited_days', public.fn_credited_days_at(p_participant_id, e.plan_id, e.track_id, p_at)
  );$n$);

-- ══ قائمة المشاركين: المتمّ يشمل المحتسب، ويُعلَم به ══
select pg_temp.recreate('public.fn_program_participants(uuid, integer, integer)'::regprocedure, array[
$o$prior_done_days integer, total bigint)$o$,
$n$prior_done_days integer, credited_days integer, total bigint)$n$,
$o$           end as due
    from roster r
    cross join lateral public.fn_participant_engine(r.id) e
  ),
  done as ($o$,
$n$           end as due,
           case when e.plan_id is null or not exists (
                  select 1 from public.participants c where c.id = r.id and c.credited_at is not null) then 0
                else public.fn_credited_days_at(r.id, e.plan_id, e.track_id, now())
           end as credited
    from roster r
    cross join lateral public.fn_participant_engine(r.id) e
  ),
  done as ($n$,
$o$    coalesce(d.cur, 0),
    coalesce(e.due, 0),$o$,
$n$    coalesce(d.cur, 0) + coalesce(e.credited, 0),
    coalesce(e.due, 0),$n$,
$o$    coalesce(d.prior, 0),
    count(*) over ()$o$,
$n$    coalesce(d.prior, 0),
    coalesce(e.credited, 0),
    count(*) over ()$n$
]);

-- ══ المتأخرون: المحتسب ليس تأخراً ══
select pg_temp.patch('public.fn_program_late(uuid, timestamptz)'::regprocedure,
$o$                else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.pace_base, v_at)
           end as due
    from roster r$o$,
$n$                else public.fn_due_days_at(e.program_id, e.track_id, e.start_date, e.day_count, e.pace_base, v_at)
           end as due,
           case when e.plan_id is null or not exists (
                  select 1 from public.participants c where c.id = r.id and c.credited_at is not null) then 0
                else public.fn_credited_days_at(r.id, e.plan_id, e.track_id, v_at)
           end as credited
    from roster r$n$);
select pg_temp.patch('public.fn_program_late(uuid, timestamptz)'::regprocedure,
$o$         e.due, coalesce(d.cur, 0), e.due - coalesce(d.cur, 0), d.last_at$o$,
$n$         e.due, coalesce(d.cur, 0) + e.credited, e.due - coalesce(d.cur, 0) - e.credited, d.last_at$n$);
select pg_temp.patch('public.fn_program_late(uuid, timestamptz)'::regprocedure,
$o$  where e.due - coalesce(d.cur, 0) >= 1
  order by e.due - coalesce(d.cur, 0) desc,$o$,
$n$  where e.due - coalesce(d.cur, 0) - e.credited >= 1
  order by e.due - coalesce(d.cur, 0) - e.credited desc,$n$);

-- ══ القفل المضيَّق ══
-- أكبر يومٍ محتسبٍ على الخطة لمشاركٍ يسير عليها الآن: ما دونه معناه وحدات حفظ.
create or replace function public.fn_plan_credit_through(p_plan_id uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(max(public.fn_credit_span(p_plan_id, pa.credited_units)), 0)::int
  from public.participants pa
  where pa.credited_at is not null and pa.deleted_at is null and pa.track_id is not null
    and public.fn_track_plan(pa.track_id) = p_plan_id;
$$;
comment on function public.fn_plan_credit_through(uuid) is
  'آخر يومٍ في الخطة يغطيه محتسبُ منقولٍ عليها — داخلية للحرّاس (القفل المضيَّق، ش٢).';
revoke all on function public.fn_plan_credit_through(uuid) from public, anon, authenticated;

-- الحفظ: لا تقصير دون المحتسب، ولا تغيير لمقادير الأساس في أيامه.
select pg_temp.patch('public.fn_save_plan(uuid, jsonb, text, integer)'::regprocedure,
$o$  v_locked  int;
  v_bad     text;$o$,
$n$  v_locked  int;
  v_credit  int;
  v_base    uuid;
  v_spans   int[];
  v_bad     text;$n$);
select pg_temp.patch('public.fn_save_plan(uuid, jsonb, text, integer)'::regprocedure,
$o$  if v_locked > 0 and exists ($o$,
$n$  -- ── المحتسب (ش٢ · القفل المضيَّق): أيامه باقية، ومقادير أساسها كما هي ──
  v_credit := public.fn_plan_credit_through(p_plan_id);
  if v_credit > v_locked then
    if v_days < v_credit then
      raise exception 'لمنقولين % يوماً محتسبة من هذه الخطة، فلا تقلّ أيامها عنها', public.fn_ar_digits(v_credit::text)
        using errcode = '23514';
    end if;
    select f.id into v_base from public.task_fields f
    where f.program_id = v_plan.program_id and f.is_base and f.deleted_at is null;
    if v_base is not null and exists (
      (select v.day_number, v.amount from public.plan_values v
        where v.plan_id = p_plan_id and v.deleted_at is null and v.task_field_id = v_base and v.day_number <= v_credit
       except
       select x.day, x.amount from pg_temp.plan_payload x where x.field_id = v_base and x.day <= v_credit)
      union all
      (select x.day, x.amount from pg_temp.plan_payload x where x.field_id = v_base and x.day <= v_credit
       except
       select v.day_number, v.amount from public.plan_values v
        where v.plan_id = p_plan_id and v.deleted_at is null and v.task_field_id = v_base and v.day_number <= v_credit)
    ) then
      raise exception 'الأيام 1–% محتسبةٌ لمنقولين: مقادير الحفظ فيها لا تتغيّر، وما سواها يُعدَّل', public.fn_ar_digits(v_credit::text)
        using errcode = '23514';
    end if;
  end if;

  -- ما يحتسبه كل منقولٍ على الخطة قبل الكتابة — يُقارَن بعدها.
  select array_agg(public.fn_credit_span(p_plan_id, pa.credited_units) order by pa.id) into v_spans
  from public.participants pa
  where pa.credited_at is not null and pa.deleted_at is null and pa.track_id is not null
    and public.fn_track_plan(pa.track_id) = p_plan_id;

  if v_locked > 0 and exists ($n$);

-- وبعد الكتابة: تعديل يومٍ فوق المحتسب (مقدارٌ أقلّ أو صفر) قد يمدّه بأثرٍ رجعي — فيُرفض.
select pg_temp.patch('public.fn_save_plan(uuid, jsonb, text, integer)'::regprocedure,
$o$  perform set_config('app.plan_save', 'off', true);$o$,
$n$  perform set_config('app.plan_save', 'off', true);

  if v_spans is not null and v_spans is distinct from (
    select array_agg(public.fn_credit_span(p_plan_id, pa.credited_units) order by pa.id)
    from public.participants pa
    where pa.credited_at is not null and pa.deleted_at is null and pa.track_id is not null
      and public.fn_track_plan(pa.track_id) = p_plan_id
  ) then
    raise exception 'هذا التعديل يغيّر الأيام المحتسبة لمنقولين على الخطة: أبقِ مقادير الحفظ حولها كما هي'
      using errcode = '23514';
  end if;$n$);

-- حذف الخطة · إرجاع المسار إلى الافتراضية · تخصيص مسارٍ محمولٍ على الافتراضية · تغيير «أساس»:
-- كلها تنقل المحتسب إلى قيمٍ أخرى أو تمحو معناه.
select pg_temp.patch('public.fn_guard_plan_rules()'::regprocedure,
$o$      if v_default is not null and exists (
        select 1 from public.day_completions c
        where c.plan_id = v_default and c.track_id = new.track_id
          and c.undone_at is null and c.deleted_at is null
      ) then$o$,
$n$      if v_default is not null and (exists (
        select 1 from public.day_completions c
        where c.plan_id = v_default and c.track_id = new.track_id
          and c.undone_at is null and c.deleted_at is null
      ) or exists (
        select 1 from public.participants pa
        where pa.track_id = new.track_id and pa.credited_at is not null and pa.deleted_at is null
      )) then$n$);
select pg_temp.patch('public.fn_guard_plan_rules()'::regprocedure,
$o$     and public.fn_plan_locked_through(old.id) > 0 then$o$,
$n$     and (public.fn_plan_locked_through(old.id) > 0 or public.fn_plan_credit_through(old.id) > 0) then$n$);

select pg_temp.patch('public.fn_remove_custom_plan(uuid)'::regprocedure,
$o$  if public.fn_plan_locked_through(p_plan_id) > 0 then$o$,
$n$  if public.fn_plan_locked_through(p_plan_id) > 0 or public.fn_plan_credit_through(p_plan_id) > 0 then$n$);

select pg_temp.patch('public.fn_guard_task_field_plan_values()'::regprocedure,
$o$         and public.fn_plan_locked_through(p.id) > 0$o$,
$n$         and (public.fn_plan_locked_through(p.id) > 0 or public.fn_plan_credit_through(p.id) > 0)$n$);

-- مقاطع المسار: المحتسب رتبٌ فيها، فتعديلها يُسند له محفوظاً ليس من مساره.
select pg_temp.patch('public.fn_guard_track_ranges_frozen()'::regprocedure,
$o$  if exists (
    select 1 from public.day_completions c
    where c.track_id = v_track and c.deleted_at is null
  ) then$o$,
$n$  if exists (
    select 1 from public.day_completions c
    where c.track_id = v_track and c.deleted_at is null
  ) or exists (
    select 1 from public.participants pa
    where pa.track_id = v_track and pa.credited_at is not null and pa.deleted_at is null
  ) then$n$);
