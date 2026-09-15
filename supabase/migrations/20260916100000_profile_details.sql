-- 036 | بيانات الحساب الكاملة: الاسم الرباعي، الجوال الدولي، الجنس، الميلاد، الجنسية
--
-- الملف كان «اسماً كاملاً» نصّاً حرّاً و«جوالاً» بالصيغة السعودية المحلية. وقرار
-- الراعي (١٦ سبتمبر ٢٠٢٦): الاسم أجزاءً — الأول والأب والعائلة إلزامية والجد
-- اختياري — والجوال بمفتاح دولته، ورقم إضافي اختياري، والجنس والميلاد والجنسية
-- إلزامية. تُسأل مرة للحساب كله، وتبني عليها البرامج شروطها (العمر، الجنس).
--
-- **الأعمدة تقبل الفراغ** لأن الصفوف القائمة بلا قيم. والإلزام يُحكم به
-- «الاكتمال» (`fn_profile_is_complete`): الحساب الناقص يُحوَّل إلى «أكمل حسابك»
-- قبل أي شاشة، فتُستكمل الحسابات القديمة مرة واحدة عند أول دخول.
--
-- **و`full_name` يبقى:** شاشات كثيرة تقرؤه، فيُحسب من الأجزاء بمشغّل بدل أن
-- تُعدَّل كلها.
--
-- تراجع: نعم.

create type public.gender as enum ('male', 'female');

alter table public.profiles
  add column first_name       text,
  add column father_name      text,
  add column grandfather_name text,
  add column family_name      text,
  add column gender           public.gender,
  add column birth_date       date,
  add column nationality      text,
  add column phone_secondary  text;

comment on column public.profiles.phone is
  'بالصيغة الدولية (+9665…). فارغ حتى الاستكمال، والاكتمال يشترطه. يُطبَّع في lib/profile/phone.ts.';
comment on column public.profiles.nationality is
  'رمز الدولة من حرفين (ISO 3166-1) — SA · EG. الاسم يُعرض بالعربية في الشاشة.';
comment on column public.profiles.full_name is
  'يُحسب من أجزاء الاسم متى وُجد الاسم الأول (fn_profiles_compose_name). الصفوف القديمة تحمله نصّاً.';

-- ══ الصيغ — تُفرض على القيم غير الفارغة ══
alter table public.profiles add constraint chk_profiles_name_parts check (
  (first_name is null or char_length(first_name) between 2 and 40)
  and (father_name is null or char_length(father_name) between 2 and 40)
  and (grandfather_name is null or char_length(grandfather_name) between 2 and 40)
  and (family_name is null or char_length(family_name) between 2 and 40)
);

alter table public.profiles add constraint chk_profiles_nationality
  check (nationality is null or nationality ~ '^[A-Z]{2}$');

-- التاريخ في المستقبل يُرفض عند الكتابة. `current_date` ليست ثابتة فلا تصلح
-- قيداً — فالمشغّل أدناه يفحصها.
alter table public.profiles add constraint chk_profiles_birth_date
  check (birth_date is null or birth_date >= date '1900-01-01');

alter table public.profiles add constraint chk_profiles_phone_secondary check (
  phone_secondary is null
  or (phone_secondary ~ '^\+[1-9][0-9]{7,14}$' and phone_secondary <> phone)
);

-- **الجوال يقبل الفراغ حتى الاستكمال.** القيد لا يُضاف `not valid`: القيد غير
-- المُتحقَّق يُفحص عند كل تعديل للصفّ، فكان إيقاف مستخدمٍ بجوال قديم يُرفض. فالقديم
-- يُحوَّل هنا: `05xxxxxxxx` إلى `+9665xxxxxxxx`، وما لا يُعرف يصير فراغاً —
-- وصاحبه يُطلب منه الجوال لأن الاكتمال يشترطه.
alter table public.profiles alter column phone drop not null;

update public.profiles
set phone = case
  when phone ~ '^\+[1-9][0-9]{7,14}$' then phone
  when phone ~ '^05[0-9]{8}$' then '+966' || substr(phone, 2)
  else null
end
where phone is null or phone !~ '^\+[1-9][0-9]{7,14}$';

alter table public.profiles add constraint chk_profiles_phone_e164
  check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

-- ══ الاسم الكامل من أجزائه، والميلاد لا يسبق اليوم ══
create or replace function public.fn_profiles_compose_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.first_name is not null then
    new.full_name := concat_ws(' ', new.first_name, new.father_name, new.grandfather_name, new.family_name);
  end if;

  if new.birth_date is not null and new.birth_date > current_date then
    raise exception 'تاريخ الميلاد لا يكون في المستقبل' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_profiles_compose_name
  before insert or update on public.profiles
  for each row execute function public.fn_profiles_compose_name();

revoke all on function public.fn_profiles_compose_name() from public;

-- ══ الاكتمال — نظير `isProfileComplete` في lib/auth/account-state.ts ══
create or replace function public.fn_profile_is_complete(p public.profiles)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p.first_name is not null
     and p.father_name is not null
     and p.family_name is not null
     and p.gender is not null
     and p.birth_date is not null
     and p.nationality is not null
     and p.phone ~ '^\+[1-9][0-9]{7,14}$';
$$;

revoke all on function public.fn_profile_is_complete(public.profiles) from public;
grant execute on function public.fn_profile_is_complete(public.profiles) to authenticated;

-- ══ الملف لحظة إنشاء الحساب: مكتملاً أو لا شيء ══
-- من الهجرة ٠٣١. لا ينشئ ملفاً ناقصاً: الناقص يُستكمل في صفحته، والملف الذي
-- يُنشأ نصفه يُخفي عن الجلسة أنه ناقص حتى يُفحص كل عمود.
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(m ->> 'first_name', '') = ''
     or coalesce(m ->> 'father_name', '') = ''
     or coalesce(m ->> 'family_name', '') = ''
     or coalesce(m ->> 'gender', '') not in ('male', 'female')
     or coalesce(m ->> 'birth_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(m ->> 'nationality', '') !~ '^[A-Z]{2}$'
     or coalesce(m ->> 'phone', '') !~ '^\+[1-9][0-9]{7,14}$' then
    return new;
  end if;

  begin
    insert into public.profiles (
      user_id, full_name, phone, first_name, father_name, grandfather_name, family_name,
      gender, birth_date, nationality, phone_secondary
    ) values (
      new.id, '', m ->> 'phone', m ->> 'first_name', m ->> 'father_name',
      nullif(m ->> 'grandfather_name', ''), m ->> 'family_name',
      (m ->> 'gender')::public.gender, (m ->> 'birth_date')::date, m ->> 'nationality',
      nullif(m ->> 'phone_secondary', '')
    )
    on conflict (user_id) do nothing;
  exception when check_violation or invalid_datetime_format or datetime_field_overflow then
    -- بيانات لا تحقّق القيود: لا ملف، فيُستكمل في صفحته. ولا يُرفض إنشاء الحساب نفسه.
    null;
  end;

  return new;
end;
$$;
