-- 056 | المادة بأقسام وترقيم متّصل (adr/0039)
--
-- المادة كانت قائمة واحدة مرقّمة لا تعرف أبوابها، فلا يقول النظام إن الوحدة ٤٨
-- هي «الحديث ١ من باب الطهارة»، ولا يقرأ ملفاً يرقّم كل باب من ١. والآن:
-- **أقسامٌ بترتيبها وأحجامها، ومنها تُولَّد الوحدات وأرقامها المتّصلة**.
--
-- **دالة واحدة تكتب الأقسام** (`fn_set_material_sections`): تأخذ القائمة كاملة
-- بترتيبها، ثم تُعيد ترقيم الوحدات بحسبها. والكتابة المباشرة على حجم القسم أو
-- ترتيبه أو على وحداته ممنوعة خارجها — فلا تصل المادة إلى حالٍ تخالف أقسامها.
--
-- **القفل يأتي من الحارس القائم** (`fn_guard_content_unit_change`، الهجرة ٠٣٣):
-- وحدةٌ داخل نصيب مسار لا يتغيّر رقمها ولا تُحذف. فما يُزيح أرقامها يُرفض كله،
-- وإضافة قسم في آخر المادة تمرّ لأنها لا تُزيح شيئاً. وقيم الخطط تُضاف إلى القفل
-- مع جداولها (adr/0036).
--
-- تراجع: نعم.

-- ══ البنية ══

alter table public.programs
  add column section_label text,
  add column unit_singular text,
  add column unit_one      text,
  add column unit_two      text,
  add column unit_few      text,
  add column unit_many     text;

alter table public.programs add constraint chk_programs_material_forms check (
  (section_label is null or char_length(btrim(section_label)) between 1 and 30)
  and (unit_singular is null or char_length(btrim(unit_singular)) between 1 and 30)
  and (unit_one      is null or char_length(btrim(unit_one))      between 1 and 30)
  and (unit_two      is null or char_length(btrim(unit_two))      between 1 and 30)
  and (unit_few      is null or char_length(btrim(unit_few))      between 1 and 30)
  and (unit_many     is null or char_length(btrim(unit_many))     between 1 and 30)
);

comment on column public.programs.section_label is
  'adr/0039 | اسم قسم المادة للعرض: «باب» · «سورة». فارغ = «القسم».';
comment on column public.programs.unit_singular is
  'adr/0039 | صيغ الوحدة الخمس: المفرد · مع الواحد · المثنّى · مع ٣–١٠ · مع ١١ فأكثر. الفارغ يُعرض بصيغة «الوحدة» العامة.';

