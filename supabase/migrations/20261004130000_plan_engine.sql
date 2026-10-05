-- 059 | الخطة الجديدة: أيام مرقّمة بقيمٍ لكل حقل، وخطة افتراضية ومخصّصة (adr/0036 · 0037 · 0038)
--
-- الخطة كانت قائمة أيام، كل يوم يشير إلى شكلٍ ومضاعف، والنطاق يُشتقّ عند العرض.
-- فلم تستطع أن تحمل ربطاً ومراجعةً يعودان على ما سبق. والآن: **لكل يوم قيمةٌ لكل
-- حقل له فيه نشاط** — مقدارٌ للتراكمي، و«من/إلى» للنطاق الصريح، وقيمةٌ للعددي،
-- ومعها التكرار.
--
-- **ثلاثة مصادر للبناء ونتيجتها واحدة** (adr/0042): الاستيراد، والتعبئة من شكل
-- يوم، والتحرير اليدوي — وكلها تكتب من `fn_save_plan` وحدها. فالتحقّق في موضع
-- واحد (`fn_plan_issues`)، وكل حفظٍ نسخةٌ يُرجع إليها.
--
-- **المحرّك القديم يبقى إلى المرحلة السادسة:** `plan_days` و`achievements`
-- ودوالّهما لا تُمسّ هنا، والخطط القائمة تصير «مخصّصةً» لمساراتها بلا قيم.
--
-- تراجع: نعم — عدا قيمة `explicit` في `field_kind` (لا تُحذف قيمة من enum).

-- ══ البنية ══

-- النوع الثالث. والقيمة `ranged` تبقى اسمَ «التراكمي» حتى يُعاد بناء النوع مع
-- حذف المحرّك القديم — فدوالّه تقارن بها اليوم. والقيمة الجديدة لا تُستعمل في
-- معاملة إضافتها، فتُقارَن نصّاً (`kind::text`) في هذه الهجرة.
alter type public.field_kind add value if not exists 'explicit';

-- ── خصائص الحقل — adr/0037 ──
alter table public.task_fields
  add column is_base            boolean not null default false,
  add column is_constrained     boolean not null default false,
  add column is_material_linked boolean not null default true,
  add column is_required        boolean not null default true,
  add column count_unit         text,
  add column default_repetition int;

-- العددي القائم بلا وحدة عدّ ولا مادة: «مرة» أقرب وحدة لما بُني منه («تكرار»).
update public.task_fields
set count_unit = 'مرة', is_material_linked = false
where kind = 'counted' and count_unit is null;

alter table public.task_fields add constraint chk_task_fields_properties check (
  (not is_base or (kind::text = 'ranged' and is_material_linked))
  and (not is_constrained or (kind::text = 'explicit' and is_material_linked))
  and not (is_base and is_constrained)
  and (kind::text <> 'counted' or (count_unit is not null and not is_material_linked))
  and (count_unit is null or char_length(btrim(count_unit)) between 1 and 20)
  and (default_repetition is null or default_repetition between 1 and 1000)
);

-- الحقل الأساس واحد في البرنامج: الحقول كتالوج تشترك فيه خططه كلها.
create unique index idx_task_fields_base
  on public.task_fields (program_id) where is_base and deleted_at is null;

comment on column public.task_fields.is_base is
  'adr/0037 | الحقل التراكمي الذي يقيس تقدّم المشارك في المادة. واحد في البرنامج.';
comment on column public.task_fields.is_constrained is
  'adr/0037 | نطاقٌ صريح لا يتجاوز ما بلغه الأساس في يوم الخطة نفسه.';

-- ── الخطة الافتراضية والمخصّصة — adr/0038 ──
alter table public.plans
  add column program_id uuid references public.programs (id) on delete restrict,
  add column day_count  int not null default 0;

update public.plans p set program_id = t.program_id
from public.tracks t where t.id = p.track_id;

alter table public.plans alter column program_id set not null;
alter table public.plans alter column track_id drop not null;
alter table public.plans add constraint fk_plans_track_program
  foreign key (track_id, program_id) references public.tracks (id, program_id) on delete restrict;
alter table public.plans add constraint chk_plans_day_count check (day_count between 0 and 366);

-- خطة افتراضية واحدة لكل برنامج. والمخصّصة واحدة لكل مسار بفهرسها القائم.
create unique index idx_plans_default
  on public.plans (program_id) where track_id is null and deleted_at is null;

comment on column public.plans.track_id is
  'adr/0038 | فارغ = الخطة الافتراضية للبرنامج يرثها كل مسار بلا مخصّصة. وغيره = مخصّصة لمساره.';

-- ── قيم الخطة — adr/0036 ──
create table public.plan_values (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.plans (id) on delete restrict,
  day_number    int not null,
  task_field_id uuid not null references public.task_fields (id) on delete restrict,
  amount        int,
  from_sequence int,
  to_sequence   int,
  value         numeric(10, 2),
  repetition    int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.plan_values is
  'adr/0036 | قيمة حقلٍ في يوم خطة. وجود الصفّ = للحقل نشاط في ذلك اليوم. والنطاقات بالرقم المتّصل (adr/0039).';

alter table public.plan_values add constraint chk_plan_values_day check (day_number between 1 and 366);
alter table public.plan_values add constraint chk_plan_values_shape check (
  (from_sequence is null) = (to_sequence is null)
  and ((amount is not null)::int + (from_sequence is not null)::int + (value is not null)::int) = 1
  and (amount is null or amount > 0)
  and (from_sequence is null or (from_sequence > 0 and to_sequence >= from_sequence))
  and (value is null or value > 0)
  and (repetition is null or repetition between 1 and 1000)
);

create unique index idx_plan_values_cell
  on public.plan_values (plan_id, day_number, task_field_id) where deleted_at is null;
create index idx_plan_values_field
  on public.plan_values (plan_id, task_field_id, day_number) where deleted_at is null;

create trigger trg_plan_values_updated_at before update on public.plan_values
  for each row execute function public.fn_set_updated_at();
alter table public.plan_values enable row level security;

-- ── نسخ الخطة ──
create table public.plan_versions (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.plans (id) on delete restrict,
  version_number int not null,
  snapshot       jsonb not null,
  note           text not null,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on table public.plan_versions is
  'adr/0041 | لقطة الخطة عند كل حفظ أو استيراد، بالصيغة نفسها التي يكتبها fn_save_plan.';

create unique index idx_plan_versions_number
  on public.plan_versions (plan_id, version_number) where deleted_at is null;

create trigger trg_plan_versions_updated_at before update on public.plan_versions
  for each row execute function public.fn_set_updated_at();
alter table public.plan_versions enable row level security;

-- ── إتمام يوم الخطة — قاعدة القفل (adr/0041) ──
-- يُكتب من دوالّ الرصد (المرحلة الخامسة). ويُبنى هنا لأن قفل الأيام المتمّة
-- شرطٌ على كتابة الخطة من أول يوم.
create table public.day_completions (
  id           uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete restrict,
  plan_id      uuid not null references public.plans (id) on delete restrict,
  track_id     uuid not null references public.tracks (id) on delete restrict,
  day_number   int not null,
  completed_at timestamptz not null,
  undone_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.day_completions is
  'adr/0036 | إتمام المشارك يوم خطته — بوقته. التراجع وسمٌ (undone_at) لا حذف. ويومٌ أتمّه مشاركٌ واحد يُقفل من التعديل.';

alter table public.day_completions add constraint chk_day_completions_day check (day_number between 1 and 366);
create unique index idx_day_completions_live
  on public.day_completions (participant_id, plan_id, day_number)
  where undone_at is null and deleted_at is null;
create index idx_day_completions_plan
  on public.day_completions (plan_id, day_number) where undone_at is null and deleted_at is null;

create trigger trg_day_completions_updated_at before update on public.day_completions
  for each row execute function public.fn_set_updated_at();
alter table public.day_completions enable row level security;

-- ══ الدوالّ ══

/** الأرقام هندية-عربية في رسائل القاعدة — فهي تُعرض كما هي (`platform.md §١١.١`). */
create or replace function public.fn_ar_digits(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(p_value, '0123456789', '٠١٢٣٤٥٦٧٨٩');
$$;

/** برنامج الخطة — من عمودها منذ صارت الخطة الافتراضية بلا مسار. */
create or replace function public.fn_plan_program_id(p_plan_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.program_id from public.plans p where p.id = p_plan_id and p.deleted_at is null;
$$;

/** خطة المسار الفعلية: مخصّصته إن وُجدت، وإلا الافتراضية. */
create or replace function public.fn_track_plan(p_track_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.id from public.plans c
      where c.track_id = p_track_id and c.deleted_at is null limit 1),
    (select d.id from public.plans d
      join public.tracks t on t.program_id = d.program_id
      where t.id = p_track_id and d.track_id is null and d.deleted_at is null limit 1)
  );
$$;

/** المسارات التي تستعمل الخطة: مسارها إن كانت مخصّصة، وإلا كل مسار بلا مخصّصة. */
create or replace function public.fn_plan_tracks(p_plan_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.plans p
  join public.tracks t on t.program_id = p.program_id and t.deleted_at is null
  where p.id = p_plan_id
    and p.deleted_at is null
    and (
      (p.track_id is not null and t.id = p.track_id)
      or (p.track_id is null and not exists (
        select 1 from public.plans c where c.track_id = t.id and c.deleted_at is null
      ))
    )
  order by t.sort_order;
$$;

/** آخر يوم مقفل: أبعد يومٍ أتمّه مشارك — والإتمام متتابع، فكل ما قبله متمٌّ أيضاً. */
create or replace function public.fn_plan_locked_through(p_plan_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(c.day_number), 0)::int
  from public.day_completions c
  where c.plan_id = p_plan_id and c.undone_at is null and c.deleted_at is null;
$$;

/**
 * ملاحظات الخطة على كل مسار يستعملها — `error` يمنع الحفظ، و`warning` لا يمنعه.
 *
 * - يوم بعد آخر أيام الخطة، ويوم بلا نشاط إلزامي.
 * - مجموع التراكمي المرتبط بالمادة لا يتجاوز نصيب المسار، والأساس يساويه
 *   (أقلّ منه تنبيهٌ: الخطة لا تغطّي النصيب كله).
 * - النطاق الصريح طرفاه داخل نصيب المسار، وبدايته لا تلي نهايته في ترتيبه.
 * - `BR-PLAN-03` المقيَّد لا يتجاوز ما بلغه الأساس في يوم الخطة نفسه.
 */
create or replace function public.fn_plan_issues(p_plan_id uuid)
returns table (track_id uuid, day_number int, task_field_id uuid, severity text, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan   public.plans%rowtype;
  v_base   uuid;
  v_track  record;
  v_size   int;
  v_prefix text;
  v_multi  boolean;
begin
  select * into v_plan from public.plans p where p.id = p_plan_id and p.deleted_at is null;
  if not found then
    return;
  end if;
  if not (public.fn_has_permission('programs.read', v_plan.program_id)
          or public.fn_has_permission('programs.write', v_plan.program_id)) then
    raise exception 'لا صلاحية لك على خطط هذا البرنامج' using errcode = '42501';
  end if;

  select f.id into v_base
  from public.task_fields f
  where f.program_id = v_plan.program_id and f.is_base and f.deleted_at is null;

  return query
  select null::uuid, v.day_number, v.task_field_id, 'error'::text,
         format('اليوم %s بعد آخر أيام الخطة (%s)',
                public.fn_ar_digits(v.day_number::text), public.fn_ar_digits(v_plan.day_count::text))
  from public.plan_values v
  where v.plan_id = p_plan_id and v.deleted_at is null and v.day_number > v_plan.day_count;

  return query
  select null::uuid, d, null::uuid, 'error'::text,
         format('اليوم %s بلا نشاط إلزامي', public.fn_ar_digits(d::text))
  from generate_series(1, v_plan.day_count) d
  where not exists (
    select 1
    from public.plan_values v
    join public.task_fields f on f.id = v.task_field_id and f.deleted_at is null and f.is_required
    where v.plan_id = p_plan_id and v.deleted_at is null and v.day_number = d
  );

  if v_base is null and exists (
    select 1 from public.plan_values v
    join public.task_fields f on f.id = v.task_field_id and f.is_constrained
    where v.plan_id = p_plan_id and v.deleted_at is null
  ) then
    return query
    select null::uuid, null::int, null::uuid, 'error'::text,
           'في الخطة حقلٌ مقيَّد بالأساس، ولا حقل أساس في البرنامج'::text;
  end if;

  v_multi := (select count(*) from public.fn_plan_tracks(p_plan_id)) > 1;

  for v_track in
    select t.id, t.name from public.tracks t
    where t.id in (select public.fn_plan_tracks(p_plan_id))
    order by t.sort_order
  loop
    v_size := public.fn_track_unit_count(v_track.id);
    v_prefix := case when v_multi then v_track.name || ': ' else '' end;

    -- مجموع التراكمي المرتبط بالمادة مقابل حجم النصيب.
    return query
    select v_track.id, null::int, f.id,
           case when s.total > v_size then 'error' else 'warning' end,
           v_prefix || case
             when s.total > v_size then format('مجموع مقادير «%s» (%s) يتجاوز نصيب المسار (%s)',
               f.label, public.fn_ar_digits(s.total::text), public.fn_ar_digits(v_size::text))
             else format('الخطة لا تغطّي نصيب المسار كله: مجموع مقادير «%s» %s من %s',
               f.label, public.fn_ar_digits(s.total::text), public.fn_ar_digits(v_size::text))
           end
    from public.task_fields f
    cross join lateral (
      select coalesce(sum(v.amount), 0)::int as total
      from public.plan_values v
      where v.plan_id = p_plan_id and v.task_field_id = f.id and v.deleted_at is null
    ) s
    where f.program_id = v_plan.program_id
      and f.deleted_at is null
      and f.kind::text = 'ranged'
      and f.is_material_linked
      and s.total > 0
      and (s.total > v_size or (f.is_base and s.total < v_size));

    -- النطاق الصريح داخل النصيب، ومرتّباً فيه.
    return query
    select v_track.id, v.day_number, v.task_field_id, 'error'::text,
           v_prefix || format('اليوم %s: «%s» ',
             public.fn_ar_digits(v.day_number::text), f.label) ||
           case
             when o.ord_from is null or o.ord_to is null then 'خارج نصيب المسار'
             else 'بدايته بعد نهايته في ترتيب المسار'
           end
    from public.plan_values v
    join public.task_fields f on f.id = v.task_field_id
    cross join lateral (
      select public.fn_track_ordinal_of(v_track.id, v.from_sequence) as ord_from,
             public.fn_track_ordinal_of(v_track.id, v.to_sequence) as ord_to
    ) o
    where v.plan_id = p_plan_id
      and v.deleted_at is null
      and f.kind::text = 'explicit'
      and f.is_material_linked
      and (o.ord_from is null or o.ord_to is null or o.ord_from > o.ord_to);

    -- BR-PLAN-03: المقيَّد لا يتجاوز ما بلغه الأساس في يومه.
    if v_base is not null then
      return query
      select v_track.id, v.day_number, v.task_field_id, 'error'::text,
             v_prefix || format('اليوم %s: «%s» يتجاوز ما بلغه الحفظ في هذا اليوم',
               public.fn_ar_digits(v.day_number::text), f.label)
      from public.plan_values v
      join public.task_fields f on f.id = v.task_field_id and f.is_constrained
      cross join lateral (
        select public.fn_track_ordinal_of(v_track.id, v.to_sequence) as ord_to,
               coalesce((
                 select sum(b.amount)::int from public.plan_values b
                 where b.plan_id = p_plan_id and b.task_field_id = v_base
                   and b.deleted_at is null and b.day_number <= v.day_number
               ), 0) as reach
      ) r
      where v.plan_id = p_plan_id
        and v.deleted_at is null
        and r.ord_to is not null
        and r.ord_to > r.reach;
    end if;
  end loop;
end;
$$;

/** لقطة الخطة بالصيغة التي يقرؤها `fn_save_plan` — للنسخ وللرجوع إليها. */
create or replace function public.fn_plan_snapshot(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'day_count', p.day_count,
    'values', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'day', v.day_number,
          'field_id', v.task_field_id,
          'amount', v.amount,
          'from', v.from_sequence,
          'to', v.to_sequence,
          'value', v.value,
          'repetition', v.repetition
        ))
        order by v.day_number, f.sort_order, f.label
      )
      from public.plan_values v
      join public.task_fields f on f.id = v.task_field_id
      where v.plan_id = p.id and v.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.plans p
  where p.id = p_plan_id;
$$;

/**
 * **المدخل الوحيد لكتابة الخطة** — الحفظ اليدوي والاستيراد والتعبئة والرجوع لنسخة.
 *
 * `p_payload`: `{ day_count, values: [{ day, field_id, amount? | from?, to? | value?, repetition? }] }`.
 * الخطة تُكتب كاملة: ما غاب عن القيم يُحذف، وما تغيّر يُحدَّث، وما جدّ يُدرج.
 *
 * - `BR-PLAN-02` يوم الخطة الذي أتمّه مشاركٌ واحد لا يتغيّر، ولا تقلّ الأيام عنه.
 * - ثم تُفحص الخطة المكتوبة بـ`fn_plan_issues` على كل مسار يستعملها، وأي خطأ
 *   يُرجع الحفظ كله.
 * - ثم نسخةٌ برقمها، وسطرٌ في التدقيق.
 */
create or replace function public.fn_save_plan(p_plan_id uuid, p_payload jsonb, p_note text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan    public.plans%rowtype;
  v_days    int;
  v_locked  int;
  v_bad     text;
  v_errors  text;
  v_version int;
begin
  select * into v_plan from public.plans p where p.id = p_plan_id and p.deleted_at is null for update;
  if not found then
    raise exception 'الخطة غير موجودة' using errcode = '22023';
  end if;
  if not public.fn_has_permission('programs.write', v_plan.program_id) then
    raise exception 'لا صلاحية لك على خطط هذا البرنامج' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload -> 'values') is distinct from 'array' then
    raise exception 'صيغة الخطة غير صالحة' using errcode = '22023';
  end if;

  v_days := case when (p_payload ->> 'day_count') ~ '^[0-9]{1,3}$' then (p_payload ->> 'day_count')::int end;
  if v_days is null or v_days < 1 or v_days > 366 then
    raise exception 'عدد أيام الخطة بين ١ و٣٦٦' using errcode = '23514';
  end if;

  v_locked := public.fn_plan_locked_through(p_plan_id);
  if v_days < v_locked then
    raise exception 'أتمّ مشاركون % يوماً من الخطة، فلا تقلّ أيامها عنها', public.fn_ar_digits(v_locked::text)
      using errcode = '23514';
  end if;

  drop table if exists pg_temp.plan_payload;
  create temp table plan_payload on commit drop as
  select x.day, x.field_id, x.amount, x."from", x."to", x.value, x.repetition
  from jsonb_to_recordset(p_payload -> 'values')
    as x(day int, field_id uuid, amount int, "from" int, "to" int, value numeric, repetition int);

  -- ── الصيغة قبل الكتابة ──
  if exists (
    select 1 from pg_temp.plan_payload x
    where x.field_id is null or not exists (
      select 1 from public.task_fields f
      where f.id = x.field_id and f.program_id = v_plan.program_id and f.deleted_at is null
    )
  ) then
    raise exception 'في الخطة حقلٌ ليس من حقول هذا البرنامج' using errcode = '22023';
  end if;

  select format('قيمة في اليوم %s خارج أيام الخطة (١–%s)',
                public.fn_ar_digits(coalesce(x.day, 0)::text), public.fn_ar_digits(v_days::text))
  into v_bad
  from pg_temp.plan_payload x
  where x.day is null or x.day < 1 or x.day > v_days
  limit 1;
  if v_bad is not null then
    raise exception '%', v_bad using errcode = '23514';
  end if;

  select format('اليوم %s: «%s» مكرّر', public.fn_ar_digits(x.day::text), f.label)
  into v_bad
  from pg_temp.plan_payload x
  join public.task_fields f on f.id = x.field_id
  group by x.day, x.field_id, f.label
  having count(*) > 1
  limit 1;
  if v_bad is not null then
    raise exception '%', v_bad using errcode = '23514';
  end if;

  select format('اليوم %s: «%s» %s', public.fn_ar_digits(x.day::text), f.label,
    case f.kind::text
      when 'ranged' then 'يحتاج مقداراً موجباً وحده'
      when 'explicit' then 'يحتاج «من» و«إلى» موجبين، والبداية لا تزيد على النهاية'
      else 'يحتاج قيمة موجبة وحدها'
    end)
  into v_bad
  from pg_temp.plan_payload x
  join public.task_fields f on f.id = x.field_id
  -- `is not true` لا `not`: القيمة الغائبة تجعل الشرط فارغاً لا كاذباً، والفارغ خطأ أيضاً.
  where (
    case f.kind::text
      when 'ranged' then x.amount > 0 and x."from" is null and x."to" is null and x.value is null
      when 'explicit' then x."from" > 0 and x."to" >= x."from" and x.amount is null and x.value is null
      else x.value > 0 and x.amount is null and x."from" is null and x."to" is null
    end
  ) is not true
  limit 1;
  if v_bad is not null then
    raise exception '%', v_bad using errcode = '23514';
  end if;

  if exists (
    select 1 from pg_temp.plan_payload x where x.repetition is not null and (x.repetition < 1 or x.repetition > 1000)
  ) then
    raise exception 'التكرار بين ١ و١٠٠٠' using errcode = '23514';
  end if;

  -- ── BR-PLAN-02: الأيام المقفلة كما هي ──
  if v_locked > 0 and exists (
    (select v.day_number, v.task_field_id, v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition
       from public.plan_values v
      where v.plan_id = p_plan_id and v.deleted_at is null and v.day_number <= v_locked
     except
     select x.day, x.field_id, x.amount, x."from", x."to", x.value, x.repetition
       from pg_temp.plan_payload x where x.day <= v_locked)
    union all
    (select x.day, x.field_id, x.amount, x."from", x."to", x.value, x.repetition
       from pg_temp.plan_payload x where x.day <= v_locked
     except
     select v.day_number, v.task_field_id, v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition
       from public.plan_values v
      where v.plan_id = p_plan_id and v.deleted_at is null and v.day_number <= v_locked)
  ) then
    raise exception 'الأيام ١–% أتمّها مشاركون، فلا تتغيّر', public.fn_ar_digits(v_locked::text)
      using errcode = '23514';
  end if;

  -- ── الكتابة فوق المقفل ──
  update public.plan_values v
  set deleted_at = now()
  where v.plan_id = p_plan_id
    and v.deleted_at is null
    and v.day_number > v_locked
    and not exists (
      select 1 from pg_temp.plan_payload x
      where x.day = v.day_number and x.field_id = v.task_field_id
    );

  update public.plan_values v
  set amount = x.amount, from_sequence = x."from", to_sequence = x."to",
      value = x.value, repetition = x.repetition
  from pg_temp.plan_payload x
  where v.plan_id = p_plan_id
    and v.deleted_at is null
    and v.day_number > v_locked
    and x.day = v.day_number
    and x.field_id = v.task_field_id
    and (v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition)
        is distinct from (x.amount, x."from", x."to", x.value, x.repetition);

  insert into public.plan_values
    (plan_id, day_number, task_field_id, amount, from_sequence, to_sequence, value, repetition)
  select p_plan_id, x.day, x.field_id, x.amount, x."from", x."to", x.value, x.repetition
  from pg_temp.plan_payload x
  where x.day > v_locked
    and not exists (
      select 1 from public.plan_values v
      where v.plan_id = p_plan_id and v.deleted_at is null
        and v.day_number = x.day and v.task_field_id = x.field_id
    );

  update public.plans set day_count = v_days where id = p_plan_id;

  -- ── الفحص على المكتوب: أي خطأ يُرجع الحفظ كله ──
  select string_agg(i.message, ' · ') into v_errors
  from (select message from public.fn_plan_issues(p_plan_id) where severity = 'error' limit 5) i;
  if v_errors is not null then
    raise exception 'لا تُحفظ الخطة: %', v_errors using errcode = '23514';
  end if;

  select coalesce(max(n.version_number), 0) + 1 into v_version
  from public.plan_versions n where n.plan_id = p_plan_id;

  insert into public.plan_versions (plan_id, version_number, snapshot, note, created_by)
  values (p_plan_id, v_version, public.fn_plan_snapshot(p_plan_id),
          coalesce(nullif(btrim(p_note), ''), 'حفظ'), (select auth.uid()));

  perform public.fn_write_audit(
    'plan_saved', 'plans', p_plan_id, null,
    jsonb_build_object('version', v_version, 'day_count', v_days, 'note', p_note)
  );
  return v_version;
end;
$$;

/** الرجوع إلى نسخة — حفظٌ جديد بلقطتها، فيمرّ بالتحقّق والقفل نفسيهما. */
create or replace function public.fn_restore_plan_version(p_version_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.plan_versions%rowtype;
begin
  select * into v_row from public.plan_versions where id = p_version_id and deleted_at is null;
  if not found then
    raise exception 'النسخة غير موجودة' using errcode = '22023';
  end if;
  return public.fn_save_plan(
    v_row.plan_id, v_row.snapshot,
    format('رجوع إلى النسخة %s', public.fn_ar_digits(v_row.version_number::text))
  );
end;
$$;

/**
 * ينشئ الخطة الافتراضية للبرنامج (`p_track_id` فارغ)، أو مخصّصةً لمسار —
 * فارغةً أو منسوخةً من الافتراضية.
 *
 * ولا تُستبدل خطة مسارٍ أتمّ أحد مشاركيه يوماً من الافتراضية: تبديلها ينقله
 * إلى قيم غير التي سار عليها.
 */
create or replace function public.fn_create_plan(p_program_id uuid, p_track_id uuid, p_copy boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default uuid;
  v_track   text;
  v_id      uuid;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على خطط هذا البرنامج' using errcode = '42501';
  end if;

  select d.id into v_default from public.plans d
  where d.program_id = p_program_id and d.track_id is null and d.deleted_at is null;

  if p_track_id is null then
    if v_default is not null then
      raise exception 'للبرنامج خطة افتراضية' using errcode = '23505';
    end if;
    insert into public.plans (program_id, track_id, name, day_count)
    values (p_program_id, null, 'الخطة الافتراضية', 0)
    returning id into v_id;
  else
    select t.name into v_track from public.tracks t
    where t.id = p_track_id and t.program_id = p_program_id and t.deleted_at is null;
    if v_track is null then
      raise exception 'المسار ليس من هذا البرنامج' using errcode = '22023';
    end if;
    if exists (select 1 from public.plans c where c.track_id = p_track_id and c.deleted_at is null) then
      raise exception 'للمسار خطة مخصّصة' using errcode = '23505';
    end if;
    if v_default is not null and exists (
      select 1 from public.day_completions c
      where c.plan_id = v_default and c.track_id = p_track_id and c.undone_at is null and c.deleted_at is null
    ) then
      raise exception 'أتمّ مشاركو «%» أياماً من الخطة الافتراضية، فلا تُستبدل خطتهم', v_track
        using errcode = '23514';
    end if;

    insert into public.plans (program_id, track_id, name, day_count)
    values (p_program_id, p_track_id, 'خطة ' || v_track,
            case when p_copy and v_default is not null
                 then (select day_count from public.plans where id = v_default) else 0 end)
    returning id into v_id;

    if p_copy and v_default is not null then
      insert into public.plan_values
        (plan_id, day_number, task_field_id, amount, from_sequence, to_sequence, value, repetition)
      select v_id, v.day_number, v.task_field_id, v.amount, v.from_sequence, v.to_sequence, v.value, v.repetition
      from public.plan_values v
      where v.plan_id = v_default and v.deleted_at is null;
    end if;
  end if;

  perform public.fn_write_audit(
    'plan_created', 'plans', v_id, null,
    jsonb_build_object('track_id', p_track_id, 'copied', p_copy)
  );
  return v_id;
end;
$$;

/** يُرجع المسار إلى الخطة الافتراضية — ما لم يُتمّ مشاركٌ يوماً من مخصّصته. */
create or replace function public.fn_remove_custom_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
begin
  select * into v_plan from public.plans where id = p_plan_id and deleted_at is null;
  if not found or v_plan.track_id is null then
    raise exception 'ليست خطة مخصّصة' using errcode = '22023';
  end if;
  if not public.fn_has_permission('programs.write', v_plan.program_id) then
    raise exception 'لا صلاحية لك على خطط هذا البرنامج' using errcode = '42501';
  end if;
  if public.fn_plan_locked_through(p_plan_id) > 0 then
    raise exception 'أتمّ مشاركون أياماً من هذه الخطة، فلا يُرجع مسارها إلى الافتراضية'
      using errcode = '23514';
  end if;

  update public.plan_values set deleted_at = now() where plan_id = p_plan_id and deleted_at is null;
  update public.plans set deleted_at = now() where id = p_plan_id;
  perform public.fn_write_audit('plan_removed', 'plans', p_plan_id, null, null);
end;
$$;

-- ══ السياسات ══

-- الخطة الافتراضية بلا مسار، فالبرنامج من عمودها لا من مسارها.
drop policy plans_read on public.plans;
drop policy plans_insert on public.plans;
drop policy plans_update on public.plans;
drop policy plans_read_participant on public.plans;

create policy plans_read on public.plans
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));
create policy plans_insert on public.plans
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy plans_update on public.plans
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));
create policy plans_read_participant on public.plans
  for select to authenticated
  using (
    plans.program_id in (
      select program_id from public.participants
      where user_id = (select auth.uid()) and public.fn_follows_plan(status) and deleted_at is null
    )
  );

create policy plan_values_read on public.plan_values
  for select to authenticated
  using (public.fn_has_permission('programs.read', public.fn_plan_program_id(plan_id)));

create policy plan_versions_read on public.plan_versions
  for select to authenticated
  using (public.fn_has_permission('programs.read', public.fn_plan_program_id(plan_id)));

create policy day_completions_read on public.day_completions
  for select to authenticated
  using (
    participant_id in (select id from public.participants where user_id = (select auth.uid()))
    or public.fn_has_permission('participants.read', public.fn_plan_program_id(plan_id))
  );

-- ══ المنح ══

revoke all on public.plan_values, public.plan_versions, public.day_completions
  from anon, authenticated, service_role;
grant select on public.plan_values, public.plan_versions, public.day_completions to authenticated;

revoke all on function public.fn_ar_digits(text) from public;
revoke all on function public.fn_track_plan(uuid) from public;
revoke all on function public.fn_plan_tracks(uuid) from public;
revoke all on function public.fn_plan_locked_through(uuid) from public;
revoke all on function public.fn_plan_issues(uuid) from public;
revoke all on function public.fn_plan_snapshot(uuid) from public;
revoke all on function public.fn_save_plan(uuid, jsonb, text) from public;
revoke all on function public.fn_restore_plan_version(uuid) from public;
revoke all on function public.fn_create_plan(uuid, uuid, boolean) from public;
revoke all on function public.fn_remove_custom_plan(uuid) from public;

grant execute on function public.fn_plan_issues(uuid) to authenticated;
grant execute on function public.fn_plan_locked_through(uuid) to authenticated;
grant execute on function public.fn_save_plan(uuid, jsonb, text) to authenticated;
grant execute on function public.fn_restore_plan_version(uuid) to authenticated;
grant execute on function public.fn_create_plan(uuid, uuid, boolean) to authenticated;
grant execute on function public.fn_remove_custom_plan(uuid) to authenticated;