create table public.material_sections (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  name       text not null,
  sort_order int not null,
  unit_count int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.material_sections is
  'adr/0039 | أقسام المادة بترتيبها وأحجامها. منها يُولَّد الرقم المتّصل لوحداتها.';

alter table public.material_sections add constraint chk_material_sections_name
  check (char_length(btrim(name)) between 1 and 80);
alter table public.material_sections add constraint chk_material_sections_count
  check (unit_count between 1 and 100000);
alter table public.material_sections add constraint uq_material_sections_program
  unique (id, program_id);

create unique index idx_material_sections_name
  on public.material_sections (program_id, name) where deleted_at is null;
create index idx_material_sections_order
  on public.material_sections (program_id, sort_order) where deleted_at is null;

create trigger trg_material_sections_updated_at before update on public.material_sections
  for each row execute function public.fn_set_updated_at();
alter table public.material_sections enable row level security;

-- الوحدة تتبع قسمها من برنامجها لا من غيره: المفتاح مركّب، والفراغ يمرّ (مادة بلا أقسام).
alter table public.content_units
  add column section_id uuid,
  add constraint fk_content_units_section
    foreign key (section_id, program_id)
    references public.material_sections (id, program_id) on delete restrict;

alter table public.content_units alter column label drop not null;
alter table public.content_units add constraint chk_content_units_label
  check (label is null or char_length(btrim(label)) > 0);

comment on column public.content_units.label is
  'نصّ البداية — اختياري منذ adr/0039. العرض يصوغ «الحديث ٥ من باب الطهارة» من القسم والصيغ، والنصّ إضافةٌ عليه.';

create index idx_content_units_section
  on public.content_units (section_id, sequence) where deleted_at is null;

-- ══ الحارس: الأقسام ووحداتها لا تُكتب إلا من دالتها ══

/**
 * ما يُزيح الأرقام المتّصلة — حجم القسم، وترتيبه، وحذفه، ووحدات الأقسام —
 * يُكتب من `fn_set_material_sections` وحدها، فهي التي تعيد الترقيم بعده.
 * وتعديل اسم القسم ونصّ الوحدة مفتوحان.
 */
create or replace function public.fn_guard_material_layout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.material_layout', true) is not distinct from 'on' then
    return new;
  end if;

  if tg_table_name = 'material_sections' then
    if tg_op = 'INSERT'
       or new.unit_count is distinct from old.unit_count
       or new.sort_order is distinct from old.sort_order
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'الأبواب تُكتب من شاشة المادة: حجم الباب وترتيبه وحذفه يُعيد ترقيم وحداته'
        using errcode = '23514';
    end if;
  else
    if (tg_op = 'INSERT' and new.section_id is not null)
       or (tg_op = 'UPDATE' and old.section_id is not null and (
             new.section_id is distinct from old.section_id
             or new.sequence is distinct from old.sequence
             or (new.deleted_at is not null and old.deleted_at is null))) then
      raise exception 'وحدات الباب تتبع عدده: غيّر عدد وحدات الباب بدل إضافة وحدة أو حذفها'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_material_sections_layout
  before insert or update on public.material_sections
  for each row execute function public.fn_guard_material_layout();

create trigger trg_content_units_layout
  before insert or update of section_id, sequence, deleted_at on public.content_units
  for each row execute function public.fn_guard_material_layout();

-- ══ كتابة الأقسام ══

/**
 * يضبط أقسام المادة **بالقائمة كاملة**: `[{ id?, name, count }]` بترتيبها.
 *
 * - القسم بمعرّفه يبقى بوحداته ونصوصها، ويُعدَّل اسمه وحجمه وموضعه.
 * - القسم بلا معرّف يُنشأ، ويضمّ أول الوحدات التي بلا قسم بترتيب أرقامها —
 *   فمادةٌ لُصقت نصوصها قبل تقسيمها لا تُعاد.
 * - القسم الغائب عن القائمة يُحذف بوحداته.
 *
 * ثم يُعاد الترقيم: كل قسم يبدأ بعد ما قبله، ووحداته متّصلة، والزائد عن حجمه
 * يُحذف من آخره، والناقص يُولَّد بلا نصّ. **ولا يُمسّ رقمٌ لا يتغيّر** — فإضافة
 * قسم في الآخر لا تلمس ما قبله، والحارس `fn_guard_content_unit_change` يرفض
 * كل إزاحة لوحدة داخل نصيب مسار.
 *
 * `security invoker`: الكتابة تمرّ بسياسات الصفوف (`programs.write`).
 */
create or replace function public.fn_set_material_sections(p_program_id uuid, p_sections jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_offset constant int := 10000000;
  v_item   jsonb;
  v_index  bigint;
  v_id     uuid;
  v_new    uuid[] := '{}';
  v_kept   uuid[] := '{}';
  v_total  bigint := 0;
  v_name   text;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على مادة هذا البرنامج' using errcode = '42501';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'قائمة الأبواب غير صالحة' using errcode = '22023';
  end if;

  -- ── التحقّق قبل أي كتابة ──
  for v_item, v_index in select e, i from jsonb_array_elements(p_sections) with ordinality as t(e, i) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    if v_name = '' then
      raise exception 'الباب %: اسمه مطلوب', v_index using errcode = '23514';
    end if;
    -- CASE لا OR: ترتيب تقييم OR غير مضمون، فقد يُحوَّل النصّ رقماً قبل فحصه.
    -- وبين قوسين: شرط IF يُقرأ حتى أول THEN، وللـCASE نفسه THEN.
    if (case when coalesce(v_item ->> 'count', '') ~ '^[0-9]{1,6}$'
             then (v_item ->> 'count')::int else 0 end) < 1 then
      raise exception 'الباب «%»: عدد وحداته عدد صحيح موجب', v_name using errcode = '23514';
    end if;
    v_total := v_total + (v_item ->> 'count')::int;
    if v_item ? 'id' and jsonb_typeof(v_item -> 'id') = 'string' then
      if not exists (
        select 1 from public.material_sections s
        where s.id = (v_item ->> 'id')::uuid
          and s.program_id = p_program_id
          and s.deleted_at is null
      ) then
        raise exception 'الباب «%» غير موجود في هذه المادة', v_name using errcode = '22023';
      end if;
      v_kept := v_kept || (v_item ->> 'id')::uuid;
    end if;
  end loop;

  if v_total > 100000 then
    raise exception 'المادة أكبر من ١٠٠٬٠٠٠ وحدة' using errcode = '23514';
  end if;

  select btrim(e ->> 'name') into v_name
  from jsonb_array_elements(p_sections) e
  group by btrim(e ->> 'name')
  having count(*) > 1
  limit 1;
  if v_name is not null then
    raise exception 'اسم الباب «%» مكرر', v_name using errcode = '23514';
  end if;

  if cardinality(v_kept) <> (select count(distinct k) from unnest(v_kept) k) then
    raise exception 'الباب الواحد ورد مرتين في القائمة' using errcode = '22023';
  end if;

  -- ── الكتابة ──
  perform pg_advisory_xact_lock(hashtextextended('material:' || p_program_id::text, 0));
  perform set_config('app.material_layout', 'on', true);

  -- الأسماء تُركَن أولاً: تبادل اسمين بين قسمين يصطدم بفهرس التفرّد صفّاً صفّاً.
  update public.material_sections s
  set name = s.id::text
  where s.program_id = p_program_id and s.deleted_at is null and s.id = any (v_kept);

  update public.material_sections s
  set deleted_at = now()
  where s.program_id = p_program_id and s.deleted_at is null and not (s.id = any (v_kept));

  for v_item, v_index in select e, i from jsonb_array_elements(p_sections) with ordinality as t(e, i) loop
    if v_item ? 'id' and jsonb_typeof(v_item -> 'id') = 'string' then
      update public.material_sections
      set name = btrim(v_item ->> 'name'),
          unit_count = (v_item ->> 'count')::int,
          sort_order = v_index::int
      where id = (v_item ->> 'id')::uuid;
    else
      insert into public.material_sections (program_id, name, sort_order, unit_count)
      values (p_program_id, btrim(v_item ->> 'name'), v_index::int, (v_item ->> 'count')::int)
      returning id into v_id;
      v_new := v_new || v_id;
    end if;
  end loop;

  -- الأقسام الجديدة تضمّ ما بلا قسم، بترتيبها.
  foreach v_id in array v_new loop
    update public.content_units u
    set section_id = v_id
    where u.id in (
      select c.id from public.content_units c
      where c.program_id = p_program_id and c.deleted_at is null and c.section_id is null
      order by c.sequence
      limit (select s.unit_count from public.material_sections s where s.id = v_id)
    );
  end loop;

  -- ── إعادة الترقيم ──

  -- وحدات القسم المحذوف تُحذف معه.
  update public.content_units u
  set deleted_at = now()
  from public.material_sections s
  where u.section_id = s.id
    and s.deleted_at is not null
    and u.program_id = p_program_id
    and u.deleted_at is null;

  -- والزائد عن حجم القسم يُحذف من آخره.
  with ranked as (
    select u.id,
           row_number() over (partition by u.section_id order by u.sequence) as rn,
           s.unit_count
    from public.content_units u
    join public.material_sections s on s.id = u.section_id and s.deleted_at is null
    where u.program_id = p_program_id and u.deleted_at is null
  )
  update public.content_units u
  set deleted_at = now()
  from ranked r
  where u.id = r.id and r.rn > r.unit_count;

  -- الرقم المستهدف: القسم يبدأ بعد ما قبله، وما بلا قسم يلي الأقسام كلها.
  -- على مرحلتين: فهرس التفرّد يُفحص صفّاً صفّاً، فالإزاحة المباشرة تصطدم بنفسها.
  with secs as (
    select s.id,
           coalesce(sum(s.unit_count) over (
             order by s.sort_order, s.created_at
             rows between unbounded preceding and 1 preceding), 0)::int as base
    from public.material_sections s
    where s.program_id = p_program_id and s.deleted_at is null
  ),
  total as (
    select coalesce(sum(s.unit_count), 0)::int as units
    from public.material_sections s
    where s.program_id = p_program_id and s.deleted_at is null
  ),
  targets as (
    select u.id,
           (sc.base + row_number() over (partition by u.section_id order by u.sequence))::int as target
    from public.content_units u
    join secs sc on sc.id = u.section_id
    where u.program_id = p_program_id and u.deleted_at is null
    union all
    select u.id,
           ((select units from total) + row_number() over (order by u.sequence))::int
    from public.content_units u
    where u.program_id = p_program_id and u.deleted_at is null and u.section_id is null
  )
  update public.content_units u
  set sequence = t.target + v_offset
  from targets t
  where u.id = t.id and u.sequence <> t.target;

  update public.content_units u
  set sequence = u.sequence - v_offset
  where u.program_id = p_program_id and u.deleted_at is null and u.sequence > v_offset;

  -- الناقص يُولَّد بلا نصّ، في آخر قسمه.
  with secs as (
    select s.id, s.unit_count,
           coalesce(sum(s.unit_count) over (
             order by s.sort_order, s.created_at
             rows between unbounded preceding and 1 preceding), 0)::int as base
    from public.material_sections s
    where s.program_id = p_program_id and s.deleted_at is null
  )
  insert into public.content_units (program_id, section_id, sequence)
  select p_program_id, sc.id, sc.base + g
  from secs sc
  cross join lateral generate_series(1, sc.unit_count) g
  where not exists (
    select 1 from public.content_units u
    where u.program_id = p_program_id
      and u.deleted_at is null
      and u.sequence = sc.base + g
  );

  perform set_config('app.material_layout', 'off', true);
end;
$$;

comment on function public.fn_set_material_sections(uuid, jsonb) is
  'adr/0039 | يضبط أقسام المادة بالقائمة كاملة ثم يعيد ترقيم الوحدات. لا يُمسّ رقمٌ لا يتغيّر، والإزاحة تحت نصيب مسار يرفضها حارس الوحدة.';

/**
 * نصوص وحدات قائمة، سطراً لكل وحدة من رقم البداية. لا تُنشئ وحدة: في المادة
 * المقسّمة تولد الوحدات من أقسامها وحدها. والسطر الفارغ لا يُرسَل أصلاً.
 */
create or replace function public.fn_set_unit_labels(p_program_id uuid, p_start int, p_labels text[])
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_last  int;
  v_count int;
begin
  if not public.fn_has_permission('programs.write', p_program_id) then
    raise exception 'لا صلاحية لك على مادة هذا البرنامج' using errcode = '42501';
  end if;
  if p_start is null or p_start < 1 or coalesce(cardinality(p_labels), 0) = 0 then
    raise exception 'أدخل سطراً واحداً على الأقل' using errcode = '22023';
  end if;

  select max(u.sequence) into v_last
  from public.content_units u
  where u.program_id = p_program_id and u.deleted_at is null;

  if v_last is null or p_start + cardinality(p_labels) - 1 > v_last then
    raise exception 'السطور تتجاوز آخر وحدة في المادة (%). أنقص السطور أو زِد عدد وحدات الباب', coalesce(v_last, 0)
      using errcode = '23514';
  end if;

  update public.content_units u
  set label = nullif(btrim(l.label), '')
  from unnest(p_labels) with ordinality as l(label, i)
  where u.program_id = p_program_id
    and u.deleted_at is null
    and u.sequence = p_start + l.i::int - 1;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.fn_set_unit_labels(uuid, int, text[]) is
  'adr/0039 | يكتب نصوص وحدات قائمة من رقم البداية. لا يُنشئ وحدات.';

-- ══ السياسات ══

create policy material_sections_read on public.material_sections
  for select to authenticated
  using (public.fn_has_permission('programs.read', program_id));
create policy material_sections_insert on public.material_sections
  for insert to authenticated
  with check (public.fn_has_permission('programs.write', program_id));
create policy material_sections_update on public.material_sections
  for update to authenticated
  using (public.fn_has_permission('programs.write', program_id))
  with check (public.fn_has_permission('programs.write', program_id));

-- المشارك يقرأ أقسام مادته ليُعرض له «الحديث ٥ من باب الطهارة».
create policy material_sections_read_participant on public.material_sections
  for select to authenticated
  using (
    material_sections.program_id in (
      select program_id from public.participants
      where user_id = (select auth.uid()) and public.fn_follows_plan(status) and deleted_at is null
    )
  );

-- ══ المنح ══

revoke all on public.material_sections from anon, authenticated, service_role;
grant select, insert, update on public.material_sections to authenticated;

revoke all on function public.fn_guard_material_layout() from public;
revoke all on function public.fn_set_material_sections(uuid, jsonb) from public;
revoke all on function public.fn_set_unit_labels(uuid, int, text[]) from public;
grant execute on function public.fn_set_material_sections(uuid, jsonb) to authenticated;
grant execute on function public.fn_set_unit_labels(uuid, int, text[]) to authenticated;
